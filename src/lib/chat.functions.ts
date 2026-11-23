import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RECORD_TABLES, ROLE_VALUES, TOOLS, queryNamesPerson, researchForChat, pickAllowed, stripInventedNumbers, systemPrompt, validIsoDate, type RecordType } from "@/lib/chat-agent";

const MODEL = "openai/gpt-6-astra" as const;
const MAX_STEPS = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
export type ActionCard = { id: string; summary: string; table: string; record_id: string; op: "create" | "update"; link: { type: string; id: string } | null };
export type Question = { question: string; options: string[] };
export type ResearchCard = { run_id: string; organization_id: string; organization: string; status: string; errors: string[]; proposals: number };
type Ctx = { sb: Sb; ws: string; uid: string; thread: string; userText: string; actions: ActionCard[]; question: Question | null; detail: string; research: ResearchCard[] };

const LINK: Record<string, string> = { people: "person", organizations: "organization", projects: "project", tasks: "task" };

async function logAction(c: Ctx, table: string, record_id: string, op: "create" | "update", summary: string, before: unknown = null, after: unknown = null, link?: { type: string; id: string }) {
  const { data, error } = await c.sb.from("brain_actions").insert({ workspace_id: c.ws, thread_id: c.thread, table_name: table, record_id, op, summary, before, after }).select("id").single();
  if (error) throw new Error(error.message);
  c.actions.push({ id: data.id, summary, table, record_id, op, link: link ?? (LINK[table] ? { type: LINK[table]!, id: record_id } : null) });
}
const nn = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
async function inWs(c: Ctx, table: string, id: unknown) {
  if (typeof id !== "string" || !id) return false;
  const { data } = await c.sb.from(table).select("id").eq("id", id).eq("workspace_id", c.ws).maybeSingle();
  return !!data;
}

async function runTool(c: Ctx, name: string, a: Record<string, unknown>): Promise<unknown> {
  const sb = c.sb;
  switch (name) {
    case "search_records": {
      const q = String(a["query"] ?? "").trim().slice(0, 100); if (!q) return { results: [] };
      const like = `%${q.replace(/[%_,()]/g, " ")}%`;
      const [p, o, pr, t, dp] = await Promise.all([
        sb.from("people").select("id, full_name, archived_at, affiliations(title, organizations(name))").eq("workspace_id", c.ws).ilike("full_name", like).limit(10),
        sb.from("organizations").select("id, name, location, archived_at").eq("workspace_id", c.ws).ilike("name", like).limit(10),
        sb.from("projects").select("id, name, need, archived_at").eq("workspace_id", c.ws).ilike("name", like).limit(10),
        sb.from("tasks").select("id, title, status, due_date").eq("workspace_id", c.ws).ilike("title", like).limit(10),
        sb.rpc("find_person_duplicates", { _ws: c.ws, _name: q }),
      ]);
      const people = [...(p.data ?? [])];
      for (const d of dp.data ?? []) if (!people.some((x: { id: string }) => x.id === d.id)) people.push({ id: d.id, full_name: d.full_name, similar: true });
      return { people, organizations: o.data ?? [], projects: pr.data ?? [], tasks: t.data ?? [] };
    }
    case "get_record": {
      const type = a["type"] as RecordType; const table = RECORD_TABLES[type]; if (!table) return { error: "tipo inválido" };
      const sel = type === "person" ? "*, affiliations(*, organizations(id, name)), person_contacts(kind, value)" : type === "organization" ? "*, affiliations(*, people(id, full_name))" : type === "project" ? "*, project_participants(*), project_organizations(organization_id), opportunities(id, title, stage, in_pipeline)" : "*";
      const { data } = await sb.from(table).select(sel).eq("id", a["id"]).eq("workspace_id", c.ws).maybeSingle();
      if (!data) return { error: "no encontrado" };
      const { data: tasks } = type !== "task" ? await sb.from("tasks").select("id, title, status, due_date").eq(`${type === "organization" ? "organization" : type}_id`, a["id"]).limit(20) : { data: null };
      return { record: data, tasks };
    }
    case "create_person": {
      const full_name = nn(a["full_name"]); if (!full_name) return { error: "falta el nombre" };
      if (!a["force_new"]) {
        const { data: d } = await sb.rpc("find_person_duplicates", { _ws: c.ws, _name: full_name, _contacts: [a["email"], a["phone"]].filter((x) => typeof x === "string" && x) });
        if (d?.length) return { created: false, needs_confirmation: true, candidates: d.map((x: { id: string; full_name: string; reason: string; archived: boolean }) => ({ id: x.id, full_name: x.full_name, reason: x.reason, archived: x.archived })) };
      }
      const { data, error } = await sb.from("people").insert({ workspace_id: c.ws, full_name, relationship_context: nn(a["relationship_context"]), location: nn(a["location"]), source_type: "personal", source_detail: c.detail }).select("id").single();
      if (error) return { error: error.message };
      await logAction(c, "people", data.id, "create", `Creé la persona ${full_name}`);
      for (const [kind, v] of [["email", a["email"]], ["phone", a["phone"]]] as const) {
        const value = nn(v); if (!value) continue;
        const { data: pc } = await sb.from("person_contacts").insert({ workspace_id: c.ws, person_id: data.id, kind, value, source_detail: c.detail }).select("id").single();
        if (pc) await logAction(c, "person_contacts", pc.id, "create", `Agregué ${kind === "email" ? "el email" : "el teléfono"} ${value} a ${full_name}`, null, null, { type: "person", id: data.id });
      }
      return { created: true, id: data.id };
    }
    case "create_organization": {
      const n = nn(a["name"]); if (!n) return { error: "falta el nombre" };
      if (!a["force_new"]) {
        const { data: d } = await sb.rpc("find_org_duplicates", { _ws: c.ws, _name: n });
        if (d?.length) return { created: false, needs_confirmation: true, candidates: d };
      }
      const { data, error } = await sb.from("organizations").insert({ workspace_id: c.ws, name: n, location: nn(a["location"]), website: nn(a["website"]), description: nn(a["description"]), source_type: "personal", source_detail: c.detail }).select("id").single();
      if (error) return { error: error.message };
      await logAction(c, "organizations", data.id, "create", `Creé la organización ${n}`);
      return { created: true, id: data.id };
    }
    case "add_affiliation": {
      if (!(await inWs(c, "people", a["person_id"])) || !(await inWs(c, "organizations", a["organization_id"]))) return { error: "persona u organización no encontrada" };
      const { data: ex } = await sb.from("affiliations").select("id").eq("person_id", a["person_id"]).eq("organization_id", a["organization_id"]).is("archived_at", null).maybeSingle();
      if (ex) return { exists: true, id: ex.id };
      const { data, error } = await sb.from("affiliations").insert({ workspace_id: c.ws, person_id: a["person_id"], organization_id: a["organization_id"], title: nn(a["title"]), source_type: "personal", source_detail: c.detail }).select("id, people(full_name), organizations(name)").single();
      if (error) return { error: error.message };
      await logAction(c, "affiliations", data.id, "create", `Vinculé a ${data.people?.full_name} con ${data.organizations?.name}${nn(a["title"]) ? ` como ${nn(a["title"])}` : ""}`, null, null, { type: "person", id: a["person_id"] as string });
      return { created: true, id: data.id };
    }
    case "add_person_link": {
      if (!(await inWs(c, "people", a["to_person_id"]))) return { error: "persona destino no encontrada" };
      let from = nn(a["from_person_id"]);
      if (!from) {
        const { data: m } = await sb.from("workspace_members").select("person_id, display_name, email").eq("workspace_id", c.ws).eq("user_id", c.uid).single();
        from = m?.person_id ?? null;
        if (!from) {
          const name = nn(m?.display_name) ?? nn(m?.email);
          if (!name) return { error: "No tengo tu nombre para crear tu ficha; pedile al usuario que se asocie en Equipo." };
          const { data: me, error } = await sb.from("people").insert({ workspace_id: c.ws, full_name: name, source_type: "personal", source_detail: "Ficha del miembro del equipo" }).select("id").single();
          if (error) return { error: error.message };
          const { error: e2 } = await sb.rpc("set_my_person", { _ws: c.ws, _person: me.id });
          if (e2) return { error: e2.message };
          await logAction(c, "people", me.id, "create", `Creé tu ficha (${name}) y la asocié a tu usuario`);
          from = me.id as string;
        }
      } else if (!(await inWs(c, "people", from))) return { error: "persona origen no encontrada" };
      if (from === a["to_person_id"]) return { error: "misma persona" };
      const { data: ex } = await sb.from("person_links").select("id").eq("workspace_id", c.ws).is("archived_at", null).or(`and(from_person_id.eq.${from},to_person_id.eq.${a["to_person_id"]}),and(from_person_id.eq.${a["to_person_id"]},to_person_id.eq.${from})`).maybeSingle();
      if (ex) return { exists: true, id: ex.id };
      const { data, error } = await sb.from("person_links").insert({ workspace_id: c.ws, from_person_id: from, to_person_id: a["to_person_id"], kind: a["kind"], context: nn(a["context"]), source_type: "personal", source_detail: c.detail }).select("id, to:to_person_id(full_name), fr:from_person_id(full_name)").single();
      if (error) return { error: error.message };
      await logAction(c, "person_links", data.id, "create", `Vinculé en la red a ${data.fr?.full_name} con ${data.to?.full_name}`, null, null, { type: "person", id: a["to_person_id"] as string });
      return { created: true, id: data.id };
    }
    case "add_contact": {
      if (!(await inWs(c, "people", a["person_id"]))) return { error: "persona no encontrada" };
      const value = nn(a["value"]); if (!value) return { error: "valor vacío" };
      const { data, error } = await sb.from("person_contacts").insert({ workspace_id: c.ws, person_id: a["person_id"], kind: a["kind"], value, source_detail: c.detail }).select("id").single();
      if (error) return { error: error.message };
      await logAction(c, "person_contacts", data.id, "create", `Agregué el contacto ${value}`, null, null, { type: "person", id: a["person_id"] as string });
      return { created: true };
    }
    case "create_task": {
      const title = nn(a["title"]); if (!title) return { error: "falta el título" };
      const due = a["due_date"] == null ? null : validIsoDate(a["due_date"]);
      if (a["due_date"] != null && !due) return { error: "fecha inválida; usá YYYY-MM-DD o preguntá" };
      for (const [t, k] of [["people", "person_id"], ["organizations", "organization_id"], ["projects", "project_id"]] as const) if (a[k] && !(await inWs(c, t, a[k]))) return { error: `${k} no encontrado` };
      if (a["owner_user_id"]) { const { data: m } = await sb.from("workspace_members").select("user_id").eq("workspace_id", c.ws).eq("user_id", a["owner_user_id"]).maybeSingle(); if (!m) return { error: "responsable no es miembro" }; }
      const { data, error } = await sb.from("tasks").insert({ workspace_id: c.ws, title, context: nn(a["context"]), due_date: due, owner_user_id: a["owner_user_id"] || null, person_id: a["person_id"] || null, organization_id: a["organization_id"] || null, project_id: a["project_id"] || null }).select("id").single();
      if (error) return { error: error.message };
      await logAction(c, "tasks", data.id, "create", `Agregué la tarea «${title}»${due ? ` para el ${due}` : ""}`, null, null, a["project_id"] ? { type: "project", id: a["project_id"] as string } : a["person_id"] ? { type: "person", id: a["person_id"] as string } : a["organization_id"] ? { type: "organization", id: a["organization_id"] as string } : { type: "task", id: data.id });
      return { created: true, id: data.id };
    }
    case "update_record": {
      const type = a["type"] as RecordType; const table = RECORD_TABLES[type]; if (!table) return { error: "tipo inválido" };
      let fields: Record<string, unknown>; try { fields = JSON.parse(String(a["fields_json"] ?? "{}")); } catch { return { error: "fields_json inválido" }; }
      fields = pickAllowed(type, fields);
      let dropped: string[] = [];
      if (type === "project") ({ fields, dropped } = stripInventedNumbers(fields, c.userText));
      if (type === "task" && "due_date" in fields && fields["due_date"] != null && !validIsoDate(fields["due_date"])) return { error: "fecha inválida" };
      if (!Object.keys(fields).length) return { error: "sin campos válidos", dropped };
      const { data: before } = await sb.from(table).select(Object.keys(fields).join(", ")).eq("id", a["id"]).eq("workspace_id", c.ws).maybeSingle();
      if (!before) return { error: "no encontrado" };
      const { error } = await sb.from(table).update(fields).eq("id", a["id"]);
      if (error) return { error: error.message };
      await logAction(c, table, a["id"] as string, "update", `Actualicé ${Object.keys(fields).join(", ")} de ${type === "person" ? "la persona" : type === "organization" ? "la organización" : type === "project" ? "el proyecto" : "la tarea"}`, before, fields);
      return { updated: true, dropped_numbers_not_in_text: dropped };
    }
    case "log_conversation": {
      const title = nn(a["title"]) ?? "Nota"; const body = String(a["body"] ?? "");
      const { data, error } = await sb.from("conversations").insert({ workspace_id: c.ws, title, body, occurred_at: validIsoDate(a["occurred_at"]) ?? undefined }).select("id").single();
      if (error) return { error: error.message };
      const links: Record<string, unknown>[] = [];
      for (const id of (a["person_ids"] as string[]) ?? []) if (await inWs(c, "people", id)) links.push({ workspace_id: c.ws, conversation_id: data.id, person_id: id });
      for (const id of (a["organization_ids"] as string[]) ?? []) if (await inWs(c, "organizations", id)) links.push({ workspace_id: c.ws, conversation_id: data.id, organization_id: id });
      for (const id of (a["project_ids"] as string[]) ?? []) if (await inWs(c, "projects", id)) links.push({ workspace_id: c.ws, conversation_id: data.id, project_id: id });
      if (links.length) await sb.from("conversation_links").insert(links);
      await logAction(c, "conversations", data.id, "create", `Guardé la conversación «${title}» (${links.length} vínculos)`, null, null, null as never);
      return { created: true, id: data.id, links: links.length };
    }
    case "add_need": {
      const d = nn(a["description"]); if (!d) return { error: "vacía" };
      const { data, error } = await sb.from("needs").insert({ workspace_id: c.ws, description: d, evidence: nn(a["evidence"]), person_id: a["person_id"] || null, organization_id: a["organization_id"] || null }).select("id").single();
      if (error) return { error: error.message };
      await logAction(c, "needs", data.id, "create", `Registré la necesidad: ${d}`, null, null, a["organization_id"] ? { type: "organization", id: a["organization_id"] as string } : a["person_id"] ? { type: "person", id: a["person_id"] as string } : undefined);
      return { created: true };
    }
    case "create_project": {
      const n = nn(a["name"]); if (!n) return { error: "falta el nombre" };
      const { fields: nums, dropped } = stripInventedNumbers({ power_mw: a["power_mw"], energy_mwh: a["energy_mwh"], duration_h: a["duration_h"] }, c.userText);
      const { data, error } = await sb.from("projects").insert({ workspace_id: c.ws, name: n, need: nn(a["need"]), location: nn(a["location"]), evidence: nn(a["evidence"]), blockers: nn(a["blockers"]), next_milestone: nn(a["next_milestone"]), ...nums, source_type: "personal", source_detail: c.detail }).select("id").single();
      if (error) return { error: error.message };
      for (const o of (a["organization_ids"] as string[]) ?? []) if (await inWs(c, "organizations", o)) await sb.from("project_organizations").insert({ workspace_id: c.ws, project_id: data.id, organization_id: o });
      await logAction(c, "projects", data.id, "create", `Creé el proyecto ${n}`);
      return { created: true, id: data.id, dropped_numbers_not_in_text: dropped };
    }
    case "add_participant": {
      if (!(await inWs(c, "projects", a["project_id"]))) return { error: "proyecto no encontrado" };
      if (!ROLE_VALUES.includes(a["role"] as never)) return { error: "rol inválido" };
      const pid = a["person_id"] || null; const oid = pid ? null : a["organization_id"] || null; const un = pid || oid ? null : nn(a["unidentified_description"]);
      if (!pid && !oid && !un) return { error: "indicá persona, organización o descripción" };
      const { data, error } = await sb.from("project_participants").insert({ workspace_id: c.ws, project_id: a["project_id"], role: a["role"], person_id: pid, organization_id: oid, unidentified_description: un, notes: nn(a["notes"]), source_type: "personal", source_detail: c.detail }).select("id").single();
      if (error) return { error: error.message };
      await logAction(c, "project_participants", data.id, "create", `Agregué un participante (${a["role"]}) al proyecto`, null, null, { type: "project", id: a["project_id"] as string });
      return { created: true };
    }
    case "get_context": {
      const q = String(a["query"] ?? "").trim().slice(0, 100); const like = `%${q.replace(/[%_,()]/g, " ")}%`;
      const orgId = (await inWs(c, "organizations", a["organization_id"])) ? String(a["organization_id"]) : null;
      const [conv, runs, caps] = await Promise.all([
        q ? sb.from("conversations").select("id, title, occurred_at, body").eq("workspace_id", c.ws).is("archived_at", null).or(`title.ilike.${like},body.ilike.${like}`).limit(8) : { data: [] },
        (orgId ? sb.from("research_runs").select("id, status, focus, created_at, intro_draft, organization_id").eq("workspace_id", c.ws).eq("organization_id", orgId) : sb.from("research_runs").select("id, status, focus, created_at, intro_draft, organization_id, organizations!inner(name)").eq("workspace_id", c.ws).ilike("organizations.name", like)).order("created_at", { ascending: false }).limit(3),
        sb.from("carbo_capabilities").select("title, applications, limits, communicable").eq("workspace_id", c.ws).eq("status", "approved").is("archived_at", null).limit(20),
      ]);
      const runIds = (runs.data ?? []).map((r: { id: string }) => r.id);
      const f = runIds.length ? (await sb.from("research_findings").select("run_id, statement, condition, url, published_at, category, quote, fetched_at").in("run_id", runIds).limit(40)).data ?? [] : [];
      return { conversations: (conv.data ?? []).map((x: { body: string | null }) => ({ ...x, body: (x.body ?? "").slice(0, 600) })), research_runs: runs.data ?? [], findings: researchForChat(f), approved_capabilities: caps.data ?? [] };
    }
    case "find_organization_candidates": {
      const q = String(a["query"] ?? "").trim().slice(0, 150); if (!q) return { error: "consulta vacía" };
      const names = [...(await sb.from("people").select("full_name").eq("workspace_id", c.ws).limit(500)).data ?? []].map((x: { full_name: string }) => x.full_name);
      if (queryNamesPerson(q, names)) return { error: "No se buscan personas en la web. Buscá solo la organización." };
      const { findOrgCandidates } = await import("@/lib/research.server");
      return findOrgCandidates(q);
    }
    case "research_organization": {
      if (c.research.length) return { error: "Ya se ejecutó un research en este turno." };
      if (!(await inWs(c, "organizations", a["organization_id"]))) return { error: "organización inexistente: creala o buscala primero" };
      const orgId = String(a["organization_id"]);
      const { data: org } = await sb.from("organizations").select("name").eq("id", orgId).single();
      let urls: string[] = []; const w = nn(a["website"]);
      if (w) { try { const u = new URL(w); if (/^https?:$/.test(u.protocol)) urls = [u.toString()]; } catch { /* ignore */ } }
      const { executeResearch } = await import("@/lib/research.server");
      const r = await executeResearch(sb, { workspace_id: c.ws, organization_id: orgId, focus: (nn(a["focus"]) ?? "").slice(0, 200), web_search: true, urls });
      const { data: run } = await sb.from("research_runs").select("fit, intro_draft, extraction_id").eq("id", r.run_id).single();
      const { data: f } = await sb.from("research_findings").select("statement, condition, url, published_at, category, quote, fetched_at").eq("run_id", r.run_id).order("position");
      const proposals = run?.extraction_id ? (await sb.from("brain_proposals").select("id", { count: "exact", head: true }).eq("extraction_id", run.extraction_id)).count ?? 0 : 0;
      c.research.push({ run_id: r.run_id, organization_id: orgId, organization: org?.name ?? "", status: r.status, errors: r.errors, proposals });
      return { status: r.status, errors: r.errors, findings: researchForChat(f ?? []), fit: run?.fit ?? null, intro_draft: run?.intro_draft ?? null, proposals_pending_review: proposals };
    }
    case "ask_user": {
      c.question = { question: String(a["question"] ?? ""), options: ((a["options"] as string[]) ?? []).slice(0, 6) };
      return { asked: true };
    }
  }
  return { error: "herramienta desconocida" };
}

type Item = Record<string, unknown>;

export const sendBrainMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; thread_id?: string | null; text: string; focus?: { type: string; id: string } | null }) => {
    if (!d.text.trim()) throw new Error("Escribí algo");
    if (d.text.length > 60000) throw new Error("Mensaje demasiado largo (máx. 60.000 caracteres)");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: member } = await sb.from("workspace_members").select("workspace_id, workspaces(name, is_demo)").eq("workspace_id", data.workspace_id).eq("user_id", context.userId).maybeSingle();
    if (!member) throw new Error("Sin acceso a este espacio");
    let thread = data.thread_id ?? null;
    if (!thread) {
      const { data: t, error } = await sb.from("brain_threads").insert({ workspace_id: data.workspace_id, owner_user_id: context.userId, title: data.text.trim().slice(0, 60), focus_type: data.focus?.type ?? null, focus_id: data.focus?.id ?? null }).select("id").single();
      if (error) throw new Error(error.message);
      thread = t.id as string;
    }
    const { data: th } = await sb.from("brain_threads").select("*").eq("id", thread).maybeSingle();
    if (!th || th.workspace_id !== data.workspace_id) throw new Error("Chat no encontrado");
    const { error: e1 } = await sb.from("brain_messages").insert({ workspace_id: data.workspace_id, thread_id: thread, role: "user", content: data.text });
    if (e1) throw new Error(e1.message);

    const { data: hist } = await sb.from("brain_messages").select("role, content, parts").eq("thread_id", thread).order("created_at", { ascending: false }).limit(30);
    const history = [...(hist ?? [])].reverse();
    const userText = history.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content).join("\n");
    const { data: mem } = await sb.from("workspace_members").select("user_id, email, display_name").eq("workspace_id", data.workspace_id);
    let focus: string | null = null;
    if (th.focus_type && th.focus_id) {
      const table = RECORD_TABLES[th.focus_type as RecordType];
      if (table) { const { data: f } = await sb.from(table).select(table === "people" ? "id, full_name" : table === "tasks" ? "id, title" : "id, name").eq("id", th.focus_id).maybeSingle(); if (f) focus = `${th.focus_type} ${JSON.stringify(f)}`; }
    }
    const ws = member.workspaces as { name: string; is_demo: boolean };
    const instructions = systemPrompt({ today: new Date().toISOString().slice(0, 10), workspace: ws.name, isDemo: ws.is_demo, members: (mem ?? []).map((m: { user_id: string; display_name: string | null; email: string | null }) => ({ id: m.user_id, name: m.display_name || m.email || "Miembro" })), focus });
    const input: Item[] = history.map((m: { role: string; content: string; parts: { actions?: ActionCard[]; question?: Question } }) => ({
      role: m.role, content: m.role === "assistant" ? [m.content, m.parts?.actions?.length ? `[Acciones realizadas: ${m.parts.actions.map((x) => `${x.summary} (${x.table}:${x.record_id})`).join("; ")}]` : "", m.parts?.question ? `[Pregunté: ${m.parts.question.question}]` : ""].filter(Boolean).join("\n") : m.content,
    }));

    const c: Ctx = { sb, ws: data.workspace_id, uid: context.userId, thread, userText, actions: [], question: null, research: [], detail: `Brain · chat ${thread.slice(0, 8)}` };
    let text = ""; let failure: string | null = null;
    if (!process.env["LOVABLE_API_KEY"]) failure = "El Brain no está configurado.";
    else {
      const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const res = await generateResponse({ model: MODEL, instructions, input: input as never, tools: TOOLS as never });
          const out = ((res as { output?: Item[] }).output ?? []);
          const calls = out.filter((o) => o["type"] === "function_call");
          text = out.filter((o) => o["type"] === "message").flatMap((o) => (o["content"] as Item[]) ?? []).filter((x) => x["type"] === "output_text").map((x) => String(x["text"] ?? "")).join("") || text;
          if (!calls.length) break;
          input.push(...out.filter((o) => o["type"] === "function_call" || o["type"] === "reasoning"));
          for (const call of calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(String(call["arguments"] ?? "{}")); } catch { /* invalid args */ }
            let result: unknown;
            try { result = await runTool(c, String(call["name"]), args); } catch (e) { result = { error: (e as Error).message }; }
            input.push({ type: "function_call_output", call_id: call["call_id"], output: JSON.stringify(result).slice(0, 20000) });
          }
          if (c.question) { if (!text) text = c.question.question; break; }
        }
      } catch (e) {
        console.error("brain chat error", e);
        failure = e instanceof GatewayError && (e.httpStatus === 402) ? "Sin créditos de IA disponibles." : e instanceof GatewayError && e.httpStatus === 429 ? "Demasiadas consultas; probá en un momento." : "El proveedor de IA falló. Lo que ya se hizo quedó registrado abajo.";
      }
    }
    if (failure) text = `${failure}${text ? `\n\n${text}` : ""}`;
    if (!text) text = c.actions.length ? "Listo." : "No pude generar una respuesta.";
    const parts = { actions: c.actions, question: c.question, error: failure, research: c.research };
    const { error: e2 } = await sb.from("brain_messages").insert({ workspace_id: data.workspace_id, thread_id: thread, role: "assistant", content: text, parts });
    if (e2) throw new Error(e2.message);
    await sb.from("brain_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread);
    return { thread_id: thread };
  });
