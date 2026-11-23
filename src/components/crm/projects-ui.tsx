import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Tag, selectClass } from "./fields";
import { Section, invalidateAll } from "./network-ui";
import { RouteList } from "./RouteList";
import { useOrgOptions, usePeopleOptions } from "@/lib/options";
import { ROLE_LABELS, ROLES, STAGE_LABELS, STAGES, formatQuantity, validateOpportunity, defaultInPipeline } from "@/lib/projects";
import { ROOT_ID, findRoutes, loadGraph, personKey } from "@/lib/network";

const nn = (s: string) => (s.trim() ? s.trim() : null);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export type ProjectRow = {
  id: string; workspace_id: string; name: string; need: string | null; location: string | null; project_stage: string | null; evidence: string | null;
  blockers: string | null; next_milestone: string | null; power_mw: number | null; energy_mwh: number | null; duration_h: number | null; archived_at: string | null;
};

export function ProjectForm({ ws, initial, onDone }: { ws: string; initial?: ProjectRow | undefined; onDone: (id?: string) => void }) {
  const qc = useQueryClient();
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [d, setD] = useState({
    name: s(initial?.name), need: s(initial?.need), location: s(initial?.location), project_stage: s(initial?.project_stage), evidence: s(initial?.evidence),
    blockers: s(initial?.blockers), next_milestone: s(initial?.next_milestone), power_mw: s(initial?.power_mw), energy_mwh: s(initial?.energy_mwh), duration_h: s(initial?.duration_h),
  });
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) { toast.error("El proyecto necesita un nombre."); return; }
    const vals = [num(d.power_mw), num(d.energy_mwh), num(d.duration_h)];
    if (vals.some((v) => v != null && (Number.isNaN(v) || v < 0))) { toast.error("MW, MWh y horas deben ser números positivos o quedar vacíos."); return; }
    const row = { name: d.name.trim(), need: nn(d.need), location: nn(d.location), project_stage: nn(d.project_stage), evidence: nn(d.evidence), blockers: nn(d.blockers), next_milestone: nn(d.next_milestone), power_mw: vals[0] ?? null, energy_mwh: vals[1] ?? null, duration_h: vals[2] ?? null };
    const r = initial ? await supabase.from("projects").update(row).eq("id", initial.id).select("id").single() : await supabase.from("projects").insert({ ...row, workspace_id: ws }).select("id").single();
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Proyecto guardado"); invalidateAll(qc); onDone(r.data.id);
  }
  return (
    <form onSubmit={save} className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_220px_200px]">
        <Field label="Nombre *" htmlFor="pj-n"><Input id="pj-n" value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Ubicación" htmlFor="pj-l"><Input id="pj-l" value={d.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Etapa del proyecto" htmlFor="pj-s" hint="Ej.: idea, factibilidad, licitación."><Input id="pj-s" value={d.project_stage} onChange={(e) => set("project_stage", e.target.value)} /></Field>
      </div>
      <Field label="Necesidad" htmlFor="pj-nd"><Textarea id="pj-nd" rows={2} value={d.need} onChange={(e) => set("need", e.target.value)} /></Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Potencia (MW)" htmlFor="pj-mw" hint="Vacío = desconocido."><Input id="pj-mw" inputMode="decimal" value={d.power_mw} onChange={(e) => set("power_mw", e.target.value)} /></Field>
        <Field label="Capacidad (MWh)" htmlFor="pj-mwh" hint="No se calcula a partir de MW."><Input id="pj-mwh" inputMode="decimal" value={d.energy_mwh} onChange={(e) => set("energy_mwh", e.target.value)} /></Field>
        <Field label="Duración (h)" htmlFor="pj-h" hint="Vacío = desconocido."><Input id="pj-h" inputMode="decimal" value={d.duration_h} onChange={(e) => set("duration_h", e.target.value)} /></Field>
      </div>
      <Field label="Evidencia / fundamento" htmlFor="pj-e"><Textarea id="pj-e" rows={2} value={d.evidence} onChange={(e) => set("evidence", e.target.value)} /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Bloqueos" htmlFor="pj-b"><Textarea id="pj-b" rows={2} value={d.blockers} onChange={(e) => set("blockers", e.target.value)} /></Field>
        <Field label="Siguiente hito" htmlFor="pj-m"><Textarea id="pj-m" rows={2} value={d.next_milestone} onChange={(e) => set("next_milestone", e.target.value)} /></Field>
      </div>
      <div className="flex gap-3"><Button size="sm" type="submit">Guardar proyecto</Button><Button size="sm" type="button" variant="outline" onClick={() => onDone()}>Cancelar</Button></div>
    </form>
  );
}

export function ProjectSummary({ p }: { p: ProjectRow }) {
  return (
    <div className="flex flex-wrap gap-x-4 font-mono text-xs text-muted-foreground">
      <span>{formatQuantity(p.power_mw, "MW")}</span><span>{formatQuantity(p.energy_mwh, "MWh")}</span><span>{formatQuantity(p.duration_h, "h")}</span>
      {p.location && <span>{p.location}</span>}{p.project_stage && <span>Etapa: {p.project_stage}</span>}
    </div>
  );
}

/** Projects list; optionally only those where an org/person participates. */
export function ProjectList({ ws, personId, orgId, allowNew }: { ws: string; personId?: string; orgId?: string; allowNew?: boolean }) {
  const [adding, setAdding] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["projects", ws, personId, orgId],
    queryFn: async () => {
      let ids: string[] | null = null;
      if (personId || orgId) {
        const { data: pp } = await supabase.from("project_participants").select("project_id").eq(personId ? "person_id" : "organization_id", (personId ?? orgId)!);
        const set = new Set((pp ?? []).map((x) => x.project_id));
        if (orgId) { const { data: po } = await supabase.from("project_organizations").select("project_id").eq("organization_id", orgId); for (const x of po ?? []) set.add(x.project_id); }
        ids = [...set]; if (!ids.length) return [];
      }
      let q = supabase.from("projects").select("*").eq("workspace_id", ws).order("updated_at", { ascending: false });
      if (ids) q = q.in("id", ids);
      const { data, error } = await q; if (error) throw error; return data as ProjectRow[];
    },
  });
  return (
    <Section title="Proyectos" action={allowNew && !adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Nuevo proyecto</Button>}>
      {adding && <div className="mb-4"><ProjectForm ws={ws} onDone={() => setAdding(false)} /></div>}
      <ul className="divide-y divide-border border-y border-border">
        {data.map((p) => (
          <li key={p.id} className={`py-3 ${p.archived_at ? "opacity-60" : ""}`}>
            <Link to="/proyectos/$id" params={{ id: p.id }} className="font-semibold hover:text-primary">{p.name}</Link>
            {p.need && <div className="text-sm">{p.need}</div>}
            <ProjectSummary p={p} />
          </li>
        ))}
        {data.length === 0 && <li className="py-4 text-sm text-muted-foreground">Sin proyectos.</li>}
      </ul>
    </Section>
  );
}

export function ProjectOrgs({ ws, projectId }: { ws: string; projectId: string }) {
  const qc = useQueryClient();
  const { data: orgs = [] } = useOrgOptions(ws);
  const [sel, setSel] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["project-orgs", projectId],
    queryFn: async () => (await supabase.from("project_organizations").select("id, organizations(id, name)").eq("project_id", projectId)).data ?? [],
  });
  async function add() {
    if (!sel) return;
    const { error } = await supabase.from("project_organizations").insert({ workspace_id: ws, project_id: projectId, organization_id: sel });
    if (error) { toast.error(error.code === "23505" ? "Ya está vinculada." : error.message); return; }
    setSel(""); invalidateAll(qc); void qc.invalidateQueries({ queryKey: ["project-orgs", projectId] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("project_organizations").delete().eq("id", id);
    if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: ["project-orgs", projectId] });
  }
  return (
    <Section title="Organizaciones involucradas">
      <div className="flex flex-wrap gap-2">
        {data.map((x) => x.organizations && (
          <span key={x.id} className="inline-flex items-center gap-2 border border-border px-2 py-1 text-sm">
            <Link to="/organizaciones/$id" params={{ id: x.organizations.id }} className="font-semibold hover:text-primary">{x.organizations.name}</Link>
            <button className="text-xs text-muted-foreground hover:underline" onClick={() => remove(x.id)} aria-label="Quitar">quitar</button>
          </span>
        ))}
        {data.length === 0 && <span className="text-sm text-muted-foreground">Ninguna todavía.</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <select className={selectClass} value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Organización"><option value="">Agregar organización…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <Button size="sm" variant="outline" onClick={add} disabled={!sel}>Agregar</Button>
      </div>
    </Section>
  );
}

type Part = { id: string; role: string; person_id: string | null; organization_id: string | null; unidentified_description: string | null; notes: string | null; archived_at: string | null;
  people: { id: string; full_name: string } | null; organizations: { id: string; name: string } | null };

export function Participants({ ws, projectId }: { ws: string; projectId: string }) {
  const qc = useQueryClient();
  const { data: people = [] } = usePeopleOptions(ws);
  const { data: orgs = [] } = useOrgOptions(ws);
  const { data: graph } = useQuery({ queryKey: ["graph", ws], queryFn: () => loadGraph(ws) });
  const { data = [] } = useQuery({
    queryKey: ["participants", projectId],
    queryFn: async () => ((await supabase.from("project_participants").select("*, people(id, full_name), organizations(id, name)").eq("project_id", projectId).order("created_at")).data ?? []) as unknown as Part[],
  });
  const [d, setD] = useState({ role: "buyer", mode: "person", person_id: "", organization_id: "", desc: "", notes: "" });
  const [adding, setAdding] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    const row = {
      workspace_id: ws, project_id: projectId, role: d.role as never, notes: nn(d.notes),
      person_id: d.mode === "person" ? d.person_id || null : null,
      organization_id: d.mode === "org" ? d.organization_id || null : null,
      unidentified_description: d.mode === "unknown" ? nn(d.desc) : null,
    };
    if (!row.person_id && !row.organization_id && !row.unidentified_description) { toast.error("Elegí a quién, o describí al participante sin identificar."); return; }
    const { error } = await supabase.from("project_participants").insert(row);
    if (error) { toast.error(error.message); return; }
    setAdding(false); setD({ ...d, person_id: "", organization_id: "", desc: "", notes: "" });
    void qc.invalidateQueries({ queryKey: ["participants", projectId] }); invalidateAll(qc);
  }
  async function archive(p: Part) {
    const { error } = await supabase.from("project_participants").update({ archived_at: p.archived_at ? null : new Date().toISOString() }).eq("id", p.id);
    if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: ["participants", projectId] });
  }
  const label = (id: string) => graph?.nodes.get(id)?.label ?? "?";
  return (
    <Section title="Participantes y roles" action={!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Agregar participante</Button>}>
      {adding && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-sm border border-border bg-panel-subtle p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Rol" htmlFor="pp-r"><select id="pp-r" className={selectClass} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
            <Field label="Quién" htmlFor="pp-m"><select id="pp-m" className={selectClass} value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value })}><option value="person">Persona</option><option value="org">Organización</option><option value="unknown">Sin identificar</option></select></Field>
            {d.mode === "person" && <Field label="Persona" htmlFor="pp-p"><select id="pp-p" className={selectClass} value={d.person_id} onChange={(e) => setD({ ...d, person_id: e.target.value })}><option value="">Elegir…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>}
            {d.mode === "org" && <Field label="Organización" htmlFor="pp-o"><select id="pp-o" className={selectClass} value={d.organization_id} onChange={(e) => setD({ ...d, organization_id: e.target.value })}><option value="">Elegir…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}
            {d.mode === "unknown" && <Field label="Descripción" htmlFor="pp-d"><Input id="pp-d" value={d.desc} onChange={(e) => setD({ ...d, desc: e.target.value })} placeholder="Ej.: jefe de mantenimiento de la planta" /></Field>}
          </div>
          <Field label="Notas" htmlFor="pp-n"><Input id="pp-n" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
          <div className="flex gap-2"><Button size="sm" type="submit">Guardar</Button><Button size="sm" type="button" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button></div>
        </form>
      )}
      <div className="space-y-4">
        {ROLES.map((role) => {
          const list = data.filter((p) => p.role === role);
          return (
            <div key={role}>
              <div className="label-mono text-muted-foreground">{ROLE_LABELS[role]}</div>
              {list.length === 0 && <div className="text-sm text-muted-foreground">Sin identificar todavía.</div>}
              <ul className="divide-y divide-border">
                {list.map((p) => {
                  const routes = graph && p.person_id ? findRoutes(graph, ROOT_ID, personKey(p.person_id), 6) : [];
                  return (
                    <li key={p.id} className={`py-2 ${p.archived_at ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {p.people && <Link to="/personas/$id" params={{ id: p.people.id }} className="font-semibold hover:text-primary">{p.people.full_name}</Link>}
                        {p.organizations && <Link to="/organizaciones/$id" params={{ id: p.organizations.id }} className="font-semibold hover:text-primary">{p.organizations.name}</Link>}
                        {p.unidentified_description && <span className="border border-dashed border-border-strong px-2 font-mono text-xs">Sin identificar: {p.unidentified_description}</span>}
                        {p.archived_at && <Tag tone="warning">Archivado</Tag>}
                        <button className="text-xs text-muted-foreground hover:underline" onClick={() => archive(p)}>{p.archived_at ? "Restaurar" : "Archivar"}</button>
                      </div>
                      {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                      {p.person_id && (
                        <details className="mt-1"><summary className="cursor-pointer font-mono text-xs text-primary">Rutas de acceso ({routes.length})</summary>
                          <RouteList routes={routes} label={label} />
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

type Opp = { id: string; workspace_id: string; project_id: string; title: string; kind: "commercial" | "institutional"; need: string; rationale: string; stage: string; advance_criteria: string | null;
  known_pending: string | null; in_pipeline: boolean | null; amount: number | null; currency: string | null; source_type: string; archived_at: string | null;
  projects?: { id: string; name: string } | null; opportunity_stage_events?: { id: string; from_stage: string | null; to_stage: string; note: string | null; created_at: string }[] };

export function OpportunityForm({ ws, projectId, initial, onDone }: { ws: string; projectId: string; initial?: Opp | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState({
    title: initial?.title ?? "", kind: initial?.kind ?? "commercial", need: initial?.need ?? "", rationale: initial?.rationale ?? "", source_type: initial?.source_type ?? "personal",
    advance_criteria: initial?.advance_criteria ?? "", known_pending: initial?.known_pending ?? "", amount: initial?.amount == null ? "" : String(initial.amount), currency: initial?.currency ?? "USD",
    in_pipeline: initial?.in_pipeline ?? null as boolean | null,
  });
  const pipelineDefault = defaultInPipeline(d.kind, d.source_type);
  async function save(e: FormEvent) {
    e.preventDefault();
    const err = validateOpportunity({ project_id: projectId, title: d.title, need: d.need, rationale: d.rationale });
    if (err) { toast.error(err); return; }
    const amount = num(d.amount);
    if (amount != null && (Number.isNaN(amount) || amount < 0)) { toast.error("Monto inválido."); return; }
    const row = { title: d.title.trim(), kind: d.kind, need: d.need.trim(), rationale: d.rationale.trim(), source_type: d.source_type as never, advance_criteria: nn(d.advance_criteria), known_pending: nn(d.known_pending),
      amount, currency: amount == null ? null : nn(d.currency), in_pipeline: d.in_pipeline ?? pipelineDefault };
    const r = initial ? await supabase.from("opportunities").update(row).eq("id", initial.id) : await supabase.from("opportunities").insert({ ...row, workspace_id: ws, project_id: projectId });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Oportunidad guardada"); invalidateAll(qc); onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
        <Field label="Título *" htmlFor="op-t"><Input id="op-t" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
        <Field label="Tipo" htmlFor="op-k"><select id="op-k" className={selectClass} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Opp["kind"], in_pipeline: null })}><option value="commercial">Comercial</option><option value="institutional">Relación institucional</option></select></Field>
        <Field label="Procedencia" htmlFor="op-s"><select id="op-s" className={selectClass} value={d.source_type} onChange={(e) => setD({ ...d, source_type: e.target.value, in_pipeline: null })}><option value="personal">Personal</option><option value="ivlp">IVLP</option><option value="public_research">Investigación pública</option><option value="hypothesis">Hipótesis</option></select></Field>
      </div>
      <Field label="Necesidad identificada *" htmlFor="op-n"><Textarea id="op-n" rows={2} value={d.need} onChange={(e) => setD({ ...d, need: e.target.value })} /></Field>
      <Field label="Fundamento registrado *" htmlFor="op-r" hint="Qué evidencia o conversación la respalda."><Textarea id="op-r" rows={2} value={d.rationale} onChange={(e) => setD({ ...d, rationale: e.target.value })} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Qué significa avanzar de etapa" htmlFor="op-a"><Textarea id="op-a" rows={2} value={d.advance_criteria} onChange={(e) => setD({ ...d, advance_criteria: e.target.value })} /></Field>
        <Field label="Pendientes conocidos" htmlFor="op-p"><Textarea id="op-p" rows={2} value={d.known_pending} onChange={(e) => setD({ ...d, known_pending: e.target.value })} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-[200px_120px_1fr]">
        <Field label="Monto (opcional)" htmlFor="op-m" hint="Solo si alguien lo informó."><Input id="op-m" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></Field>
        <Field label="Moneda" htmlFor="op-c"><Input id="op-c" value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value })} /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={d.in_pipeline ?? pipelineDefault} onChange={(e) => setD({ ...d, in_pipeline: e.target.checked })} /> Cuenta en el pipeline{!pipelineDefault && " (por defecto no: institucional o hipótesis)"}</label>
      </div>
      <div className="flex gap-2"><Button size="sm" type="submit">Guardar oportunidad</Button><Button size="sm" type="button" variant="outline" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

export const OPP_SELECT = "*, projects(id, name), opportunity_stage_events(id, from_stage, to_stage, note, created_at)";

export function OpportunityCard({ o, showProject }: { o: Opp; showProject?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState(o.stage);
  if (editing) return <OpportunityForm ws={o.workspace_id} projectId={o.project_id} initial={o} onDone={() => setEditing(false)} />;
  async function move() {
    if (stage === o.stage) return;
    const { error } = await supabase.from("opportunities").update({ stage: stage as never }).eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Etapa: ${STAGE_LABELS[stage]}`); invalidateAll(qc);
  }
  const events = [...(o.opportunity_stage_events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <div className={`space-y-2 py-4 ${o.archived_at ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{o.title}</span>
        <Tag tone="primary">{STAGE_LABELS[o.stage]}</Tag>
        {o.kind === "institutional" && <Tag>Institucional</Tag>}
        <Tag tone={o.in_pipeline ? "success" : "neutral"}>{o.in_pipeline ? "En pipeline" : "Fuera del pipeline"}</Tag>
        {showProject && o.projects && <Link to="/proyectos/$id" params={{ id: o.projects.id }} className="text-sm hover:text-primary">Proyecto: {o.projects.name}</Link>}
      </div>
      <div className="text-sm"><span className="text-muted-foreground">Necesidad:</span> {o.need}</div>
      <div className="text-sm"><span className="text-muted-foreground">Fundamento:</span> {o.rationale}</div>
      {o.advance_criteria && <div className="text-sm"><span className="text-muted-foreground">Para avanzar:</span> {o.advance_criteria}</div>}
      {o.known_pending && <div className="text-sm"><span className="text-muted-foreground">Pendientes:</span> {o.known_pending}</div>}
      <div className="font-mono text-xs text-muted-foreground">{o.amount == null ? "Monto: no informado" : `Monto informado: ${o.amount.toLocaleString("es-AR")} ${o.currency ?? ""}`}</div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${selectClass} h-9 w-48`} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa">{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}</select>
        <Button size="sm" variant="outline" disabled={stage === o.stage} onClick={move}>Cambiar etapa</Button>
        <button className="text-sm font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>Editar</button>
      </div>
      {events.length > 0 && (
        <details><summary className="cursor-pointer label-mono text-muted-foreground">Historial de etapas ({events.length})</summary>
          <ul className="font-mono text-xs text-muted-foreground">{events.map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString("es-AR")} · {e.from_stage ? STAGE_LABELS[e.from_stage] : "Alta"} → {STAGE_LABELS[e.to_stage]}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export function OpportunityList({ ws, projectId }: { ws: string; projectId: string }) {
  const [adding, setAdding] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["opps", ws, projectId],
    queryFn: async () => ((await supabase.from("opportunities").select(OPP_SELECT).eq("project_id", projectId).order("created_at")).data ?? []) as unknown as Opp[],
  });
  return (
    <Section title="Oportunidades" action={!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Nueva oportunidad</Button>}>
      {adding && <OpportunityForm ws={ws} projectId={projectId} onDone={() => setAdding(false)} />}
      <div className="divide-y divide-border border-y border-border">
        {data.map((o) => <OpportunityCard key={o.id} o={o} />)}
        {data.length === 0 && <p className="py-4 text-sm text-muted-foreground">Sin oportunidades. Una oportunidad necesita necesidad identificada y fundamento.</p>}
      </div>
    </Section>
  );
}
export type { Opp };
