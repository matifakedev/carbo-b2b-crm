import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROLE_LABELS, STAGE_LABELS } from "@/lib/projects";
import {
  ANSWER_SCHEMA, ANSWER_SYSTEM, EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, describeScope, sanitizeProposals, validateAnswer,
  type BrainAnswer, type ContextRecord, type ProposalItem,
} from "@/lib/brain";

const MODEL = "openai/gpt-6-astra" as const;
type Fail = { status: "not_configured" } | { status: "error"; message: string };

async function callModel(system: string, user: string, name: string, schema: unknown): Promise<{ ok: true; json: unknown } | Fail> {
  if (!process.env["LOVABLE_API_KEY"]) return { status: "not_configured" };
  const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
  try {
    const res = await generateResponse({
      model: MODEL,
      instructions: system,
      input: user,
      text: { format: { type: "json_schema", name, strict: true, schema: schema as Record<string, unknown> } },
    });
    const out = (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? [];
    const text = out.flatMap((o) => (o.type === "message" ? o.content ?? [] : [])).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    if (!text) return { status: "error", message: "El proveedor no devolvió contenido (posible rechazo)." };
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    console.error("brain gateway error", e);
    if (e instanceof GatewayError) {
      if (e.code === "payment_required" || e.httpStatus === 402) return { status: "error", message: "Sin créditos de IA disponibles." };
      if (e.httpStatus === 429) return { status: "error", message: "Demasiadas consultas; probá en un momento." };
      if (e.httpStatus === 401) return { status: "not_configured" };
    }
    return { status: "error", message: "El proveedor de IA falló. Probá de nuevo." };
  }
}

/* ---------------- Analyze pasted document ---------------- */

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; kind: "email" | "notes" | "transcript"; title: string; text: string; conversation_id?: string | null }) => {
    if (!d.title.trim() || !d.text.trim()) throw new Error("Título y texto son obligatorios");
    if (d.text.length > 60000) throw new Error("El texto es demasiado largo (máx. 60.000 caracteres)");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // RLS rejects inserts outside the caller's workspaces.
    const { data: doc, error } = await sb.from("source_documents").insert({
      workspace_id: data.workspace_id, kind: data.kind, title: data.title.trim(), original_text: data.text, conversation_id: data.conversation_id ?? null,
    }).select("id").single();
    if (error) throw new Error("No se pudo guardar el original: " + error.message);
    const { data: ex, error: e2 } = await sb.from("brain_extractions").insert({ workspace_id: data.workspace_id, source_document_id: doc.id, model: MODEL }).select("id").single();
    if (e2) throw new Error(e2.message);

    const r = await callModel(EXTRACTION_SYSTEM, `<documento tipo="${data.kind}">\n${data.text}\n</documento>`, "extraction", EXTRACTION_SCHEMA);
    if (!("ok" in r)) {
      await sb.from("brain_extractions").update({ status: "failed", error: r.status === "error" ? r.message : "Proveedor sin configurar" }).eq("id", ex.id);
      return { ...r, extraction_id: ex.id };
    }
    const items = sanitizeProposals(((r.json as { items?: ProposalItem[] }).items ?? []), data.text);
    if (items.length) {
      const { error: e3 } = await sb.from("brain_proposals").insert(items.map((i, position) => ({
        workspace_id: data.workspace_id, extraction_id: ex.id, kind: i.kind, proposed: i as never, evidence: i.evidence, ambiguity: i.ambiguity, position,
      })));
      if (e3) throw new Error(e3.message);
    }
    return { status: "ok" as const, extraction_id: ex.id };
  });

/* ---------------- Contextual Q&A ---------------- */

type Focus = "person" | "organization" | "introduction" | "conversation" | "project" | "opportunity";

// Dynamic table names: typed loosely on purpose; every query is filtered by workspace_id and RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = { from: (t: string) => any };
async function gather(sb: LooseSb, ws: string, type: Focus, id: string): Promise<ContextRecord[]> {
  const recs = new Map<string, ContextRecord>();
  const add = (t: string, row: Record<string, unknown> | null | undefined, label: string) => {
    if (!row || !row["id"]) return;
    const { created_by, updated_by, workspace_id, normalized_name, ...rest } = row as Record<string, unknown>;
    void created_by; void updated_by; void workspace_id; void normalized_name;
    recs.set(`${t}:${row["id"]}`, { ref: `${t}:${row["id"]}`, type: t, label, data: rest });
  };
  const q = (t: string) => sb.from(t).select("*").eq("workspace_id", ws);
  const personIds = new Set<string>(); const orgIds = new Set<string>(); const introIds = new Set<string>(); const convIds = new Set<string>();
  if (type === "person") personIds.add(id);
  if (type === "organization") orgIds.add(id);
  if (type === "introduction") introIds.add(id);
  if (type === "conversation") convIds.add(id);
  const projIds = new Set<string>(); const oppIds = new Set<string>();
  if (type === "project") projIds.add(id);
  if (type === "opportunity") {
    const { data: o } = await q("opportunities").eq("id", id).maybeSingle();
    if (o) { oppIds.add(id); projIds.add(o.project_id); }
  }
  if (type === "person" || type === "organization") {
    const { data: pp } = await q("project_participants").eq(type === "person" ? "person_id" : "organization_id", id);
    for (const x of pp ?? []) projIds.add(x.project_id);
    if (type === "organization") { const { data: po } = await q("project_organizations").eq("organization_id", id); for (const x of po ?? []) projIds.add(x.project_id); }
  }
  if (projIds.size) {
    const ids = [...projIds];
    const { data: ps } = await q("projects").in("id", ids);
    for (const p of ps ?? []) add("project", p, p.name);
    if (type === "project" || type === "opportunity") {
      const { data: parts } = await q("project_participants").in("project_id", ids);
      for (const x of parts ?? []) {
        add("participant", { ...x, role: ROLE_LABELS[x.role] ?? x.role }, `${ROLE_LABELS[x.role] ?? x.role}${x.unidentified_description ? " · sin identificar" : ""}`);
        if (x.person_id) personIds.add(x.person_id); if (x.organization_id) orgIds.add(x.organization_id);
      }
      const { data: po } = await q("project_organizations").in("project_id", ids);
      for (const x of po ?? []) orgIds.add(x.organization_id);
      const { data: opps } = await q("opportunities").in("project_id", ids);
      for (const o of opps ?? []) { if (type === "project" || o.id === id) { add("opportunity", { ...o, stage: STAGE_LABELS[o.stage] ?? o.stage }, o.title); oppIds.add(o.id); } }
      const { data: pt } = await q("tasks").in("project_id", ids);
      for (const t of pt ?? []) add("task", t, t.title);
    }
  }

  // conversation links around the focus
  if (type === "conversation") {
    const { data: l } = await sb.from("conversation_links").select("*").eq("workspace_id", ws).eq("conversation_id", id);
    for (const x of l ?? []) { if (x.person_id) personIds.add(x.person_id); if (x.organization_id) orgIds.add(x.organization_id); if (x.introduction_id) introIds.add(x.introduction_id); }
  } else {
    const col = type === "project" ? "project_id" : type === "opportunity" ? null : type === "person" ? "person_id" : type === "organization" ? "organization_id" : "introduction_id";
    if (col) {
      const { data: l } = await sb.from("conversation_links").select("conversation_id").eq("workspace_id", ws).eq(col, id);
      for (const x of l ?? []) convIds.add(x.conversation_id);
    }
  }
  if (type === "person") {
    const { data: intros } = await q("introductions").or(`introducer_person_id.eq.${id},introduced_person_id.eq.${id},target_person_id.eq.${id}`);
    for (const i of intros ?? []) introIds.add(i.id);
    const { data: links } = await q("person_links").or(`from_person_id.eq.${id},to_person_id.eq.${id}`);
    for (const l of links ?? []) { add("link", l, "Vínculo entre personas"); personIds.add(l.from_person_id); personIds.add(l.to_person_id); }
  }
  if (type === "organization") {
    const { data: intros } = await q("introductions").eq("target_org_id", id);
    for (const i of intros ?? []) introIds.add(i.id);
  }
  if (introIds.size) {
    const { data: intros } = await q("introductions").in("id", [...introIds]);
    for (const i of intros ?? []) {
      add("introduction", i, i.purpose ?? i.target_description ?? "Introducción");
      for (const k of ["introducer_person_id", "introduced_person_id", "target_person_id"]) if (i[k]) personIds.add(i[k]);
      if (i.target_org_id) orgIds.add(i.target_org_id);
    }
  }
  // affiliations for focus person/org
  const affQ = type === "person" ? q("affiliations").eq("person_id", id) : type === "organization" ? q("affiliations").eq("organization_id", id) : null;
  if (affQ) {
    const { data: affs } = await affQ;
    for (const a of affs ?? []) { add("affiliation", a, a.title ?? "Afiliación"); personIds.add(a.person_id); orgIds.add(a.organization_id); }
  }
  if (convIds.size) {
    const { data: convs } = await q("conversations").in("id", [...convIds]);
    for (const c of convs ?? []) add("conversation", c, c.title);
  }
  if (type === "project" || type === "opportunity") {
    if (oppIds.size) { const { data: ot } = await q("tasks").in("opportunity_id", [...oppIds]); for (const t of ot ?? []) add("task", t, t.title); }
  }
  const taskCol = type === "project" ? "project_id" : type === "opportunity" ? "opportunity_id" : type === "person" ? "person_id" : type === "organization" ? "organization_id" : type === "introduction" ? "introduction_id" : "conversation_id";
  const { data: tasks } = await q("tasks").eq(taskCol, id);
  for (const t of tasks ?? []) add("task", t, t.title);
  if (type !== "introduction" && type !== "project" && type !== "opportunity") {
    const { data: needs } = await q("needs").eq(taskCol, id);
    for (const n of needs ?? []) add("need", n, n.description);
  }
  if (personIds.size) {
    const { data: ps } = await q("people").in("id", [...personIds]);
    for (const p of ps ?? []) add("person", p, p.full_name);
  }
  if (orgIds.size) {
    const { data: os } = await q("organizations").in("id", [...orgIds]);
    for (const o of os ?? []) add("organization", o, o.name);
  }
  return [...recs.values()];
}

export const askBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; focus_type: Focus; focus_id: string; question: string }) => {
    if (!d.question.trim()) throw new Error("Escribí una pregunta");
    if (!["person", "organization", "introduction", "conversation", "project", "opportunity"].includes(d.focus_type)) throw new Error("Foco inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: member } = await sb.rpc("is_workspace_member", { _ws: data.workspace_id });
    if (!member) throw new Error("Sin acceso a este espacio");
    const records = await gather(sb as unknown as LooseSb, data.workspace_id, data.focus_type, data.focus_id);
    if (!records.some((r) => r.ref === `${data.focus_type}:${data.focus_id}`)) throw new Error("Registro no encontrado en este espacio");
    const scope = describeScope(records);
    const payload = `<registros>\n${JSON.stringify(records.map((r) => ({ ref: r.ref, ...r.data })))}\n</registros>\n\nFoco: ${data.focus_type}:${data.focus_id}\nPregunta: ${data.question}`;
    const r = await callModel(ANSWER_SYSTEM, payload, "answer", ANSWER_SCHEMA);
    if (!("ok" in r)) return { ...r, scope };
    const answer = validateAnswer(r.json as BrainAnswer, new Set(records.map((x) => x.ref)));
    const cited = records.map((x) => ({ ref: x.ref, type: x.type, label: x.label }));
    await sb.from("brain_queries").insert({ workspace_id: data.workspace_id, focus_type: data.focus_type, focus_id: data.focus_id, question: data.question, answer: answer as never, cited: cited as never, model: MODEL });
    return { status: "ok" as const, answer, scope, records: cited };
  });
