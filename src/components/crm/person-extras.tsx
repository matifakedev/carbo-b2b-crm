import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectClass } from "./fields";
import { Section } from "./network-ui";
import { RouteList } from "./RouteList";
import { COMMISSION_STATUS_LABELS, INTRO_KIND_LABELS, ROOT_ID, TASK_STATUS_LABELS, findRoutes, loadGraph, personKey } from "@/lib/network";

export function ArrivalRoutes({ ws, personId }: { ws: string; personId: string }) {
  const { data: graph } = useQuery({ queryKey: ["graph", ws], queryFn: () => loadGraph(ws) });
  if (!graph) return null;
  const routes = findRoutes(graph, ROOT_ID, personKey(personId), 6);
  const label = (id: string) => graph.nodes.get(id)?.label ?? "?";
  return (
    <Section title="Rutas de llegada desde IVLP · equipo">
      <RouteList routes={routes} label={label} />
    </Section>
  );
}

export function CommissionInterest({ ws, personId }: { ws: string; personId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: ci } = useQuery({
    queryKey: ["commission", personId],
    queryFn: async () => (await supabase.from("commission_interest").select("*, conversations(title)").eq("person_id", personId).maybeSingle()).data,
  });
  const { data: convs = [] } = useQuery({
    queryKey: ["convs", ws, personId, "opts"],
    queryFn: async () => {
      const { data: l } = await supabase.from("conversation_links").select("conversations(id, title)").eq("person_id", personId);
      return (l ?? []).map((x) => x.conversations).filter(Boolean) as { id: string; title: string }[];
    },
  });
  const [d, setD] = useState({ wants_refer: false, wants_sell: false, status: "not_discussed", conditions: "", notes: "", conversation_id: "" });
  function start() {
    setD({ wants_refer: ci?.wants_refer ?? false, wants_sell: ci?.wants_sell ?? false, status: ci?.status ?? "not_discussed", conditions: ci?.conditions ?? "", notes: ci?.notes ?? "", conversation_id: ci?.conversation_id ?? "" });
    setEditing(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { workspace_id: ws, person_id: personId, wants_refer: d.wants_refer, wants_sell: d.wants_sell, status: d.status as never, conditions: d.conditions.trim() || null, notes: d.notes.trim() || null, conversation_id: d.conversation_id || null };
    const { error } = ci ? await supabase.from("commission_interest").update(row).eq("id", ci.id) : await supabase.from("commission_interest").insert(row);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["commission", personId] }); setEditing(false);
  }
  return (
    <Section title="Interés en referir o vender por comisión" action={!editing && <Button size="sm" variant="outline" onClick={start}>{ci ? "Editar" : "Registrar interés"}</Button>}>
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.wants_refer} onChange={(e) => setD({ ...d, wants_refer: e.target.checked })} />Interés en referir</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.wants_sell} onChange={(e) => setD({ ...d, wants_sell: e.target.checked })} />Interés en vender</label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Estado" htmlFor="ci-s"><select id="ci-s" className={selectClass} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>{Object.entries(COMMISSION_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Conversación vinculada" htmlFor="ci-c"><select id="ci-c" className={selectClass} value={d.conversation_id} onChange={(e) => setD({ ...d, conversation_id: e.target.value })}><option value="">—</option>{convs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
          </div>
          <Field label="Condiciones acordadas (opcional)" htmlFor="ci-cond" hint="Solo texto; la app no calcula pagos."><Textarea id="ci-cond" rows={2} value={d.conditions} onChange={(e) => setD({ ...d, conditions: e.target.value })} /></Field>
          <Field label="Notas" htmlFor="ci-n"><Textarea id="ci-n" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
          <div className="flex gap-3"><Button size="sm" type="submit">Guardar</Button><Button size="sm" type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button></div>
        </form>
      ) : ci ? (
        <dl className="grid gap-4 text-sm md:grid-cols-3">
          <div><dt className="label-mono text-muted-foreground">Interés</dt><dd>{[ci.wants_refer && "Referir", ci.wants_sell && "Vender"].filter(Boolean).join(" · ") || "No indicado"}</dd></div>
          <div><dt className="label-mono text-muted-foreground">Estado</dt><dd>{COMMISSION_STATUS_LABELS[ci.status]}{ci.status !== "agreed" && " · sin acuerdo"}</dd></div>
          <div><dt className="label-mono text-muted-foreground">Conversación</dt><dd>{(ci.conversations as { title: string } | null)?.title ?? "—"}</dd></div>
          <div className="md:col-span-3"><dt className="label-mono text-muted-foreground">Condiciones</dt><dd>{ci.conditions || "Sin condiciones acordadas"}</dd></div>
          {ci.notes && <div className="md:col-span-3"><dt className="label-mono text-muted-foreground">Notas</dt><dd>{ci.notes}</dd></div>}
        </dl>
      ) : <p className="text-sm text-muted-foreground">Sin registro. No se asume que un conector aceptó vender.</p>}
    </Section>
  );
}

export function History({ ws, personId, orgId }: { ws: string; personId?: string; orgId?: string }) {
  const { data = [] } = useQuery({
    queryKey: ["history", ws, personId, orgId],
    queryFn: async () => {
      const items: { date: string; kind: string; text: string }[] = [];
      let iq = supabase.from("introductions").select("kind, status, purpose, requested_at, occurred_at, created_at").eq("workspace_id", ws);
      iq = personId ? iq.or(`introducer_person_id.eq.${personId},introduced_person_id.eq.${personId},target_person_id.eq.${personId}`) : iq.eq("target_org_id", orgId!);
      for (const i of (await iq).data ?? []) items.push({ date: i.occurred_at ?? i.requested_at ?? i.created_at.slice(0, 10), kind: "Introducción", text: `${INTRO_KIND_LABELS[i.kind]}${i.purpose ? ` · ${i.purpose}` : ""}` });
      const { data: cl } = await supabase.from("conversation_links").select("conversations(title, occurred_at)").eq(personId ? "person_id" : "organization_id", (personId ?? orgId)!);
      for (const c of cl ?? []) { const cv = c.conversations as { title: string; occurred_at: string } | null; if (cv) items.push({ date: cv.occurred_at, kind: "Conversación", text: cv.title }); }
      let tq = supabase.from("tasks").select("title, status, created_at, completed_at").eq("workspace_id", ws);
      tq = personId ? tq.or(`person_id.eq.${personId},waiting_on_person_id.eq.${personId}`) : tq.eq("organization_id", orgId!);
      for (const t of (await tq).data ?? []) items.push({ date: (t.completed_at ?? t.created_at).slice(0, 10), kind: "Tarea", text: `${t.title} · ${TASK_STATUS_LABELS[t.status]}` });
      return items.sort((a, b) => b.date.localeCompare(a.date));
    },
  });
  return (
    <Section title="Historial">
      <ol className="space-y-2">
        {data.map((h, i) => <li key={i} className="grid grid-cols-[100px_120px_1fr] gap-3 text-sm"><span className="font-mono text-xs text-muted-foreground">{h.date}</span><span className="label-mono text-primary">{h.kind}</span><span>{h.text}</span></li>)}
        {data.length === 0 && <li className="text-sm text-muted-foreground">Sin actividad registrada.</li>}
      </ol>
    </Section>
  );
}
