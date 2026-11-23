import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Field, Tag, useMemberNames } from "@/components/crm/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const META = "Ficha interna de capacidades de Carbo revisada por administradores: aplicaciones, límites, evidencia y qué se puede comunicar.";
export const Route = createFileRoute("/_authenticated/capacidades")({
  head: () => ({ meta: [{ title: "Capacidades de Carbo · CRM - CARBO" }, { name: "description", content: META }, { property: "og:title", content: "Capacidades de Carbo · CRM - CARBO" }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Capabilities,
});

const STATUS: Record<string, [string, "neutral" | "warning" | "success" | "error"]> = { draft: ["Borrador", "neutral"], in_review: ["En revisión", "warning"], approved: ["Aprobada", "success"], retired: ["Retirada", "error"] };
type Cap = { id: string; title: string; applications: string | null; limits: string | null; evidence: string | null; references_text: string | null; communicable: string | null; is_commercial_sensitive: boolean; status: string; approved_by: string | null; approved_at: string | null };
const EMPTY = { title: "", applications: "", limits: "", evidence: "", references_text: "", communicable: "", is_commercial_sensitive: false };

function Capabilities() {
  const { current } = useWorkspace();
  const ws = current?.id; const isAdmin = current?.role === "admin";
  const qc = useQueryClient();
  const { data: names = {} } = useMemberNames(ws);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { data: caps = [] } = useQuery({
    queryKey: ["caps", ws], enabled: !!ws,
    queryFn: async () => ((await supabase.from("carbo_capabilities").select("*").eq("workspace_id", ws!).is("archived_at", null).order("title")).data ?? []) as Cap[],
  });
  if (!ws) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["caps", ws] });
  async function setStatus(c: Cap, status: string) {
    const { error } = await supabase.from("carbo_capabilities").update({ status }).eq("id", c.id);
    if (error) toast.error(error.message); else { toast.success("Estado actualizado"); refresh(); }
  }
  return (
    <>
      <PageHeader crumb={`Carbo / ${current?.name}`} title="Capacidades de Carbo" action={!editing && <Button onClick={() => setEditing("new")}>Nueva capacidad</Button>} />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">Solo las capacidades <strong>aprobadas</strong> por un administrador (David o Matías) se usan para evaluar encaje. Solo el texto de «Autorizado a comunicar» de capacidades aprobadas y no marcadas como comerciales sensibles puede aparecer en borradores externos. Editar una capacidad aprobada la devuelve a revisión salvo que lo haga un administrador.</p>
      {editing === "new" && <CapForm ws={ws} initial={EMPTY} onDone={() => { setEditing(null); refresh(); }} />}
      <div className="space-y-4">
        {caps.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay capacidades cargadas.</p>}
        {caps.map((c) => editing === c.id ? <CapForm key={c.id} ws={ws} id={c.id} initial={{ ...EMPTY, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ""])), is_commercial_sensitive: c.is_commercial_sensitive }} onDone={() => { setEditing(null); refresh(); }} /> : (
          <article key={c.id} className="panel space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{c.title}</h2><Tag tone={STATUS[c.status]?.[1] ?? "neutral"}>{STATUS[c.status]?.[0] ?? c.status}</Tag>{c.is_commercial_sensitive && <Tag tone="warning">Comercial · uso interno</Tag>}</div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <Item k="Aplicaciones" v={c.applications} /><Item k="Límites" v={c.limits} /><Item k="Evidencia" v={c.evidence} /><Item k="Referencias" v={c.references_text} />
              <div className="md:col-span-2"><Item k="Autorizado a comunicar" v={c.communicable || "Nada autorizado todavía"} /></div>
            </dl>
            {c.approved_at && <p className="font-mono text-xs text-muted-foreground">Aprobada por {names[c.approved_by ?? ""] ?? "administrador"} · {new Date(c.approved_at).toLocaleString("es-AR")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(c.id)}>Editar</Button>
              {c.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus(c, "in_review")}>Enviar a revisión</Button>}
              {isAdmin && c.status !== "approved" && c.status !== "retired" && <Button size="sm" onClick={() => setStatus(c, "approved")}>Aprobar</Button>}
              {c.status !== "retired" && (isAdmin || c.status !== "approved") && <Button size="sm" variant="outline" onClick={() => setStatus(c, "retired")}>Retirar</Button>}
              {c.status === "retired" && <Button size="sm" variant="outline" onClick={() => setStatus(c, "draft")}>Reabrir como borrador</Button>}
            </div>
            {!isAdmin && c.status === "in_review" && <p className="text-xs text-muted-foreground">Pendiente de aprobación de un administrador.</p>}
          </article>
        ))}
      </div>
    </>
  );
}
function Item({ k, v }: { k: string; v: string | null }) { return <div><dt className="label-mono text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{v || "—"}</dd></div>; }

function CapForm({ ws, id, initial, onDone }: { ws: string; id?: string; initial: typeof EMPTY; onDone: () => void }) {
  const [d, setD] = useState(initial); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  async function save() {
    if (!d.title.trim()) { toast.error("El título es obligatorio"); return; }
    setBusy(true);
    const payload = { title: d.title.trim(), applications: d.applications || null, limits: d.limits || null, evidence: d.evidence || null, references_text: d.references_text || null, communicable: d.communicable || null, is_commercial_sensitive: d.is_commercial_sensitive };
    const { error } = id ? await supabase.from("carbo_capabilities").update(payload).eq("id", id) : await supabase.from("carbo_capabilities").insert({ ...payload, workspace_id: ws });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Capacidad guardada"); onDone();
  }
  return (
    <div className="panel mb-4 space-y-3 p-5">
      <Field label="Título" htmlFor="ct"><Input id="ct" value={d.title} onChange={set("title")} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Aplicaciones" htmlFor="ca"><Textarea id="ca" rows={3} value={d.applications} onChange={set("applications")} /></Field>
        <Field label="Límites" htmlFor="cl"><Textarea id="cl" rows={3} value={d.limits} onChange={set("limits")} /></Field>
        <Field label="Evidencia" htmlFor="ce"><Textarea id="ce" rows={3} value={d.evidence} onChange={set("evidence")} /></Field>
        <Field label="Referencias" htmlFor="cr"><Textarea id="cr" rows={3} value={d.references_text} onChange={set("references_text")} /></Field>
      </div>
      <Field label="Autorizado a comunicar (texto exacto que puede usarse hacia afuera)" htmlFor="cc"><Textarea id="cc" rows={3} value={d.communicable} onChange={set("communicable")} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.is_commercial_sensitive} onChange={(e) => setD({ ...d, is_commercial_sensitive: e.target.checked })} /> Contiene datos comerciales no aprobados para público (uso interno)</label>
      <div className="flex gap-2"><Button onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Button><Button variant="outline" onClick={onDone}>Cancelar</Button></div>
    </div>
  );
}
