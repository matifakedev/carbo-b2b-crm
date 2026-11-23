import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runResearch } from "@/lib/research.functions";
import type { Fit } from "@/lib/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Tag } from "@/components/crm/fields";
import { Section } from "@/components/crm/network-ui";

const COND: Record<string, [string, "success" | "warning" | "error"]> = { fact: ["Hecho", "success"], hypothesis: ["Hipótesis", "warning"], insufficient: ["Evidencia insuficiente", "error"] };
const CAT: Record<string, string> = { member: "Miembro", project: "Proyecto", need: "Necesidad", association: "Asociación", other: "Otro" };
const STATUS: Record<string, string> = { running: "En curso", done: "Completa", partial: "Parcial (con errores)", not_configured: "Búsqueda no configurada", failed: "Falló" };

export function ResearchPanel({ ws, orgId }: { ws: string; orgId: string }) {
  const qc = useQueryClient();
  const run = useServerFn(runResearch);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(""); const [web, setWeb] = useState(true); const [urls, setUrls] = useState("");
  const [pTitle, setPTitle] = useState(""); const [pUrl, setPUrl] = useState(""); const [pText, setPText] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: runs = [] } = useQuery({
    queryKey: ["research", orgId],
    queryFn: async () => (await supabase.from("research_runs").select("*, research_findings(*)").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  async function go() {
    if (!web && !urls.trim() && !pText.trim()) { toast.error("Elegí búsqueda web, URLs o pegá una fuente."); return; }
    setBusy(true);
    try {
      const r = await run({ data: { workspace_id: ws, organization_id: orgId, focus, web_search: web, urls: urls.split(/\s+/).filter(Boolean), pasted: pText.trim() ? { title: pTitle, url: pUrl, text: pText } : null } });
      if (r.status === "not_configured") toast.error("La búsqueda web no está configurada. Podés aportar fuentes pegando texto.");
      else if (r.status === "failed") toast.error("La investigación falló: " + r.errors.join(" · "));
      else toast.success(r.status === "partial" ? "Investigación parcial: revisá los avisos." : "Investigación lista para revisar.");
      setOpen(false); setPText(""); setUrls("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["research", orgId] }); }
  }
  return (
    <Section title="Investigación" action={!open && <Button size="sm" onClick={() => setOpen(true)}>Investigar</Button>}>
      <p className="mb-4 text-sm text-muted-foreground">Busca en la web miembros, proyectos y necesidades. Todo queda como borrador: nada se agrega al CRM sin tu revisión. Lo que no tenga cita verificable se marca como evidencia insuficiente.</p>
      {open && (
        <div className="mb-6 space-y-4 rounded-sm border border-border-strong p-4">
          <Field label="Enfoque (opcional)" htmlFor="rf"><Input id="rf" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ej.: proyectos de respaldo energético 2026" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Buscar en la web</label>
          <Field label="URLs específicas para leer (opcional, separadas por espacio)" htmlFor="ru"><Input id="ru" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://…" /></Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Fuente propia: título" htmlFor="pt"><Input id="pt" value={pTitle} onChange={(e) => setPTitle(e.target.value)} /></Field>
            <Field label="Fuente propia: URL o referencia" htmlFor="pu"><Input id="pu" value={pUrl} onChange={(e) => setPUrl(e.target.value)} /></Field>
          </div>
          <Field label="Fuente propia: texto pegado" htmlFor="ptx"><Textarea id="ptx" rows={4} value={pText} onChange={(e) => setPText(e.target.value)} /></Field>
          <div className="flex gap-2"><Button onClick={go} disabled={busy}>{busy ? "Investigando… (puede tardar 1 minuto)" : "Investigar"}</Button><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button></div>
        </div>
      )}
      {runs.length === 0 && <p className="text-sm text-muted-foreground">Sin investigaciones todavía.</p>}
      <div className="space-y-6">
        {runs.map((r) => <RunView key={r.id} r={r as never} />)}
      </div>
    </Section>
  );
}

type Finding = { id: string; url: string; source_title: string | null; fetched_at: string; published_at: string | null; provided_by_user: boolean; category: string; statement: string; quote: string | null; condition: string; note: string | null; position: number };
type RunRow = { id: string; created_at: string; focus: string | null; query: string | null; status: string; search_error: string | null; extraction_id: string | null; fit: { fits: Fit[]; note: string | null } | null; intro_draft: string | null; research_findings: Finding[] };

function RunView({ r }: { r: RunRow }) {
  const findings = [...r.research_findings].sort((a, b) => a.position - b.position);
  return (
    <article className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{new Date(r.created_at).toLocaleString("es-AR")}</span>
        <Tag tone={r.status === "done" ? "success" : r.status === "partial" ? "warning" : r.status === "running" ? "neutral" : "error"}>{STATUS[r.status] ?? r.status}</Tag>
        {r.query && <span className="font-mono text-xs text-muted-foreground">búsqueda: {r.query}</span>}
      </div>
      {r.status === "not_configured" && <p className="text-sm text-destructive">No hay servicio de búsqueda web configurado: no se consultó internet y no se presenta memoria del modelo como investigación. Aportá fuentes pegando texto.</p>}
      {r.search_error && <p className="text-sm text-destructive">{r.search_error}</p>}
      {findings.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {findings.map((f) => (
            <li key={f.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2"><Tag tone={COND[f.condition]?.[1] ?? "neutral"}>{COND[f.condition]?.[0] ?? f.condition}</Tag><Tag>{CAT[f.category] ?? f.category}</Tag><span className="font-semibold">{f.statement}</span></div>
              {f.quote && <blockquote className="border-l-2 border-primary pl-3 text-sm italic">“{f.quote}”</blockquote>}
              {f.note && <p className="text-sm text-warning">{f.note}</p>}
              <div className="font-mono text-xs text-muted-foreground">
                {/^https?:\/\//.test(f.url) ? <a href={f.url} target="_blank" rel="noreferrer noopener" className="text-primary underline">{f.source_title || f.url}</a> : f.url}
                {" · consultada "}{new Date(f.fetched_at).toLocaleDateString("es-AR")}{" · publicada "}{f.published_at ?? "sin fecha"}{f.provided_by_user ? " · aportada por el equipo" : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
      {r.fit && (
        <div className="space-y-2">
          <h3 className="label-mono text-muted-foreground">Encaje con capacidades aprobadas de Carbo</h3>
          {r.fit.note && <p className="text-sm text-muted-foreground">{r.fit.note}</p>}
          {r.fit.fits.map((x, i) => (
            <div key={i} className="rounded-sm border border-border p-3 text-sm">
              <div className="font-semibold">{x.need}</div>
              <p className="mt-1"><span className="label-mono">Encaje posible:</span> {x.assessment}</p>
              <p><span className="label-mono">Dudas:</span> {x.doubts || "—"}</p>
              <p><span className="label-mono">A validar:</span> {x.to_validate || "—"}</p>
              <p className="font-mono text-xs text-muted-foreground">hallazgos {x.finding_ids.map((n) => n + 1).join(", ") || "ninguno"} · capacidades {x.capability_ids.length}</p>
            </div>
          ))}
        </div>
      )}
      {r.intro_draft && (
        <div className="space-y-2">
          <h3 className="label-mono text-muted-foreground">Borrador de pedido de introducción (no se envía)</h3>
          <pre className="whitespace-pre-wrap rounded-sm border border-border bg-card p-3 font-sans text-sm">{r.intro_draft}</pre>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(r.intro_draft!); toast.success("Copiado. Revisalo antes de enviarlo por tu cuenta."); }}>Copiar borrador</Button>
        </div>
      )}
      {r.extraction_id && <Link to="/conversaciones/revision/$id" params={{ id: r.extraction_id }} className="inline-block text-sm font-semibold text-primary underline">Revisar propuestas para el CRM</Link>}
    </article>
  );
}
