import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Field, Tag, selectClass } from "@/components/crm/fields";
import { Section } from "@/components/crm/network-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FIELDS, MAX_ROWS, buildRows, computeEffect, decisionErrors, defaultDecision, guessMapping, normName, parseDelimited, sha256Hex,
  type Decision, type FieldKey, type Grid, type Mapping, type Row,
} from "@/lib/ivlp-import";

const META = "Importá la agenda IVLP desde CSV o Excel con mapeo de columnas, vista previa, validación y revisión de duplicados.";
export const Route = createFileRoute("/_authenticated/importar-agenda")({
  head: () => ({ meta: [{ title: "Importar agenda IVLP · CRM - CARBO" }, { name: "description", content: META }, { property: "og:title", content: "Importar agenda IVLP · CRM - CARBO" }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ImportPage,
});

type Dup = { id: string; full_name: string; archived: boolean; reason: string };
type FileState = { name: string; hash: string; sheets: Record<string, Grid>; sheet: string };

function ImportPage() {
  const { current } = useWorkspace();
  const ws = current?.id;
  const qc = useQueryClient();
  const [file, setFile] = useState<FileState | null>(null);
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Mapping>({});
  const [step, setStep] = useState<"upload" | "map" | "review">("upload");
  const [dups, setDups] = useState<Record<number, Dup[]>>({});
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [existingOrgs, setExistingOrgs] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ already: boolean; summary: Record<string, number> } | null>(null);

  const grid = file ? file.sheets[file.sheet] ?? [] : [];
  const header = (grid[headerRow - 1] ?? []).map((h) => String(h ?? ""));
  const body = grid.slice(headerRow);
  const rows: Row[] = useMemo(() => (step === "review" ? buildRows(header, body, mapping, headerRow) : []), [step, file, headerRow, mapping]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(f: File) {
    setResult(null);
    if (f.size > 10 * 1024 * 1024) { toast.error("El archivo supera 10 MB."); return; }
    const buf = await f.arrayBuffer();
    const hash = await sha256Hex(buf);
    let sheets: Record<string, Grid> = {};
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { cellDates: true });
      for (const n of wb.SheetNames) sheets[n] = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n]!, { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "" }) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
    } else {
      const { rows: parsed, error } = parseDelimited(new TextDecoder().decode(buf));
      if (error) { toast.error(error); return; }
      sheets = { [f.name]: parsed };
    }
    const first = Object.keys(sheets)[0];
    if (!first) { toast.error("El archivo no tiene hojas."); return; }
    const total = (sheets[first] ?? []).length - 1;
    if (total > MAX_ROWS) { toast.error(`El archivo tiene ${total} filas; el máximo por lote es ${MAX_ROWS}. Dividilo.`); return; }
    setFile({ name: f.name, hash, sheets, sheet: first }); setHeaderRow(1);
    setMapping(guessMapping((sheets[first]?.[0] ?? []).map(String))); setStep("map");
  }

  async function toReview() {
    if (mapping.full_name == null) { toast.error("Mapeá al menos la columna de nombre."); return; }
    const built = buildRows(header, body, mapping, headerRow);
    setBusy(true);
    const found: Record<number, Dup[]> = {};
    const cache = new Map<string, Dup[]>();
    for (const r of built) {
      if (!r.full_name) continue;
      const k = normName(r.full_name) + "|" + r.email + "|" + r.phone;
      if (!cache.has(k)) {
        const { data } = await supabase.rpc("find_person_duplicates", { _ws: ws!, _name: r.full_name, _contacts: [r.email, r.phone].filter(Boolean) });
        cache.set(k, (data ?? []) as Dup[]);
      }
      found[r.row_number] = cache.get(k)!;
    }
    const { data: orgs } = await supabase.from("organizations").select("normalized_name").eq("workspace_id", ws!).is("archived_at", null);
    setExistingOrgs(new Set((orgs ?? []).map((o) => normName(o.normalized_name ?? ""))));
    setDups(found);
    setDecisions(Object.fromEntries(built.map((r) => [r.row_number, defaultDecision(r, (found[r.row_number] ?? []).length)])));
    setBusy(false); setStep("review");
  }

  const effect = computeEffect(rows, decisions, existingOrgs);
  const errs = decisionErrors(rows, decisions);

  async function apply() {
    if (!file || !ws) return;
    setBusy(true);
    const payload = rows.filter((r) => (decisions[r.row_number] ?? "pending") !== "pending").map((r) => ({
      row_number: r.row_number, raw: r.raw, decision: decisions[r.row_number], full_name: r.full_name, title: r.title, org_name: r.org_name,
      email: r.email, phone: r.phone, meeting: r.meeting, date: r.date, city: r.city, notes: r.notes,
    }));
    const { data, error } = await supabase.rpc("apply_import_batch", { _ws: ws, _hash: file.hash, _file: file.name, _rows: payload as never });
    setBusy(false); setConfirmOpen(false);
    if (error) { toast.error("No se aplicó nada: " + error.message); return; }
    const r = data as { already_applied: boolean; summary: Record<string, number> };
    setResult({ already: r.already_applied, summary: r.summary });
    if (r.already_applied) toast.message("Este archivo ya estaba importado: no se duplicó nada.");
    else toast.success("Lote importado");
    setStep("upload"); setFile(null);
    await qc.invalidateQueries();
  }

  if (!ws) return null;
  return (
    <>
      <PageHeader crumb={`Agenda / ${current?.name}`} title="Importar agenda IVLP" />
      {result && <ResultBox r={result} />}
      {step === "upload" && (
        <Section title="1 · Archivo">
          <p className="mb-3 text-sm text-muted-foreground">CSV, TSV o Excel (.xlsx). Hasta {MAX_ROWS} filas. El mismo archivo no se importa dos veces.</p>
          <Input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" aria-label="Archivo de agenda" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        </Section>
      )}
      {step === "map" && file && (
        <Section title="2 · Mapeo de columnas">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {Object.keys(file.sheets).length > 1 && (
              <Field label="Hoja" htmlFor="sheet"><select id="sheet" className={selectClass} value={file.sheet} onChange={(e) => { setFile({ ...file, sheet: e.target.value }); setMapping(guessMapping((file.sheets[e.target.value]?.[headerRow - 1] ?? []).map(String))); }}>{Object.keys(file.sheets).map((s) => <option key={s}>{s}</option>)}</select></Field>
            )}
            <Field label="Fila de encabezado" htmlFor="hr"><Input id="hr" type="number" min={1} value={headerRow} onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); setHeaderRow(n); setMapping(guessMapping((grid[n - 1] ?? []).map(String))); }} /></Field>
            <div className="text-sm text-muted-foreground md:self-end">{body.length} filas de datos en «{file.name}»</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(FIELDS) as FieldKey[]).map((k) => (
              <Field key={k} label={FIELDS[k] + (k === "full_name" ? " *" : "")} htmlFor={`m-${k}`}>
                <select id={`m-${k}`} className={selectClass} value={mapping[k] ?? ""} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">— No importar —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <div className="mt-4 overflow-auto"><table className="text-xs"><tbody>{grid.slice(headerRow - 1, headerRow + 3).map((r, i) => <tr key={i} className={i === 0 ? "font-semibold" : ""}>{r.map((c, j) => <td key={j} className="border border-border px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>
          <div className="mt-4 flex gap-2"><Button onClick={toReview} disabled={busy}>{busy ? "Buscando coincidencias…" : "Vista previa"}</Button><Button variant="outline" onClick={() => { setStep("upload"); setFile(null); }}>Cancelar</Button></div>
        </Section>
      )}
      {step === "review" && file && (
        <Section title="3 · Vista previa y revisión">
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Tag>{rows.length} filas</Tag><Tag tone="error">{rows.filter((r) => r.errors.length).length} con errores</Tag>
            <Tag tone="warning">{rows.filter((r) => r.warnings.length).length} con advertencias</Tag>
            <Tag tone="warning">{rows.filter((r) => (dups[r.row_number] ?? []).length || r.sameNameRows.length).length} posibles duplicados</Tag>
            <Tag tone={effect.pending ? "error" : "success"}>{effect.pending} sin decidir</Tag>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">Las personas de una misma reunión quedan vinculadas a la reunión, no entre sí. El origen del viaje (reunión, fecha, ciudad) se guarda aparte del origen de emails y teléfonos.</p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="label-mono text-left text-muted-foreground"><th className="p-2">Fila</th><th className="p-2">Persona</th><th className="p-2">Organización</th><th className="p-2">Reunión</th><th className="p-2">Validación</th><th className="p-2">Decisión</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row_number} className="border-t border-border align-top">
                    <td className="p-2 font-mono">{r.row_number}</td>
                    <td className="p-2"><div className="font-semibold">{r.full_name || "—"}</div><div className="text-xs">{r.title}</div><div className="font-mono text-xs text-muted-foreground">{[r.email, r.phone].filter(Boolean).join(" · ")}</div></td>
                    <td className="p-2">{r.org_name || "—"}{r.org_name && existingOrgs.has(normName(r.org_name)) && <div className="text-xs text-muted-foreground">ya existe</div>}</td>
                    <td className="p-2">{r.meeting || "—"}<div className="font-mono text-xs text-muted-foreground">{[r.date, r.city].filter(Boolean).join(" · ")}</div></td>
                    <td className="p-2 text-xs">{r.errors.map((e) => <div key={e} className="text-destructive">{e}</div>)}{r.warnings.map((w) => <div key={w} className="text-warning">{w}</div>)}{(dups[r.row_number] ?? []).length > 0 && <div className="text-warning">Coincide con personas existentes</div>}</td>
                    <td className="p-2">
                      <select aria-label={`Decisión fila ${r.row_number}`} className={selectClass} value={decisions[r.row_number] ?? "pending"} onChange={(e) => setDecisions({ ...decisions, [r.row_number]: e.target.value })}>
                        <option value="pending">— Decidir —</option>
                        {!r.errors.length && <option value="new">Crear persona nueva</option>}
                        {!r.errors.length && (dups[r.row_number] ?? []).map((d) => <option key={d.id} value={`existing:${d.id}`}>Asociar a {d.full_name} ({d.reason}{d.archived ? ", archivada" : ""})</option>)}
                        {!r.errors.length && r.sameNameRows.filter((n) => n < r.row_number).map((n) => <option key={n} value={`row:${n}`}>Misma persona que fila {n}</option>)}
                        <option value="skip">Omitir fila</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errs.length > 0 && <ul className="mt-3 text-sm text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={effect.pending > 0 || errs.length > 0 || busy} onClick={() => setConfirmOpen(true)}>Revisar efecto y aplicar</Button>
            <Button variant="outline" onClick={() => setStep("map")}>Volver al mapeo</Button>
          </div>
          {effect.pending > 0 && <p className="mt-2 text-sm text-muted-foreground">Decidí todas las filas marcadas antes de aplicar.</p>}
        </Section>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importación de «{file?.name}»</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="space-y-1 text-sm">
                <li>{effect.people_new} personas nuevas</li>
                <li>{effect.people_linked} filas asociadas a personas existentes o a otra fila</li>
                <li>{effect.orgs_new} organizaciones nuevas · {effect.orgs_existing} existentes reutilizadas</li>
                <li>{effect.meetings} reuniones · {effect.participants} participaciones</li>
                <li>hasta {effect.contacts} datos de contacto (solo si no existían)</li>
                <li>{effect.skipped} filas omitidas</li>
                <li>No se crean vínculos entre participantes.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void apply(); }}>{busy ? "Aplicando…" : "Aplicar importación"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Batches ws={ws} />
    </>
  );
}

const LABELS: Record<string, string> = { people_new: "personas nuevas", people_linked: "asociadas", skipped: "omitidas", orgs_new: "organizaciones nuevas", orgs_existing: "organizaciones existentes", affiliations: "afiliaciones", meetings: "reuniones", participants: "participaciones", contacts: "contactos" };
function ResultBox({ r }: { r: { already: boolean; summary: Record<string, number> } }) {
  return (
    <div className="panel mb-6 p-4 text-sm">
      <div className="font-semibold">{r.already ? "Este archivo ya estaba importado: no se duplicó nada." : "Importación aplicada."}</div>
      <div className="mt-1 font-mono text-xs">{Object.entries(r.summary ?? {}).map(([k, v]) => `${v} ${LABELS[k] ?? k}`).join(" · ")}</div>
      <Link to="/agenda" className="mt-2 inline-block text-primary underline">Ver reuniones en la agenda</Link>
    </div>
  );
}

function Batches({ ws }: { ws: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["import-batches", ws], queryFn: async () => (await supabase.from("import_batches").select("*").eq("workspace_id", ws).order("created_at", { ascending: false })).data ?? [] });
  async function revert(id: string) {
    if (!confirm("¿Revertir este lote? Se archivará solo lo que el lote creó y nadie modificó ni relacionó después.")) return;
    const { data: r, error } = await supabase.rpc("revert_import_batch", { _batch: id });
    if (error) { toast.error(error.message); return; }
    const s = r as { people: number; orgs: number; kept: { type: string; name: string; reason: string }[] };
    toast.success(`Revertido: ${s.people} personas y ${s.orgs} organizaciones archivadas; ${s.kept.length} registros conservados.`, { description: s.kept.slice(0, 12).map((k) => `${k.type} ${k.name}: ${k.reason}`).join(" · ") || undefined, duration: 15000 });
    await qc.invalidateQueries();
  }
  return (
    <Section title="Lotes importados">
      <ul className="divide-y divide-border border-y border-border">
        {data.length === 0 && <li className="py-4 text-sm text-muted-foreground">Sin lotes todavía.</li>}
        {data.map((b) => {
          const rs = b.revert_summary as { kept?: { type: string; name: string; reason: string }[] } | null;
          return (
            <li key={b.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{b.file_name}</span><Tag tone={b.status === "applied" ? "success" : "neutral"}>{b.status === "applied" ? "Aplicado" : "Revertido"}</Tag><span className="font-mono text-xs text-muted-foreground">lote {b.id.slice(0, 8)} · {b.applied_at ? new Date(b.applied_at).toLocaleString("es-AR") : ""}</span>
                {b.status === "applied" && <Button size="sm" variant="outline" onClick={() => revert(b.id)}>Revertir lote</Button>}</div>
              <div className="font-mono text-xs">{Object.entries((b.summary ?? {}) as Record<string, number>).map(([k, v]) => `${v} ${LABELS[k] ?? k}`).join(" · ")}</div>
              {rs?.kept?.length ? <div className="text-xs text-muted-foreground">Conservados al revertir: {rs.kept.map((k) => `${k.name} (${k.type}: ${k.reason})`).join("; ")}</div> : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
