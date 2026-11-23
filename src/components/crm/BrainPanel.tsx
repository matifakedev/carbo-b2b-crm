import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { askBrain } from "@/lib/brain.functions";
import type { Claim } from "@/lib/brain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tag } from "@/components/crm/fields";

type Focus = "person" | "organization" | "introduction" | "conversation" | "project" | "opportunity";
type Rec = { ref: string; type: string; label: string };
type Result = Awaited<ReturnType<typeof askBrain>>;

const QUICK = ["¿Cómo llegamos?", "¿Qué sabemos?", "¿Qué falta confirmar?", "¿Qué compromisos existen?", "¿Qué próximo paso podría tener sentido?"];

export function RefChip({ r }: { r: Rec | undefined }) {
  if (!r) return null;
  const id = r.ref.split(":")[1] ?? "";
  const cls = "border border-border px-1.5 py-0.5 font-mono text-[10px] hover:text-primary";
  if (r.type === "person") return <Link to="/personas/$id" params={{ id }} className={cls}>{r.label}</Link>;
  if (r.type === "organization") return <Link to="/organizaciones/$id" params={{ id }} className={cls}>{r.label}</Link>;
  return <span className={cls} title={r.ref}>{r.type} · {r.label}</span>;
}

function Claims({ title, items, recs, tone }: { title: string; items: Claim[]; recs: Map<string, Rec>; tone: "success" | "warning" | "neutral" | "primary" }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <Tag tone={tone}>{title}</Tag>
      <ul className="space-y-2 text-sm">
        {items.map((c, i) => (
          <li key={i}>
            <div>{c.text}</div>
            {c.refs.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.refs.map((r) => <RefChip key={r} r={recs.get(r)} />)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BrainPanel({ ws, focusType, focusId }: { ws: string; focusType: Focus; focusId: string }) {
  const ask = useServerFn(askBrain);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(question: string) {
    setQ(question); setBusy(true); setErr(null); setRes(null);
    try { setRes(await ask({ data: { workspace_id: ws, focus_type: focusType, focus_id: focusId, question } })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error inesperado"); }
    finally { setBusy(false); }
  }
  const recs = new Map<string, Rec>(res && res.status === "ok" ? res.records.map((r) => [r.ref, r]) : []);

  return (
    <div className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4">
      <div className="flex items-center justify-between"><span className="label-mono text-muted-foreground">Brain · contexto autorizado</span></div>
      <div className="flex flex-wrap gap-2">{QUICK.map((x) => <Button key={x} size="sm" variant="outline" disabled={busy} onClick={() => run(x)}>{x}</Button>)}</div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void run(q.trim()); }}>
        <Textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Preguntá sobre este registro…" aria-label="Pregunta al Brain" />
        <Button type="submit" size="sm" disabled={busy || !q.trim()}>{busy ? "Pensando…" : "Preguntar"}</Button>
      </form>
      {busy && <p className="text-sm text-muted-foreground">Consultando registros y esperando al proveedor…</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {res?.status === "not_configured" && <p className="text-sm text-warning">El Brain no está configurado. El CRM manual sigue funcionando.</p>}
      {res?.status === "error" && <p className="text-sm text-destructive">{res.message}</p>}
      {res?.status === "ok" && (
        <div className="space-y-4">
          <p className="font-mono text-xs text-muted-foreground">{res.scope}</p>
          <Claims title="Hechos" items={res.answer.facts} recs={recs} tone="success" />
          <Claims title="Compromisos" items={res.answer.commitments} recs={recs} tone="primary" />
          <Claims title="Hipótesis" items={res.answer.hypotheses} recs={recs} tone="warning" />
          <Claims title="Desconocidos / a confirmar" items={res.answer.unknowns} recs={recs} tone="neutral" />
          <Claims title="Próximo paso sugerido" items={res.answer.next_steps} recs={recs} tone="neutral" />
        </div>
      )}
    </div>
  );
}

export function BrainToggle(props: { ws: string; focusType: Focus; focusId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "Cerrar Brain" : (props.label ?? "Preguntar al Brain")}</Button>
      {open && <BrainPanel ws={props.ws} focusType={props.focusType} focusId={props.focusId} />}
    </div>
  );
}
