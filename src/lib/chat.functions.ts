import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RECORD_TABLES, ROLE_VALUES, TOOLS, queryNamesPerson, researchForChat, pickAllowed, stripInventedNumbers, systemPrompt, validIsoDate, type RecordType } from "@/lib/chat-agent";

const MODEL = "openai/gpt-6-astra" as const;
const MAX_STEPS = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
export type ActionCard = { id: string; summary: string; table: string; record_id: string; op: "create" | "update"; link: { type: string; id: string } | null };
export type Question = { question: string; options: string[] };
export type ResearchCard = { run_id: string; organization_id: string; organization: string; status: string; errors: string[]; proposals: number; prospect?: import("@/lib/prospecting").ProspectView };
type Ctx = { sb: Sb; ws: string; uid: string; thread: string; userText: string; actions: ActionCard[]; question: Question | null; detail: string; research: ResearchCard[]; request: string };

const LINK: Record<string, string> = { people: "person", organizations: "organization", projects: "project", tasks: "task" };

export type Step = { op: "insert" | "update" | "set_my_person"; table?: string; id?: string; ref?: string; values?: Record<string, unknown>; summary: string; link_type?: string | null; link_id?: string; link_ref?: string; person_id?: string; person_ref?: string };
type ApplyResult = { ok: boolean; replayed?: boolean; refs: Record<string, string>; results: { action_id: string; id: string; table: string; op: "create" | "update"; summary: string; link_type: string | null; link_id: string | null }[] };
/** One tool call = one atomic DB operation (changes + audit + undo rows). Idempotent per request + call. */
async function apply(c: Ctx, tool: string, args: Record<string, unknown>, steps: Step[]): Promise<ApplyResult> {
  const op_key = await opKey(c.request, tool, args);
  const { data, error } = await c.sb.rpc("brain_apply", { _ws: c.ws, _thread: c.thread, _op_key: op_key, _steps: steps });
  if (error) throw new Error(`No se guardó nada: ${error.message}`);
  const r = data as ApplyResult;
  for (const x of r.results) if (!c.actions.some((y) => y.id === x.action_id)) c.actions.push({ id: x.action_id, summary: x.summary, table: x.table, record_id: x.id, op: x.op, link: x.link_type && x.link_id ? { type: x.link_type, id: x.link_id } : null });
  return r;
}
export async function opKey(request: string, tool: string, args: Record<string, unknown>) {
  const raw = `${request}|${tool}|${JSON.stringify(args, Object.keys(args).sort())}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
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
      const steps: Step[] = [{ ref: "p", table: "people", op: "insert", values: { full_name, relationship_context: nn(a["relationship_context"]), location: nn(a["location"]), source_type: "personal", source_detail: c.detail }, summary: `Creé la persona ${full_name}`, link_type: "person", link_ref: "p" }];
      for (const [kind, v] of [["email", a["email"]], ["phone", a["phone"]]] as const) {
        const value = nn(v); if (!value) continue;
        steps.push({ table: "person_contacts", op: "insert", values: { person_id: "$ref:p", kind, value, source_detail: c.detail }, summary: `Agregué ${kind === "email" ? "el email" : "el teléfono"} ${value} a ${full_name}`, link_type: "person", link_ref: "p" });
      }
      const r = await apply(c, name, a, steps);
      return { created: true, id: r.refs["p"] };
    }
    case "create_organization": {
      const n = nn(a["name"]); if (!n) return { error: "falta el nombre" };
      if (!a["force_new"]) {
        const { data: d } = await sb.rpc("find_org_duplicates", { _ws: c.ws, _name: n });
        if (d?.length) return { created: false, needs_confirmation: true, candidates: d };
      }
      const r = await apply(c, name, a, [{ ref: "o", table: "organizations", op: "insert", values: { name: n, location: nn(a["location"]), website: nn(a["website"]), description: nn(a["description"]), source_type: "personal", source_detail: c.detail }, summary: `Creé la organización ${n}`, link_type: "organization", link_ref: "o" }]);
      return { created: true, id: r.refs["o"] };
    }
    case "add_affiliation": {
      const { data: pe } = await sb.from("people").select("full_name").eq("id", a["person_id"]).eq("workspace_id", c.ws).maybeSingle();
      const { data: or } = await sb.from("organizations").select("name").eq("id", a["organization_id"]).eq("workspace_id", c.ws).maybeSingle();
      if (!pe || !or) return { error: "persona u organización no encontrada" };
      const { data: ex } = await sb.from("affiliations").select("id").eq("person_id", a["person_id"]).eq("organization_id", a["organization_id"]).is("archived_at", null).maybeSingle();
      if (ex) return { exists: true, id: ex.id };
      const r = await apply(c, name, a, [{ ref: "a", table: "affiliations", op: "insert", values: { person_id: a["person_id"], organization_id: a["organization_id"], title: nn(a["title"]), source_type: "personal", source_detail: c.detail }, summary: `Vinculé a ${pe.full_name} con ${or.name}${nn(a["title"]) ? ` como ${nn(a["title"])}` : ""}`, link_type: "person", link_id: a["person_id"] as string }]);
      return { created: true, id: r.refs["a"] };
    }
    case "add_person_link": {
      const { data: to } = await sb.from("people").select("full_name").eq("id", a["to_person_id"]).eq("workspace_id", c.ws).maybeSingle();
      if (!to) return { error: "persona destino no encontrada" };
      const steps: Step[] = [];
      let from = nn(a["from_person_id"]); let fromName = "";
      if (!from) {
        const { data: m } = await sb.from("workspace_members").select("person_id, display_name, email").eq("workspace_id", c.ws).eq("user_id", c.uid).single();
        from = m?.person_id ?? null;
        if (from) {
          const { data: me } = await sb.from("people").select("full_name, archived_at").eq("id", from).maybeSingle();
          if (!me || me.archived_at) return { error: "Tu ficha está archivada. Preguntale al usuario si la restaura o elige otra." };
          fromName = me.full_name;
        } else {
          const myId = nn(a["my_person_id"]);
          if (myId) {
            const { data: me } = await sb.from("people").select("full_name, archived_at").eq("id", myId).eq("workspace_id", c.ws).maybeSingle();
            if (!me) return { error: "ficha elegida no encontrada" };
            if (me.archived_at) return { error: "La ficha elegida está archivada; no la reutilizo sin que el usuario la restaure." };
            steps.push({ op: "set_my_person", person_id: myId, summary: `Asocié tu usuario a la ficha ${me.full_name}` });
            from = myId; fromName = me.full_name;
          } else {
            const nm = nn(m?.display_name) ?? nn(m?.email);
            if (!nm) return { error: "No tengo tu nombre para crear tu ficha; pedile al usuario que se asocie en Equipo." };
            if (!a["create_my_person"]) {
              const { data: d } = await sb.rpc("find_person_duplicates", { _ws: c.ws, _name: nm });
              if (d?.length) return { needs_confirmation: true, about: "ficha del usuario", candidates: d.map((x: { id: string; full_name: string; archived: boolean; reason: string }) => ({ id: x.id, full_name: x.full_name, archived: x.archived, reason: x.reason })), hint: "Preguntá si alguna es su ficha (my_person_id) o si creás una nueva (create_my_person=true)." };
            }
            steps.push({ ref: "me", table: "people", op: "insert", values: { full_name: nm, source_type: "personal", source_detail: "Ficha del miembro del equipo" }, summary: `Creé tu ficha (${nm})`, link_type: "person", link_ref: "me" });
            steps.push({ op: "set_my_person", person_ref: "me", summary: "Asocié tu usuario a tu ficha" });
            fromName = nm;
          }
        }
      } else {
        const { data: fp } = await sb.from("people").select("full_name").eq("id", from).eq("workspace_id", c.ws).maybeSingle();
        if (!fp) return { error: "persona origen no encontrada" };
        fromName = fp.full_name;
      }
      if (from && from === a["to_person_id"]) return { error: "misma persona" };
      if (from) {
        const { data: ex } = await sb.from("person_links").select("id").eq("workspace_id", c.ws).is("archived_at", null).or(`and(from_person_id.eq.${from},to_person_id.eq.${a["to_person_id"]}),and(from_person_id.eq.${a["to_person_id"]},to_person_id.eq.${from})`).maybeSingle();
        if (ex && !steps.length) return { exists: true, id: ex.id };
      }
      steps.push({ ref: "l", table: "person_links", op: "insert", values: { from_person_id: from ?? "$ref:me", to_person_id: a["to_person_id"], kind: a["kind"], context: nn(a["context"]), source_type: "personal", source_detail: c.detail }, summary: `Vinculé en la red a ${fromName} con ${to.full_name}`, link_type: "person", link_id: a["to_person_id"] as string });
      const r = await apply(c, name, a, steps);
      return { created: true, id: r.refs["l"] };
    }
    case "add_contact": {
      if (!(await inWs(c, "people", a["person_id"]))) return { error: "persona no encontrada" };
      const value = nn(a["value"]); if (!value) return { error: "valor vacío" };
      await apply(c, name, a, [{ table: "person_contacts", op: "insert", values: { person_id: a["person_id"], kind: a["kind"], value, source_detail: c.detail }, summary: `Agregué el contacto ${value}`, link_type: "person", link_id: a["person_id"] as string }]);
      return { created: true };
    }
    case "create_task": {
      const title = nn(a["title"]); if (!title) return { error: "falta el título" };
      const due = a["due_date"] == null ? null : validIsoDate(a["due_date"]);
      if (a["due_date"] != null && !due) return { error: "fecha inválida; usá YYYY-MM-DD o preguntá" };
      for (const [t, k] of [["people", "person_id"], ["organizations", "organization_id"], ["projects", "project_id"]] as const) if (a[k] && !(await inWs(c, t, a[k]))) return { error: `${k} no encontrado` };
      if (a["owner_user_id"]) { const { data: m } = await sb.from("workspace_members").select("user_id").eq("workspace_id", c.ws).eq("user_id", a["owner_user_id"]).maybeSingle(); if (!m) return { error: "responsable no es miembro" }; }
      const link = a["project_id"] ? { link_type: "project", link_id: a["project_id"] as string } : a["person_id"] ? { link_type: "person", link_id: a["person_id"] as string } : a["organization_id"] ? { link_type: "organization", link_id: a["organization_id"] as string } : { link_type: "task", link_ref: "t" };
      const r = await apply(c, name, a, [{ ref: "t", table: "tasks", op: "insert", values: { title, context: nn(a["context"]), due_date: due, owner_user_id: a["owner_user_id"] || null, person_id: a["person_id"] || null, organization_id: a["organization_id"] || null, project_id: a["project_id"] || null }, summary: `Agregué la tarea «${title}»${due ? ` para el ${due}` : ""}`, ...link }]);
      return { created: true, id: r.refs["t"] };
    }
    case "update_record": {
      const type = a["type"] as RecordType; const table = RECORD_TABLES[type]; if (!table) return { error: "tipo inválido" };
      let fields: Record<string, unknown>; try { fields = JSON.parse(String(a["fields_json"] ?? "{}")); } catch { return { error: "fields_json inválido" }; }
      fields = pickAllowed(type, fields);
      let dropped: string[] = [];
      if (type === "project") ({ fields, dropped } = stripInventedNumbers(fields, c.userText));
      if (type === "task" && "due_date" in fields && fields["due_date"] != null && !validIsoDate(fields["due_date"])) return { error: "fecha inválida" };
      if (!Object.keys(fields).length) return { error: "sin campos válidos", dropped };
      if (!(await inWs(c, table, a["id"]))) return { error: "no encontrado" };
      await apply(c, name, a, [{ table, op: "update", id: a["id"] as string, values: fields, summary: `Actualicé ${Object.keys(fields).join(", ")} de ${type === "person" ? "la persona" : type === "organization" ? "la organización" : type === "project" ? "el proyecto" : "la tarea"}`, link_type: LINK[table] ?? null, link_id: a["id"] as string }]);
      return { updated: true, dropped_numbers_not_in_text: dropped };
    }
    case "log_conversation": {
      const title = nn(a["title"]) ?? "Nota"; const body = String(a["body"] ?? "");
      const steps: Step[] = [{ ref: "c", table: "conversations", op: "insert", values: { title, body, ...(validIsoDate(a["occurred_at"]) ? { occurred_at: validIsoDate(a["occurred_at"]) } : {}) }, summary: `Guardé la conversación «${title}»`, link_type: null }];
      const missing: string[] = [];
      for (const [key, t, col] of [["person_ids", "people", "person_id"], ["organization_ids", "organizations", "organization_id"], ["project_ids", "projects", "project_id"]] as const)
        for (const id of (a[key] as string[]) ?? []) { if (await inWs(c, t, id)) steps.push({ table: "conversation_links", op: "insert", values: { conversation_id: "$ref:c", [col]: id }, summary: `Vinculé la conversación «${title}»`, link_type: t === "people" ? "person" : t === "organizations" ? "organization" : "project", link_id: id }); else missing.push(id); }
      if (missing.length) return { error: `No encontré ${missing.length} de los registros a vincular; no guardé nada. Revisá los ids.` };
      const r = await apply(c, name, a, steps);
      return { created: true, id: r.refs["c"], links: steps.length - 1 };
    }
    case "add_need": {
      const d = nn(a["description"]); if (!d) return { error: "vacía" };
      for (const [t, k] of [["people", "person_id"], ["organizations", "organization_id"]] as const) if (a[k] && !(await inWs(c, t, a[k]))) return { error: `${k} no encontrado` };
      await apply(c, name, a, [{ table: "needs", op: "insert", values: { description: d, evidence: nn(a["evidence"]), person_id: a["person_id"] || null, organization_id: a["organization_id"] || null }, summary: `Registré la necesidad: ${d}`, ...(a["organization_id"] ? { link_type: "organization", link_id: a["organization_id"] as string } : a["person_id"] ? { link_type: "person", link_id: a["person_id"] as string } : {}) }]);
      return { created: true };
    }
    case "create_project": {
      const n = nn(a["name"]); if (!n) return { error: "falta el nombre" };
      const { fields: nums, dropped } = stripInventedNumbers({ power_mw: a["power_mw"], energy_mwh: a["energy_mwh"], duration_h: a["duration_h"] }, c.userText);
      const steps: Step[] = [{ ref: "p", table: "projects", op: "insert", values: { name: n, need: nn(a["need"]), location: nn(a["location"]), evidence: nn(a["evidence"]), blockers: nn(a["blockers"]), next_milestone: nn(a["next_milestone"]), ...nums, source_type: "personal", source_detail: c.detail }, summary: `Creé el proyecto ${n}`, link_type: "project", link_ref: "p" }];
      for (const o of (a["organization_ids"] as string[]) ?? []) {
        if (!(await inWs(c, "organizations", o))) return { error: "organización no encontrada; no guardé nada" };
        steps.push({ table: "project_organizations", op: "insert", values: { project_id: "$ref:p", organization_id: o }, summary: `Vinculé una organización al proyecto ${n}`, link_type: "project", link_ref: "p" });
      }
      const r = await apply(c, name, a, steps);
      return { created: true, id: r.refs["p"], dropped_numbers_not_in_text: dropped };
    }
    case "add_participant": {
      if (!(await inWs(c, "projects", a["project_id"]))) return { error: "proyecto no encontrado" };
      if (!ROLE_VALUES.includes(a["role"] as never)) return { error: "rol inválido" };
      const pid = a["person_id"] || null; const oid = pid ? null : a["organization_id"] || null; const un = pid || oid ? null : nn(a["unidentified_description"]);
      if (!pid && !oid && !un) return { error: "indicá persona, organización o descripción" };
      await apply(c, name, a, [{ table: "project_participants", op: "insert", values: { project_id: a["project_id"], role: a["role"], person_id: pid, organization_id: oid, unidentified_description: un, notes: nn(a["notes"]), source_type: "personal", source_detail: c.detail }, summary: `Agregué un participante (${a["role"]}) al proyecto`, link_type: "project", link_id: a["project_id"] as string }]);
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
    case "prospect_network": {
      if (c.research.length) return { error: "Ya se ejecutó una investigación en este turno." };
      if (!(await inWs(c, "organizations", a["organization_id"]))) return { error: "organización inexistente: creala o buscala primero" };
      const { executeProspecting } = await import("@/lib/research.server");
      const r = await executeProspecting(sb, { workspace_id: c.ws, organization_id: String(a["organization_id"]), place: nn(a["place"]), commercial_profile: nn(a["commercial_profile"]),
        budget: { max_candidates: a["max_candidates"], max_queries: a["max_queries"], max_seconds: a["max_seconds"] } });
      const view = r.view;
      if (r.errors.length) console.warn("prospect diagnostics", r.run_id, r.errors);
      c.research.push({ run_id: r.run_id, organization_id: String(a["organization_id"]), organization: r.organization, status: r.execution, errors: [], proposals: r.proposals, prospect: view });
      return { ...view, sources: undefined, sources_count: view.sources.length, proposals_pending_review: r.proposals, note: "El mensaje final al usuario se genera desde este mismo resultado; no lo reescribas." };
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
  .inputValidator((d: { workspace_id: string; thread_id?: string | null; text: string; focus?: { type: string; id: string } | null; request_id: string }) => {
    if (!d.text.trim()) throw new Error("Escribí algo");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(String(d.request_id ?? ""))) throw new Error("Falta el identificador del pedido");
    if (d.text.length > 60000) throw new Error("Mensaje demasiado largo (máx. 60.000 caracteres)");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: member } = await sb.from("workspace_members").select("workspace_id, workspaces(name, is_demo)").eq("workspace_id", data.workspace_id).eq("user_id", context.userId).maybeSingle();
    if (!member) throw new Error("Sin acceso a este espacio");
    // Request-level idempotency: a double submit or a lost response never repeats effects.
    const { error: rqErr } = await sb.from("brain_requests").insert({ workspace_id: data.workspace_id, request_id: data.request_id, user_id: context.userId, thread_id: data.thread_id ?? null });
    let retry = false;
    if (rqErr) {
      const { data: prev } = await sb.from("brain_requests").select("status, thread_id").eq("workspace_id", data.workspace_id).eq("request_id", data.request_id).maybeSingle();
      if (!prev) throw new Error(rqErr.message);
      if (prev.status === "done") return { thread_id: prev.thread_id as string, replayed: true };
      if (prev.status === "running") throw new Error("Este mensaje ya se está procesando.");
      retry = true; data.thread_id = prev.thread_id ?? data.thread_id;
      await sb.from("brain_requests").update({ status: "running" }).eq("workspace_id", data.workspace_id).eq("request_id", data.request_id);
    }
    const markReq = (patch: Record<string, unknown>) => sb.from("brain_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("workspace_id", data.workspace_id).eq("request_id", data.request_id);
    try {
    let thread = data.thread_id ?? null;
    if (!thread) {
      const { data: t, error } = await sb.from("brain_threads").insert({ workspace_id: data.workspace_id, owner_user_id: context.userId, title: data.text.trim().slice(0, 60), focus_type: data.focus?.type ?? null, focus_id: data.focus?.id ?? null }).select("id").single();
      if (error) throw new Error(error.message);
      thread = t.id as string;
      await markReq({ thread_id: thread });
    }
    const { data: th } = await sb.from("brain_threads").select("*").eq("id", thread).maybeSingle();
    if (!th || th.workspace_id !== data.workspace_id) throw new Error("Chat no encontrado");
    if (!retry) {
      const { error: e1 } = await sb.from("brain_messages").insert({ workspace_id: data.workspace_id, thread_id: thread, role: "user", content: data.text });
      if (e1) throw new Error(e1.message);
    }

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

    const c: Ctx = { sb, ws: data.workspace_id, uid: context.userId, thread, userText, actions: [], question: null, research: [], request: data.request_id, detail: `Brain · chat ${thread.slice(0, 8)}` };
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
    const pr = c.research.find((x) => x.prospect);
    if (pr?.prospect) { const { prospectMessage } = await import("@/lib/prospecting"); text = `${failure ? `${failure}\n\n` : ""}${prospectMessage(pr.organization, pr.prospect)}`; }
    if (!text) text = c.actions.length ? "Listo." : "No pude generar una respuesta.";
    const parts = { actions: c.actions, question: c.question, error: failure, research: c.research };
    const { error: e2 } = await sb.from("brain_messages").insert({ workspace_id: data.workspace_id, thread_id: thread, role: "assistant", content: text, parts });
    if (e2) throw new Error(e2.message);
    await sb.from("brain_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread);
    await markReq({ status: "done", thread_id: thread });
    return { thread_id: thread, replayed: false };
    } catch (e) { await markReq({ status: "failed" }); throw e; }
  });
