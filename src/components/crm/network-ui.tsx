import { Link } from "@tanstack/react-router";
import { BrainToggle } from "@/components/crm/BrainPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, ProvenanceFields, Tag, selectClass } from "./fields";
import { formatDateTime, type SourceType, type VerificationStatus } from "@/lib/crm";
import { INTRO_KIND_LABELS, INTRO_STATUS_LABELS, LINK_KIND_LABELS, TASK_STATUS_LABELS } from "@/lib/network";
import { introLabel, useIntroOptions, useMembers, useOrgOptions, usePeopleOptions } from "@/lib/options";

const today = () => new Date().toISOString().slice(0, 10);
const nn = (s: string) => (s.trim() ? s.trim() : null);
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["intros", "tasks", "convs", "links", "graph", "person", "org", "intro-opts", "history", "commission"]) qc.invalidateQueries({ queryKey: [k] });
}
const personLabel = (p: { full_name: string; archived_at: string | null }) => p.full_name + (p.archived_at ? " (archivada)" : "");

/* ---------------- Person links ---------------- */
export function LinkForm({ ws, fromPersonId, onDone }: { ws: string; fromPersonId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: people = [] } = usePeopleOptions(ws);
  const [to, setTo] = useState(""); const [kind, setKind] = useState("knows"); const [context, setContext] = useState("");
  const [prov, setProv] = useState({ source_type: "personal" as SourceType, source_detail: "", verification_status: "unverified" as VerificationStatus });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!to) { toast.error("Elegí la persona vinculada."); return; }
    const { error } = await supabase.from("person_links").insert({ workspace_id: ws, from_person_id: fromPersonId, to_person_id: to, kind: kind as never, context: nn(context), ...prov, source_detail: nn(prov.source_detail) });
    if (error) { toast.error(error.message); return; }
    invalidateAll(qc); onDone();
  }
  return (
    <form onSubmit={save} className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Persona vinculada *" htmlFor="l-to"><select id="l-to" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}><option value="">Elegir…</option>{people.filter((p) => p.id !== fromPersonId).map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select></Field>
        <Field label="Tipo de vínculo" htmlFor="l-kind"><select id="l-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(LINK_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Contexto" htmlFor="l-ctx"><Input id="l-ctx" value={context} onChange={(e) => setContext(e.target.value)} /></Field>
      </div>
      <ProvenanceFields idPrefix="l" value={prov} onChange={setProv} />
      <div className="flex gap-3"><Button size="sm" type="submit">Guardar vínculo</Button><Button size="sm" type="button" variant="outline" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

export function PersonLinks({ ws, personId }: { ws: string; personId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["links", personId],
    queryFn: async () => (await supabase.from("person_links").select("id, kind, context, archived_at, from_person_id, to_person_id, from:people!person_links_from_person_id_fkey(id, full_name, archived_at), to:people!person_links_to_person_id_fkey(id, full_name, archived_at)").or(`from_person_id.eq.${personId},to_person_id.eq.${personId}`)).data ?? [],
  });
  async function toggle(id: string, archived: boolean) {
    const { error } = await supabase.from("person_links").update({ archived_at: archived ? null : new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidateAll(qc);
  }
  return (
    <Section title="Vínculos con personas" action={!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Agregar vínculo</Button>}>
      {adding && <div className="mb-4"><LinkForm ws={ws} fromPersonId={personId} onDone={() => setAdding(false)} /></div>}
      <ul className="divide-y divide-border border-y border-border">
        {data.map((l) => {
          const outgoing = l.from_person_id === personId;
          const other = (outgoing ? l.to : l.from) as { id: string; full_name: string; archived_at: string | null } | null;
          return (
            <li key={l.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${l.archived_at ? "opacity-60" : ""}`}>
              <div>
                <div className="label-mono text-muted-foreground">{outgoing ? "" : "← "}{LINK_KIND_LABELS[l.kind]}</div>
                {other && <Link to="/personas/$id" params={{ id: other.id }} className="font-semibold hover:text-primary">{personLabel(other)}</Link>}
                {l.context && <div className="text-sm text-muted-foreground">{l.context}</div>}
              </div>
              <button className="text-sm font-semibold text-muted-foreground hover:underline" onClick={() => toggle(l.id, !!l.archived_at)}>{l.archived_at ? "Restaurar" : "Archivar"}</button>
            </li>
          );
        })}
        {data.length === 0 && <li className="py-4 text-sm text-muted-foreground">Sin vínculos registrados. Una afiliación a una empresa no cuenta como vínculo ni como introducción.</li>}
      </ul>
    </Section>
  );
}

/* ---------------- Introductions ---------------- */
type IntroRow = {
  id: string; workspace_id: string; introducer_person_id: string | null; introduced_person_id: string | null; target_person_id: string | null; target_org_id: string | null;
  target_description: string | null; purpose: string | null; context: string | null; kind: string; status: string; owner_user_id: string | null;
  next_action: string | null; follow_up_at: string | null; requested_at: string | null; occurred_at: string | null;
  source_type: string; source_detail: string | null; verification_status: string; archived_at: string | null;
};
export const INTRO_SELECT = "*, introducer:people!introductions_introducer_person_id_fkey(id, full_name, archived_at), introduced:people!introductions_introduced_person_id_fkey(id, full_name, archived_at), target:people!introductions_target_person_id_fkey(id, full_name, archived_at), org:organizations(id, name, archived_at)";

export function IntroForm({ ws, initial, onDone }: { ws: string; initial?: Partial<IntroRow> | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: people = [] } = usePeopleOptions(ws);
  const { data: orgs = [] } = useOrgOptions(ws);
  const { data: members = [] } = useMembers(ws);
  const [d, setD] = useState({
    introducer_person_id: initial?.introducer_person_id ?? "", introduced_person_id: initial?.introduced_person_id ?? "",
    target_person_id: initial?.target_person_id ?? "", target_org_id: initial?.target_org_id ?? "", target_description: initial?.target_description ?? "",
    purpose: initial?.purpose ?? "", context: initial?.context ?? "", kind: initial?.kind ?? "request", status: initial?.status ?? "requested",
    owner_user_id: initial?.owner_user_id ?? "", next_action: initial?.next_action ?? "", follow_up_at: initial?.follow_up_at ?? "",
    requested_at: initial?.requested_at ?? (initial?.id ? "" : today()), occurred_at: initial?.occurred_at ?? "",
  });
  const [prov, setProv] = useState({ source_type: (initial?.source_type ?? "personal") as SourceType, source_detail: initial?.source_detail ?? "", verification_status: (initial?.verification_status ?? "unverified") as VerificationStatus });
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.introducer_person_id && !d.introduced_person_id) { toast.error("Indicá quién presenta o a quién se presenta."); return; }
    if (!d.target_person_id && !d.target_org_id && !d.target_description.trim()) { toast.error("Indicá el destino: persona, organización o una descripción si todavía no está identificado."); return; }
    const row = {
      introducer_person_id: d.introducer_person_id || null, introduced_person_id: d.introduced_person_id || null,
      target_person_id: d.target_person_id || null, target_org_id: d.target_org_id || null, target_description: nn(d.target_description),
      purpose: nn(d.purpose), context: nn(d.context), kind: d.kind as never, status: d.status as never, owner_user_id: d.owner_user_id || null,
      next_action: nn(d.next_action), follow_up_at: d.follow_up_at || null, requested_at: d.requested_at || null, occurred_at: d.occurred_at || null,
      ...prov, source_detail: nn(prov.source_detail),
    };
    const { error } = initial?.id
      ? await supabase.from("introductions").update(row).eq("id", initial.id)
      : await supabase.from("introductions").insert({ ...row, workspace_id: ws });
    if (error) { toast.error(error.message); return; }
    toast.success("Introducción guardada"); invalidateAll(qc); onDone();
  }
  const pSel = (id: string, k: keyof typeof d) => (
    <select id={id} className={selectClass} value={d[k]} onChange={(e) => set(k, e.target.value)}>
      <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}
    </select>
  );
  return (
    <form onSubmit={save} className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Quién presenta" htmlFor="i-by">{pSel("i-by", "introducer_person_id")}</Field>
        <Field label="A quién presenta" htmlFor="i-to" hint="Normalmente alguien del equipo.">{pSel("i-to", "introduced_person_id")}</Field>
        <Field label="Responsable" htmlFor="i-own"><select id="i-own" className={selectClass} value={d.owner_user_id} onChange={(e) => set("owner_user_id", e.target.value)}><option value="">Sin asignar</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Con quién quiere conectar (persona)" htmlFor="i-tp">{pSel("i-tp", "target_person_id")}</Field>
        <Field label="Organización destino" htmlFor="i-to2"><select id="i-to2" className={selectClass} value={d.target_org_id} onChange={(e) => set("target_org_id", e.target.value)}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Destino aún no identificado" htmlFor="i-td" hint="Ej.: responsable de compras. No crea una persona."><Input id="i-td" value={d.target_description} onChange={(e) => set("target_description", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Tipo" htmlFor="i-kind"><select id="i-kind" className={selectClass} value={d.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(INTRO_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Estado" htmlFor="i-st"><select id="i-st" className={selectClass} value={d.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(INTRO_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Para qué" htmlFor="i-pur"><Input id="i-pur" value={d.purpose} onChange={(e) => set("purpose", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Pedida el" htmlFor="i-req"><Input id="i-req" type="date" value={d.requested_at} onChange={(e) => set("requested_at", e.target.value)} /></Field>
        <Field label="Realizada el" htmlFor="i-occ"><Input id="i-occ" type="date" value={d.occurred_at} onChange={(e) => set("occurred_at", e.target.value)} /></Field>
        <Field label="Siguiente acción" htmlFor="i-next"><Input id="i-next" value={d.next_action} onChange={(e) => set("next_action", e.target.value)} /></Field>
        <Field label="Seguimiento" htmlFor="i-fu"><Input id="i-fu" type="date" value={d.follow_up_at} onChange={(e) => set("follow_up_at", e.target.value)} /></Field>
      </div>
      <Field label="Contexto" htmlFor="i-ctx"><Textarea id="i-ctx" rows={2} value={d.context} onChange={(e) => set("context", e.target.value)} /></Field>
      <ProvenanceFields idPrefix="i" value={prov} onChange={setProv} />
      <p className="text-xs text-muted-foreground">Guardar una presentación no crea conversaciones ni oportunidades automáticamente.</p>
      <div className="flex gap-3"><Button size="sm" type="submit">Guardar introducción</Button><Button size="sm" type="button" variant="outline" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

type IntroFull = IntroRow & {
  introducer: { id: string; full_name: string; archived_at: string | null } | null;
  introduced: { id: string; full_name: string; archived_at: string | null } | null;
  target: { id: string; full_name: string; archived_at: string | null } | null;
  org: { id: string; name: string; archived_at: string | null } | null;
};

export function IntroCard({ i, members, onEdit }: { i: IntroFull; members: Record<string, string>; onEdit?: () => void }) {
  const qc = useQueryClient();
  const P = ({ p }: { p: { id: string; full_name: string; archived_at: string | null } | null }) =>
    p ? <Link to="/personas/$id" params={{ id: p.id }} className="font-semibold hover:text-primary">{personLabel(p)}</Link> : <span className="text-muted-foreground">—</span>;
  const overdue = i.follow_up_at && i.follow_up_at < today() && !["done", "declined"].includes(i.status);
  async function toggle() {
    const { error } = await supabase.from("introductions").update({ archived_at: i.archived_at ? null : new Date().toISOString() }).eq("id", i.id);
    if (error) { toast.error(error.message); return; }
    invalidateAll(qc);
  }
  return (
    <div className={`py-4 ${i.archived_at ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={i.kind === "done" ? "success" : i.kind === "hypothetical" ? "neutral" : "warning"}>{INTRO_KIND_LABELS[i.kind]}</Tag>
        <Tag tone="primary">{INTRO_STATUS_LABELS[i.status]}</Tag>
        {i.archived_at && <Tag tone="warning">Archivada</Tag>}
      </div>
      <div className="mt-2 text-sm">
        <P p={i.introducer} /> <span className="text-muted-foreground">presenta a</span> <P p={i.introduced} /> <span className="text-muted-foreground">→</span>{" "}
        {i.target ? <P p={i.target} /> : null}
        {i.org && <> {i.target && "· "}<Link to="/organizaciones/$id" params={{ id: i.org.id }} className="font-semibold hover:text-primary">{i.org.name}</Link></>}
        {!i.target && i.target_description && <span className="ml-1 border border-dashed border-border-strong px-2 font-mono text-xs">Sin identificar: {i.target_description}</span>}
      </div>
      {i.purpose && <div className="text-sm text-muted-foreground">Para: {i.purpose}</div>}
      <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-xs text-muted-foreground">
        <span>Responsable: {i.owner_user_id ? members[i.owner_user_id] ?? "?" : "sin asignar"}</span>
        {i.requested_at && <span>Pedida {i.requested_at}</span>}
        {i.occurred_at && <span>Realizada {i.occurred_at}</span>}
        {i.next_action && <span>Siguiente: {i.next_action}</span>}
        {i.follow_up_at && <span className={overdue ? "font-bold text-destructive" : ""}>Seguimiento {i.follow_up_at}{overdue ? " · vencido" : ""}</span>}
      </div>
      <div className="mt-2 flex gap-4 text-sm font-semibold">
        {onEdit && <button className="text-primary hover:underline" onClick={onEdit}>Editar</button>}
        <button className="text-muted-foreground hover:underline" onClick={toggle}>{i.archived_at ? "Restaurar" : "Archivar"}</button>
      </div>
      <div className="mt-2"><BrainToggle ws={i.workspace_id} focusType="introduction" focusId={i.id} /></div>
    </div>
  );
}

export function IntroList({ ws, filter, emptyText, allowNew, defaults }: {
  ws: string; filter?: { personId?: string; orgId?: string }; emptyText: string; allowNew?: boolean; defaults?: Partial<IntroRow>;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { data: memberList = [] } = useMembers(ws);
  const members = Object.fromEntries(memberList.map((m) => [m.user_id, m.name]));
  const { data = [] } = useQuery({
    queryKey: ["intros", ws, filter?.personId, filter?.orgId],
    queryFn: async () => {
      let q = supabase.from("introductions").select(INTRO_SELECT).eq("workspace_id", ws).order("created_at", { ascending: false });
      if (filter?.personId) q = q.or(`introducer_person_id.eq.${filter.personId},introduced_person_id.eq.${filter.personId},target_person_id.eq.${filter.personId}`);
      if (filter?.orgId) q = q.eq("target_org_id", filter.orgId);
      const { data, error } = await q; if (error) throw error;
      return data as unknown as IntroFull[];
    },
  });
  return (
    <Section title="Introducciones" action={allowNew && editing === null && <Button size="sm" variant="outline" onClick={() => setEditing("new")}>Registrar introducción</Button>}>
      {editing === "new" && <IntroForm ws={ws} initial={defaults} onDone={() => setEditing(null)} />}
      <div className="divide-y divide-border border-y border-border">
        {data.map((i) => editing === i.id ? <div key={i.id} className="py-4"><IntroForm ws={ws} initial={i} onDone={() => setEditing(null)} /></div> : <IntroCard key={i.id} i={i} members={members} onEdit={() => setEditing(i.id)} />)}
        {data.length === 0 && <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>}
      </div>
    </Section>
  );
}

/* ---------------- Conversations ---------------- */
export function ConversationForm({ ws, initialLinks, onDone }: { ws: string; initialLinks?: { people?: string[]; orgs?: string[]; intros?: string[] } | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: people = [] } = usePeopleOptions(ws);
  const { data: orgs = [] } = useOrgOptions(ws);
  const { data: intros = [] } = useIntroOptions(ws);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [date, setDate] = useState(today());
  const [ps, setPs] = useState<string[]>(initialLinks?.people ?? []);
  const [os, setOs] = useState<string[]>(initialLinks?.orgs ?? []);
  const [is, setIs] = useState<string[]>(initialLinks?.intros ?? []);
  const multi = (e: ChangeEvent<HTMLSelectElement>) => Array.from(e.target.selectedOptions).map((o) => o.value);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Poné un título a la conversación."); return; }
    const { data, error } = await supabase.from("conversations").insert({ workspace_id: ws, title: title.trim(), body: nn(body), occurred_at: date }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const links = [
      ...ps.map((person_id) => ({ person_id })), ...os.map((organization_id) => ({ organization_id })), ...is.map((introduction_id) => ({ introduction_id })),
    ].map((l) => ({ ...l, workspace_id: ws, conversation_id: data.id }));
    if (links.length) { const r = await supabase.from("conversation_links").insert(links); if (r.error) { toast.error(r.error.message); return; } }
    toast.success("Conversación guardada"); invalidateAll(qc); onDone();
  }
  const ms = `${selectClass} h-32`;
  return (
    <form onSubmit={save} className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <Field label="Título *" htmlFor="c-t"><Input id="c-t" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Fecha" htmlFor="c-d"><Input id="c-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Notas" htmlFor="c-b"><Textarea id="c-b" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Participantes" htmlFor="c-p" hint="Ctrl/Cmd para elegir varias."><select id="c-p" multiple className={ms} value={ps} onChange={(e) => setPs(multi(e))}>{people.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select></Field>
        <Field label="Organizaciones" htmlFor="c-o"><select id="c-o" multiple className={ms} value={os} onChange={(e) => setOs(multi(e))}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Introducciones" htmlFor="c-i"><select id="c-i" multiple className={ms} value={is} onChange={(e) => setIs(multi(e))}>{intros.map((i) => <option key={i.id} value={i.id}>{introLabel(i as never)}</option>)}</select></Field>
      </div>
      <div className="flex gap-3"><Button size="sm" type="submit">Guardar conversación</Button><Button size="sm" type="button" variant="outline" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

type ConvFull = { id: string; title: string; body: string | null; occurred_at: string; archived_at: string | null; created_by: string | null;
  conversation_links: { id: string; person_id: string | null; organization_id: string | null; introduction_id: string | null; people: { id: string; full_name: string } | null; organizations: { id: string; name: string } | null }[] };

export function ConversationList({ ws, filter, allowNew, initialLinks, title = "Conversaciones y notas" }: {
  ws: string; filter?: { personId?: string; orgId?: string }; allowNew?: boolean; initialLinks?: { people?: string[]; orgs?: string[] }; title?: string;
}) {
  const [adding, setAdding] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["convs", ws, filter?.personId, filter?.orgId],
    queryFn: async () => {
      let ids: string[] | null = null;
      if (filter?.personId || filter?.orgId) {
        const col = filter.personId ? "person_id" : "organization_id";
        const { data: l } = await supabase.from("conversation_links").select("conversation_id").eq(col, (filter.personId ?? filter.orgId)!);
        ids = [...new Set((l ?? []).map((x) => x.conversation_id))];
        if (ids.length === 0) return [];
      }
      let q = supabase.from("conversations").select("id, title, body, occurred_at, archived_at, created_by, conversation_links(id, person_id, organization_id, introduction_id, people(id, full_name), organizations(id, name))").eq("workspace_id", ws).order("occurred_at", { ascending: false });
      if (ids) q = q.in("id", ids);
      const { data, error } = await q; if (error) throw error;
      return data as unknown as ConvFull[];
    },
  });
  return (
    <Section title={title} action={allowNew && !adding && <div className="flex gap-2"><Link to="/conversaciones/importar" className="inline-flex h-9 items-center rounded-sm border border-input px-3 text-sm font-semibold hover:text-primary">Pegar email o notas</Link><Button size="sm" variant="outline" onClick={() => setAdding(true)}>Nueva conversación</Button></div>}>
      {adding && <div className="mb-4"><ConversationForm ws={ws} initialLinks={initialLinks} onDone={() => setAdding(false)} /></div>}
      <ul className="divide-y divide-border border-y border-border">
        {data.map((c) => (
          <li key={c.id} className="py-4">
            <div className="flex items-baseline justify-between gap-4"><div className="font-semibold">{c.title}</div><div className="font-mono text-xs text-muted-foreground">{c.occurred_at}</div></div>
            {c.body && <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {c.conversation_links.map((l) => l.people ? <Link key={l.id} to="/personas/$id" params={{ id: l.people.id }} className="border border-border px-2 py-0.5 hover:text-primary">{l.people.full_name}</Link>
                : l.organizations ? <Link key={l.id} to="/organizaciones/$id" params={{ id: l.organizations.id }} className="border border-border px-2 py-0.5 font-semibold hover:text-primary">{l.organizations.name}</Link>
                : <span key={l.id} className="border border-dashed border-border-strong px-2 py-0.5 font-mono">Introducción vinculada</span>)}
            </div>
            <div className="mt-2"><BrainToggle ws={ws} focusType="conversation" focusId={c.id} /></div>
          </li>
        ))}
        {data.length === 0 && <li className="py-4 text-sm text-muted-foreground">Sin conversaciones registradas.</li>}
      </ul>
    </Section>
  );
}

/* ---------------- Tasks ---------------- */
export type TaskRow = {
  confirmed?: boolean;
  id: string; title: string; context: string | null; owner_user_id: string | null; status: string; due_date: string | null;
  waiting_on_person_id: string | null; waiting_since: string | null; review_at: string | null; person_id: string | null; organization_id: string | null;
  introduction_id: string | null; conversation_id: string | null; completed_by: string | null; completed_at: string | null; completion_note: string | null; archived_at: string | null;
  person: { id: string; full_name: string; archived_at: string | null } | null; waiting: { id: string; full_name: string } | null; org: { id: string; name: string } | null;
};
export const TASK_SELECT = "*, person:people!tasks_person_id_fkey(id, full_name, archived_at), waiting:people!tasks_waiting_on_person_id_fkey(id, full_name), org:organizations(id, name)";

export function TaskForm({ ws, initial, onDone }: { ws: string; initial?: Partial<TaskRow> | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: people = [] } = usePeopleOptions(ws);
  const { data: orgs = [] } = useOrgOptions(ws);
  const { data: members = [] } = useMembers(ws);
  const { data: intros = [] } = useIntroOptions(ws);
  const [d, setD] = useState({
    title: initial?.title ?? "", context: initial?.context ?? "", owner_user_id: initial?.owner_user_id ?? "", status: initial?.status ?? "open",
    due_date: initial?.due_date ?? "", waiting_on_person_id: initial?.waiting_on_person_id ?? "", waiting_since: initial?.waiting_since ?? "",
    review_at: initial?.review_at ?? "", person_id: initial?.person_id ?? "", organization_id: initial?.organization_id ?? "", introduction_id: initial?.introduction_id ?? "",
  });
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) { toast.error("La tarea necesita un título."); return; }
    const row = {
      title: d.title.trim(), context: nn(d.context), owner_user_id: d.owner_user_id || null, status: d.status as never, due_date: d.due_date || null,
      waiting_on_person_id: d.waiting_on_person_id || null, waiting_since: d.waiting_since || null, review_at: d.review_at || null,
      person_id: d.person_id || null, organization_id: d.organization_id || null, introduction_id: d.introduction_id || null,
    };
    const { error } = initial?.id ? await supabase.from("tasks").update(row).eq("id", initial.id) : await supabase.from("tasks").insert({ ...row, workspace_id: ws });
    if (error) { toast.error(error.message); return; }
    invalidateAll(qc); onDone();
  }
  return (
    <form onSubmit={save} className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_200px_180px]">
        <Field label="Tarea *" htmlFor="t-t"><Input id="t-t" value={d.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Responsable" htmlFor="t-o"><select id="t-o" className={selectClass} value={d.owner_user_id} onChange={(e) => set("owner_user_id", e.target.value)}><option value="">Sin asignar</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></Field>
        <Field label="Vence" htmlFor="t-d" hint="Opcional."><Input id="t-d" type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Estado" htmlFor="t-s"><select id="t-s" className={selectClass} value={d.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(TASK_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Esperando respuesta de" htmlFor="t-w"><select id="t-w" className={selectClass} value={d.waiting_on_person_id} onChange={(e) => set("waiting_on_person_id", e.target.value)}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select></Field>
        <Field label="Esperando desde" htmlFor="t-ws"><Input id="t-ws" type="date" value={d.waiting_since} onChange={(e) => set("waiting_since", e.target.value)} /></Field>
        <Field label="Revisar el" htmlFor="t-r"><Input id="t-r" type="date" value={d.review_at} onChange={(e) => set("review_at", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Persona" htmlFor="t-p"><select id="t-p" className={selectClass} value={d.person_id} onChange={(e) => set("person_id", e.target.value)}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select></Field>
        <Field label="Organización" htmlFor="t-org"><select id="t-org" className={selectClass} value={d.organization_id} onChange={(e) => set("organization_id", e.target.value)}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Introducción" htmlFor="t-i"><select id="t-i" className={selectClass} value={d.introduction_id} onChange={(e) => set("introduction_id", e.target.value)}><option value="">—</option>{intros.map((i) => <option key={i.id} value={i.id}>{introLabel(i as never)}</option>)}</select></Field>
      </div>
      <Field label="Contexto" htmlFor="t-c"><Textarea id="t-c" rows={2} value={d.context} onChange={(e) => set("context", e.target.value)} /></Field>
      <div className="flex gap-3"><Button size="sm" type="submit">Guardar tarea</Button><Button size="sm" type="button" variant="outline" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

export function TaskItem({ t, ws, members }: { t: TaskRow; ws: string; members: Record<string, string> }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  if (editing) return <li className="py-3"><TaskForm ws={ws} initial={t} onDone={() => setEditing(false)} /></li>;
  const overdue = t.due_date && t.due_date < today() && (t.status === "open" || t.status === "waiting");
  const reviewDue = t.review_at && t.review_at <= today() && t.status === "waiting";
  async function setStatus(status: string) {
    const { error } = await supabase.from("tasks").update({ status: status as never }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    invalidateAll(qc);
  }
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className={`font-medium ${t.status === "done" || t.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}>{t.title} {t.confirmed === false && <Tag tone="warning">Sin confirmar</Tag>}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-xs text-muted-foreground">
          <span>{t.owner_user_id ? members[t.owner_user_id] ?? "?" : "Sin responsable"}</span>
          <span className={overdue ? "font-bold text-destructive" : ""}>{t.due_date ? `Vence ${t.due_date}${overdue ? " · vencida" : ""}` : "Sin fecha"}</span>
          {t.waiting && <span>Espera a {t.waiting.full_name}{t.waiting_since ? ` desde ${t.waiting_since}` : ""}</span>}
          {t.review_at && <span className={reviewDue ? "font-bold text-warning" : ""}>Revisar {t.review_at}</span>}
          {t.person && <Link to="/personas/$id" params={{ id: t.person.id }} className="hover:text-primary">{personLabel(t.person)}</Link>}
          {t.org && <Link to="/organizaciones/$id" params={{ id: t.org.id }} className="hover:text-primary">{t.org.name}</Link>}
          {t.completed_at && <span className="text-success">Hecha {formatDateTime(t.completed_at)} · {t.completed_by ? members[t.completed_by] ?? "?" : ""}</span>}
        </div>
        {t.context && <div className="text-sm text-muted-foreground">{t.context}</div>}
      </div>
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Tag tone={t.status === "done" ? "success" : t.status === "waiting" ? "warning" : "neutral"}>{TASK_STATUS_LABELS[t.status]}</Tag>
        {t.status !== "done" && <button className="text-primary hover:underline" onClick={() => setStatus("done")}>Marcar hecha</button>}
        {t.status === "done" && <button className="text-muted-foreground hover:underline" onClick={() => setStatus("open")}>Reabrir</button>}
        <button className="text-muted-foreground hover:underline" onClick={() => setEditing(true)}>Editar</button>
      </div>
    </li>
  );
}

export function TaskList({ ws, filter, allowNew, defaults, title = "Tareas y pendientes" }: {
  ws: string; filter?: { personId?: string; orgId?: string }; allowNew?: boolean; defaults?: Partial<TaskRow>; title?: string;
}) {
  const [adding, setAdding] = useState(false);
  const { data: memberList = [] } = useMembers(ws);
  const members = Object.fromEntries(memberList.map((m) => [m.user_id, m.name]));
  const { data = [] } = useQuery({
    queryKey: ["tasks", ws, filter?.personId, filter?.orgId],
    queryFn: async () => {
      let q = supabase.from("tasks").select(TASK_SELECT).eq("workspace_id", ws).order("due_date", { ascending: true, nullsFirst: false });
      if (filter?.personId) q = q.or(`person_id.eq.${filter.personId},waiting_on_person_id.eq.${filter.personId}`);
      if (filter?.orgId) q = q.eq("organization_id", filter.orgId);
      const { data, error } = await q; if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
  const open = data.filter((t) => t.status === "open" || t.status === "waiting");
  const closed = data.filter((t) => !(t.status === "open" || t.status === "waiting"));
  return (
    <Section title={title} action={allowNew && !adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Nueva tarea</Button>}>
      {adding && <div className="mb-4"><TaskForm ws={ws} initial={defaults} onDone={() => setAdding(false)} /></div>}
      <ul className="divide-y divide-border border-y border-border">
        {open.map((t) => <TaskItem key={t.id} t={t} ws={ws} members={members} />)}
        {open.length === 0 && <li className="py-4 text-sm text-muted-foreground">Sin acciones abiertas.</li>}
      </ul>
      {closed.length > 0 && (
        <details className="mt-3"><summary className="cursor-pointer label-mono text-muted-foreground">Finalizadas ({closed.length})</summary>
          <ul className="divide-y divide-border">{closed.map((t) => <TaskItem key={t.id} t={t} ws={ws} members={members} />)}</ul>
        </details>
      )}
    </Section>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-6">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
