import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/AppShell";
import { Field, Tag, selectClass } from "@/components/crm/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProposalItem } from "@/lib/brain";
import { buildDecisions, type Action, type Decision } from "@/lib/brain-review";

const META = "Revisá, corregí o rechazá cada propuesta del Brain antes de guardarla.";
export const Route = createFileRoute("/_authenticated/conversaciones/revision/$id")({
  head: () => ({ meta: [{ title: "Revisión de propuestas · CRM - CARBO" }, { name: "description", content: META }, { property: "og:title", content: "Revisión de propuestas · CRM - CARBO" }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Review,
});

const KIND: Record<string, string> = { person: "Persona", affiliation: "Afiliación", introduction: "Introducción", need: "Necesidad", task: "Tarea", project: "Proyecto", participant: "Participante", project_update: "Actualizar proyecto" };
const STATUS: Record<string, string> = { pending: "Pendiente", accepted: "Aceptada", corrected: "Corregida", rejected: "Rechazada" };
type Row = { id: string; kind: string; proposed: ProposalItem; evidence: string | null; ambiguity: string | null; status: string; final: Record<string, unknown> | null; decided_by: string | null; decided_at: string | null; created_record_id: string | null; workspace_id: string };

function Review() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["extraction", id],
    queryFn: async () => {
      const { data: ex, error } = await supabase.from("brain_extractions").select("*, source_documents(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: props } = await supabase.from("brain_proposals").select("*").eq("extraction_id", id).order("position");
      return { ex, props: (props ?? []) as unknown as Row[] };
    },
  });
  const [dec, setDec] = useState<Record<string, Decision>>({});
  const [save, setSave] = useState<{ s: "idle" | "saving" | "saved" | "failed"; msg?: string }>({ s: "idle" });
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data?.ex) return <p className="text-sm text-muted-foreground">Análisis no encontrado.</p>;
  const { ex, props } = data;
  const src = ex.source_documents as unknown as { title: string; original_text: string; kind: string; conversation_id: string | null };
  const pending = props.filter((p) => p.status === "pending");
  const ws = ex.workspace_id;
  const set = (pid: string, d: Partial<Decision>) => setDec((m) => ({ ...m, [pid]: { action: "pending", edits: {}, ...m[pid], ...d } as Decision }));

  async function confirm() {
    if (save.s === "saving") return;
    setSave({ s: "saving" });
    const decisions = buildDecisions(pending.map((p) => ({ id: p.id, proposed: p.proposed })), dec);
    const { data: r, error } = await supabase.rpc("confirm_extraction", { _extraction: id, _decisions: decisions as never });
    if (error) { setSave({ s: "failed", msg: error.message }); return; }
    const res = r as { created: number; rejected: number; pending: number };
    setSave({ s: "saved", msg: `${res.created} guardadas, ${res.rejected} rechazadas, ${res.pending} pendientes.` });
    setDec({});
    await qc.invalidateQueries();
  }

  return (
    <>
      <PageHeader crumb="Conversaciones / Revisión" title={src.title} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="space-y-2">
          <div className="flex items-center gap-2"><span className="label-mono text-muted-foreground">Original ({src.kind})</span><Tag tone={ex.status === "confirmed" ? "success" : ex.status === "failed" ? "error" : "warning"}>{ex.status === "draft" ? "Borrador" : ex.status === "partial" ? "Parcial" : ex.status === "confirmed" ? "Confirmado" : "Falló"}</Tag></div>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-card p-4 font-sans text-sm">{src.original_text}</pre>
          {ex.error && <p className="text-sm text-destructive">{ex.error}</p>}
          {src.conversation_id && <p className="text-sm">Guardado como conversación. <Link to="/conversaciones" className="text-primary underline">Ver conversaciones</Link></p>}
        </section>
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">Borrador: nada de esto es un hecho hasta confirmarlo. Lo que dejes pendiente queda para después y el Brain no lo usa.</p>
          {props.length === 0 && <p className="text-sm text-muted-foreground">El Brain no detectó propuestas.</p>}
          {props.map((p) => <ProposalCard key={p.id} p={p} ws={ws} d={dec[p.id]} onChange={(d) => set(p.id, d)} />)}
          {pending.length > 0 && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background py-3">
              <Button onClick={confirm} disabled={save.s === "saving"}>{save.s === "saving" ? "Guardando…" : "Confirmar selección"}</Button>
              <Button variant="outline" disabled={save.s === "saving"} onClick={() => setDec(Object.fromEntries(pending.map((p) => [p.id, { action: "accept", edits: {} } as Decision])))}>Aceptar todas</Button>
            </div>
          )}
          {save.s === "saved" && <p className="text-sm text-success">Guardado correcto: {save.msg}</p>}
          {save.s === "failed" && <p className="text-sm text-destructive">Falló el guardado, no se aplicó nada: {save.msg} Podés reintentar sin duplicar.</p>}
        </section>
      </div>
    </>
  );
}

const FIELDS: Record<string, [keyof ProposalItem, string][]> = {
  person: [["full_name", "Nombre"], ["description", "Contexto"]],
  affiliation: [["person_ref", "Persona (ref)"], ["org_name", "Organización"], ["title", "Cargo"]],
  introduction: [["introducer_ref", "Presenta (ref)"], ["introduced_ref", "Presentado (ref)"], ["target_ref", "Destino (ref)"], ["target_description", "Destino sin identificar"], ["purpose", "Propósito"]],
  need: [["description", "Necesidad"], ["person_ref", "Persona (ref)"]],
  task: [["title", "Tarea"], ["person_ref", "Persona (ref)"], ["project_ref", "Proyecto (ref)"]],
  project: [["name", "Nombre"], ["description", "Necesidad"], ["location", "Ubicación"], ["power_mw", "Potencia (MW)"], ["energy_mwh", "Capacidad (MWh)"], ["duration_h", "Duración (h)"], ["blockers", "Bloqueos"], ["next_milestone", "Siguiente hito"]],
  participant: [["project_ref", "Proyecto (ref)"], ["person_ref", "Persona (ref)"], ["org_name", "Organización"], ["target_description", "Sin identificar"]],
  project_update: [["name", "Proyecto mencionado"], ["description", "Necesidad"], ["location", "Ubicación"], ["power_mw", "Potencia (MW)"], ["energy_mwh", "Capacidad (MWh)"], ["duration_h", "Duración (h)"], ["blockers", "Bloqueos"], ["next_milestone", "Siguiente hito"]],
};
const ROLE_OPTS: Record<string, string> = { buyer: "Comprador contractual posible", end_user: "Usuario final", economic_decider: "Decisor económico", technical_evaluator: "Evaluador técnico", internal_champion: "Promotor interno", other: "Otro" };

function ProposalCard({ p, ws, d, onChange }: { p: Row; ws: string; d: Decision | undefined; onChange: (d: Partial<Decision>) => void }) {
  const done = p.status !== "pending";
  const v = { ...p.proposed, ...(p.final ?? {}), ...(d?.edits ?? {}) } as Record<string, unknown>;
  const { data: dups = [] } = useQuery({
    queryKey: ["dup-person", ws, p.proposed.full_name],
    enabled: p.kind === "person" && !done && !!p.proposed.full_name,
    queryFn: async () => (await supabase.rpc("find_person_duplicates", { _ws: ws, _name: p.proposed.full_name ?? "" })).data ?? [],
  });
  const needsProject = !done && (p.kind === "project_update" || p.kind === "participant" || p.kind === "task" || p.kind === "project");
  const { data: projects = [] } = useQuery({
    queryKey: ["project-opts", ws], enabled: needsProject,
    queryFn: async () => (await supabase.from("projects").select("id, name").eq("workspace_id", ws).is("archived_at", null).order("name")).data ?? [],
  });
  const edit = (k: string, val: string | null) => onChange({ action: "correct", edits: { ...(d?.edits ?? {}), [k]: val } });
  return (
    <div className={`space-y-3 rounded-sm border p-4 ${done ? "border-border opacity-80" : "border-border-strong"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="primary">{KIND[p.kind]}</Tag>
        {p.proposed.ref && <span className="font-mono text-xs">{p.proposed.ref}</span>}
        <Tag tone={p.proposed.certainty === "stated" ? "success" : "warning"}>{p.proposed.certainty === "stated" ? "Afirmado" : "Posible"}</Tag>
        {p.kind === "introduction" && <Tag>{p.proposed.intro_kind === "done" ? "Realizada" : p.proposed.intro_kind === "request" ? "Pedida" : "Hipotética"}</Tag>}
        <Tag tone={p.status === "rejected" ? "error" : done ? "success" : "neutral"}>{STATUS[p.status]}</Tag>
      </div>
      {p.evidence && <blockquote className="border-l-2 border-primary pl-3 text-sm italic">“{p.evidence}”</blockquote>}
      {p.ambiguity && <p className="text-sm text-warning">A resolver: {p.ambiguity}</p>}
      {done ? (
        <div className="font-mono text-xs text-muted-foreground">{Object.entries(v).filter(([k, x]) => x && FIELDS[p.kind]?.some(([f]) => f === k)).map(([k, x]) => `${k}: ${String(x)}`).join(" · ")}{p.decided_at && ` · decidido ${new Date(p.decided_at).toLocaleString("es-AR")}`}</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS[p.kind]?.map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`${p.id}-${k}`}><Input id={`${p.id}-${k}`} value={(v[k] as string | null) ?? ""} onChange={(e) => edit(k, e.target.value || null)} /></Field>
            ))}
            {(p.kind === "task" || p.kind === "need") && (
              <Field label="Estado" htmlFor={`${p.id}-c`}><select id={`${p.id}-c`} className={selectClass} value={(v["certainty"] as string) ?? "possible"} onChange={(e) => edit("certainty", e.target.value)}><option value="possible">Sin confirmar</option><option value="stated">Compromiso confirmado</option></select></Field>
            )}
            {p.kind === "introduction" && (
              <Field label="Tipo" htmlFor={`${p.id}-ik`}><select id={`${p.id}-ik`} className={selectClass} value={(v["intro_kind"] as string) ?? "hypothetical"} onChange={(e) => edit("intro_kind", e.target.value)}><option value="hypothetical">Hipotética</option><option value="request">Pedida</option><option value="done">Realizada</option></select></Field>
            )}
            {p.kind === "participant" && (
              <Field label="Rol" htmlFor={`${p.id}-role`}><select id={`${p.id}-role`} className={selectClass} value={(v["role"] as string) ?? "other"} onChange={(e) => edit("role", e.target.value)}>{Object.entries(ROLE_OPTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            )}
            {needsProject && (
              <Field label={p.kind === "project" ? "¿Es un proyecto existente?" : "Proyecto existente"} htmlFor={`${p.id}-pj`}>
                <select id={`${p.id}-pj`} className={selectClass} value={(v["project_id"] as string) ?? ""} onChange={(e) => edit("project_id", e.target.value || null)}>
                  <option value="">{p.kind === "project" ? "Crear proyecto nuevo" : "Usar el proyecto propuesto (ref)"}</option>
                  {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
            )}
            {p.kind === "person" && (
              <Field label="Asociar a" htmlFor={`${p.id}-dup`} {...(dups.length ? { hint: "Hay posibles duplicados." } : {})}>
                <select id={`${p.id}-dup`} className={selectClass} value={(v["person_id"] as string) ?? ""} onChange={(e) => edit("person_id", e.target.value || null)}>
                  <option value="">Crear persona nueva</option>
                  {dups.map((x) => <option key={x.id} value={x.id}>{x.full_name} · {x.reason}{x.archived ? " (archivada)" : ""}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div className="flex gap-2" role="group" aria-label="Decisión">
            {(["accept", "reject", "pending"] as Action[]).map((a) => (
              <Button key={a} size="sm" type="button" variant={(d?.action ?? "pending") === a || (a === "accept" && d?.action === "correct") ? "default" : "outline"} onClick={() => onChange({ action: a === "accept" && Object.keys(d?.edits ?? {}).length ? "correct" : a })}>
                {a === "accept" ? (d?.action === "correct" ? "Aceptar corregida" : "Aceptar") : a === "reject" ? "Rechazar" : "Dejar pendiente"}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
