import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendBrainMessage, type BatchCard, type ActionCard, type AttachmentRef, type Question, type ResearchCard } from "@/lib/chat.functions";
import { processAttachment } from "@/lib/attachments.functions";
import { ACCEPT, formatFromName, precheck, readSummary, verifyMagic } from "@/lib/attachments";
import { sha256Hex } from "@/lib/ivlp-import";
import { Button } from "@/components/ui/button";
import { Markdown, ProspectCard } from "@/components/crm/ProspectCard";
import { Textarea } from "@/components/ui/textarea";

type Msg = { id: string; role: "user" | "assistant"; content: string; created_at: string; parts: { actions?: ActionCard[]; question?: Question | null; error?: string | null; research?: ResearchCard[]; batch?: BatchCard | null; attachments?: AttachmentRef[] } };
type Att = { id: string; file_name: string; format: string; status: string; read_condition: string | null; pages_total: number | null; pages_read: number | null; limitation: string | null; error: string | null; structure: unknown };
const FINAL = new Set(["ready", "partial", "failed"]);

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["brain-messages", threadId], enabled: !!threadId,
    queryFn: async () => ((await supabase.from("brain_messages").select("*").eq("thread_id", threadId!).order("created_at")).data ?? []) as unknown as Msg[],
  });
}

/** Live status of attachments; polls while any is still uploading/processing. */
function useAttachments(ids: string[]) {
  return useQuery({
    queryKey: ["brain-attachments", ids.join(",")], enabled: ids.length > 0,
    queryFn: async () => ((await supabase.from("chat_attachments").select("id, file_name, format, status, read_condition, pages_total, pages_read, limitation, error, structure").in("id", ids)).data ?? []) as Att[],
    refetchInterval: (q) => ((q.state.data ?? []).some((a) => !FINAL.has(a.status)) ? 1500 : false),
  });
}

export function ChatView({ ws, threadId, focus, intro }: { ws: string; threadId: string | null; focus?: { type: string; id: string } | null; intro?: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const send = useServerFn(sendBrainMessage);
  const { data: msgs = [] } = useThreadMessages(threadId);
  const [pending, setPending] = useState<{ text: string; request_id: string; attachments: AttachmentRef[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" }); }, [msgs.length, pending, reduce]);
  const lastQuestion = msgs.length && msgs[msgs.length - 1]!.role === "assistant" ? msgs[msgs.length - 1]!.parts?.question : null;
  const { data: progress } = useQuery({
    queryKey: ["brain-progress", pending?.request_id], enabled: !!pending,
    queryFn: async () => (await supabase.from("brain_requests").select("progress").eq("workspace_id", ws).eq("request_id", pending!.request_id).maybeSingle()).data?.progress ?? null,
    refetchInterval: 1200,
  });

  async function submit(text: string, attachments: AttachmentRef[] = []) {
    if ((!text.trim() && !attachments.length) || pending) return false;
    const request_id = crypto.randomUUID();
    setPending({ text, request_id, attachments });
    try {
      const payload = { data: { workspace_id: ws, thread_id: threadId, text, focus: focus ?? null, request_id, attachment_ids: attachments.map((a) => a.id) } };
      // A lost response is retried with the same request id; the server never repeats effects.
      const r = await send(payload).catch((e: Error) => (/fetch|network|Failed/i.test(e.message) ? send(payload) : Promise.reject(e)));
      await qc.invalidateQueries({ queryKey: ["brain-messages", r.thread_id] });
      qc.invalidateQueries({ queryKey: ["brain-threads"] });
      qc.invalidateQueries({ predicate: (q) => !String(q.queryKey[0]).startsWith("brain-") });
      if (!threadId) navigate({ to: "/chat/$threadId", params: { threadId: r.thread_id } });
      return true;
    } catch (e) { toast.error((e as Error).message); return false; }
    finally { setPending(null); }
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[440px] flex-col lg:h-[calc(100dvh-8rem)]">
      <div className="flex-1 overflow-y-auto pb-6 pr-1" aria-live="polite">
        <div className="mx-auto max-w-3xl space-y-8">
          {!msgs.length && !pending && intro}
          {msgs.map((m) => <MessageView key={m.id} m={m} />)}
          {pending && (<>
            <UserBubble text={pending.text} attachments={pending.attachments} />
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-mint motion-safe:animate-pulse" aria-hidden />
              {progress ?? "Brain trabajando"}…
            </div>
          </>)}
          <div ref={endRef} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        {lastQuestion && lastQuestion.options.length > 0 && !pending && (
          <div className="mb-3 flex flex-wrap gap-2">{lastQuestion.options.map((o) => <Button key={o} size="sm" variant="outline" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => void submit(o)}>{o}</Button>)}</div>
        )}
        <Composer ws={ws} busy={!!pending} onSend={submit} />
      </div>
    </div>
  );
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setR(m.matches); const f = () => setR(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return r;
}

function UserBubble({ text, attachments = [] }: { text: string; attachments?: AttachmentRef[] }) {
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-2">
      {attachments.length > 0 && <AttachmentChips ids={attachments.map((a) => a.id)} names={attachments} />}
      {text && <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">{text.length > 1500 ? text.slice(0, 1500) + "… (texto completo guardado)" : text}</div>}
    </div>
  );
}

function AttachmentChips({ ids, names, onRemove }: { ids: string[]; names: AttachmentRef[]; onRemove?: (id: string) => void }) {
  const { data = [] } = useAttachments(ids);
  const process = useServerFn(processAttachment);
  const qc = useQueryClient();
  return (
    <ul className="flex w-full flex-wrap justify-end gap-2" aria-label="Archivos adjuntos">
      {ids.map((id) => {
        const a = data.find((x) => x.id === id); const name = a?.file_name ?? names.find((n) => n.id === id)?.file_name ?? "archivo";
        const tone = !a || !FINAL.has(a.status) ? "text-muted-foreground" : a.status === "failed" ? "text-destructive" : a.status === "partial" ? "text-warning" : "text-success";
        const sheet = a && ["csv", "xlsx", "xls"].includes(a.format) && a.status !== "failed";
        const retry = a && a.status === "failed" && !a.read_condition;
        return (
          <li key={id} className="max-w-full rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold uppercase text-muted-foreground">{a?.format ?? "…"}</span>
              <span className="min-w-0 truncate font-medium text-foreground" title={name}>{name}</span>
              {onRemove && <button type="button" onClick={() => onRemove(id)} aria-label={`Quitar ${name}`} className="ml-1 rounded px-1 text-muted-foreground transition-colors hover:text-foreground">×</button>}
            </div>
            <div className={`mt-0.5 ${tone}`}>{a ? readSummary(a) : "cargando"}</div>
            {a?.limitation && <div className="mt-0.5 max-w-xs text-muted-foreground">{a.limitation}</div>}
            {(sheet || retry) && (
              <div className="mt-1 flex gap-3">
                {sheet && <Link to="/importar-agenda" search={{ adjunto: id }} className="font-semibold text-primary underline-offset-2 hover:underline">Revisar mapeo e importar</Link>}
                {retry && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void process({ data: { attachment_id: id } }).finally(() => qc.invalidateQueries({ queryKey: ["brain-attachments"] }))}>Reintentar</button>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MessageView({ m }: { m: Msg }) {
  if (m.role === "user") return <UserBubble text={m.content} attachments={m.parts?.attachments ?? []} />;
  return (
    <div className="space-y-4">
      <div className="label-mono text-primary">Brain</div>
      <Markdown text={m.content} />
      {m.parts?.research?.map((r) => (
        <div key={r.run_id} className="space-y-2 border-l-2 border-primary/40 pl-4 text-sm">
          <div className="label-mono text-muted-foreground">{r.prospect ? "Prospección" : "Research"} · {r.organization}{r.prospect ? "" : ` · ${r.status === "done" ? "completo" : r.status === "not_configured" ? "búsqueda web no configurada" : r.status === "partial" ? "parcial" : "falló"}`}</div>
          {r.prospect && <ProspectCard p={r.prospect} />}
          {r.errors.length > 0 && <div className="text-xs text-destructive">{r.errors.join(" · ")}</div>}
          <div className="flex flex-wrap gap-3 text-xs">
            <Link to="/organizaciones/$id" params={{ id: r.organization_id }} className="font-semibold text-primary underline-offset-2 hover:underline">Ver fuentes y hallazgos →</Link>
            {r.proposals > 0 && <span className="text-muted-foreground">{r.proposals} propuestas para revisar en la ficha</span>}
          </div>
        </div>
      ))}
      {m.parts?.batch ? <BatchView b={m.parts.batch} /> : null}
      {m.parts?.actions?.length ? <ActionList actions={m.parts.actions} /> : null}
      {m.parts?.question && m.parts.question.question !== m.content && <div className="rounded-lg bg-mint/15 px-4 py-3 text-sm"><span className="label-mono text-accent-foreground">Pregunta</span><div className="mt-1">{m.parts.question.question}</div></div>}
    </div>
  );
}

function ActionList({ actions }: { actions: ActionCard[] }) {
  const ids = actions.map((a) => a.id);
  const qc = useQueryClient();
  const { data: undone = {} } = useQuery({
    queryKey: ["brain-actions-state", ids.join(",")],
    queryFn: async () => Object.fromEntries(((await supabase.from("brain_actions").select("id, undone_at").in("id", ids)).data ?? []).map((x) => [x.id, x.undone_at])),
  });
  async function undo(id: string) {
    const { data, error } = await supabase.rpc("brain_undo_action", { _id: id });
    if (error) { toast.error(error.message); return; }
    reportUndo(data); qc.invalidateQueries();
  }
  return (
    <ul aria-label="Cambios realizados" className="divide-y divide-border rounded-lg border border-border bg-card">
      {actions.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className={undone[a.id] ? "line-through text-muted-foreground" : ""}>{a.summary}</span>
          <span className="flex gap-2">
            {a.link && <RecordLink type={a.link.type} id={a.link.id} />}
            {undone[a.id] ? <span className="label-mono text-muted-foreground">Deshecho</span> : <Button size="sm" variant="outline" onClick={() => void undo(a.id)}>Deshacer</Button>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecordLink({ type, id }: { type: string; id: string }) {
  const cls = "self-center text-xs font-semibold text-primary underline-offset-2 hover:underline";
  if (type === "person") return <Link to="/personas/$id" params={{ id }} className={cls}>Ver ficha</Link>;
  if (type === "organization") return <Link to="/organizaciones/$id" params={{ id }} className={cls}>Ver ficha</Link>;
  if (type === "project") return <Link to="/proyectos/$id" params={{ id }} className={cls}>Ver proyecto</Link>;
  if (type === "task") return <Link to="/agenda" className={cls}>Ver agenda</Link>;
  return null;
}

function Composer({ ws, busy, onSend }: { ws: string; busy: boolean; onSend: (t: string, a: AttachmentRef[]) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<AttachmentRef[]>([]);
  const [uploading, setUploading] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const process = useServerFn(processAttachment);
  const qc = useQueryClient();
  useEffect(() => { if (!busy) ref.current?.focus(); }, [busy]);
  async function go() { const t = text; if (await onSend(t, files)) { setText(""); setFiles([]); } }
  async function attach(list: File[]) {
    const err = precheck(list, files.length); if (err) { toast.error(err); return; }
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const r = await uploadAttachment(ws, f);
        if (r.duplicate) toast.message(`${f.name} ya estaba cargado en este espacio: reutilizo su lectura y no se duplica.`);
        setFiles((x) => (x.some((y) => y.id === r.id) ? x : [...x, { id: r.id, file_name: f.name }]));
        if (r.needsProcessing) void process({ data: { attachment_id: r.id } }).catch(() => undefined).finally(() => qc.invalidateQueries({ queryKey: ["brain-attachments"] }));
      } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
      finally { setUploading((n) => n - 1); }
    }
  }
  const canSend = !busy && uploading === 0 && (!!text.trim() || files.length > 0);
  return (
    <div className="rounded-2xl border border-border-strong/60 bg-card p-2 transition-colors focus-within:border-primary"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void attach([...e.dataTransfer.files]); }}>
      {files.length > 0 && <div className="px-1 pb-2"><AttachmentChips ids={files.map((f) => f.id)} names={files} onRemove={(id) => setFiles((x) => x.filter((y) => y.id !== id))} /></div>}
      <Textarea ref={ref} rows={2} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} aria-label="Mensaje al Brain"
        placeholder="Preguntá, pedí una tarea, pegá un email o adjuntá un archivo…"
        className="max-h-60 min-h-[52px] resize-none border-0 bg-transparent shadow-none focus-visible:outline-none"
        onPaste={(e) => { const fl = [...e.clipboardData.files]; if (fl.length) { e.preventDefault(); void attach(fl); } }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) void go(); } }} />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>Adjuntar</Button>
          <input ref={inputRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden accept={ACCEPT} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void attach(f); e.target.value = ""; }} />
          <span className="hidden text-xs text-muted-foreground sm:inline">{uploading ? "Subiendo…" : "PDF, Word, email, texto o planillas · hasta 5 de 15 MB"}</span>
        </div>
        <Button size="sm" onClick={() => void go()} disabled={!canSend}>{busy ? "Trabajando…" : "Enviar"}</Button>
      </div>
    </div>
  );
}

/** Stores the file privately under the workspace; the same file (by content hash) is stored once. */
async function uploadAttachment(ws: string, f: File): Promise<{ id: string; duplicate: boolean; needsProcessing: boolean }> {
  const format = formatFromName(f.name); if (!format) throw new Error("formato no admitido");
  const buf = await f.arrayBuffer();
  const magic = verifyMagic(format, new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 1_000_000))));
  if (magic && magic !== "protected" && format !== "text" && format !== "markdown" && format !== "eml") throw new Error(magic);
  const sha = await sha256Hex(buf);
  const find = async () => (await supabase.from("chat_attachments").select("id, status, read_condition").eq("workspace_id", ws).eq("sha256", sha).maybeSingle()).data;
  const prev = await find();
  const path = `${ws}/${sha}`;
  if (prev && prev.status !== "uploading") return { id: prev.id, duplicate: true, needsProcessing: prev.status === "failed" && !prev.read_condition || prev.status === "processing" };
  let id = prev?.id as string | undefined;
  if (!id) {
    const { data, error } = await supabase.from("chat_attachments").insert({ workspace_id: ws, sha256: sha, file_name: f.name.slice(0, 200), mime: f.type || null, format, size_bytes: f.size, storage_path: path }).select("id").single();
    if (error) { const again = await find(); if (!again) throw new Error(error.message); return { id: again.id, duplicate: true, needsProcessing: false }; }
    id = data.id;
  }
  const up = await supabase.storage.from("brain-files").upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: false, cacheControl: "0" });
  if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new Error("No se pudo subir: " + up.error.message);
  await supabase.from("chat_attachments").update({ status: "processing" }).eq("id", id).eq("status", "uploading");
  return { id, duplicate: false, needsProcessing: true };
}

const TABLE_ES: Record<string, string> = { tasks: "tareas", people: "personas", organizations: "organizaciones", affiliations: "afiliaciones", person_contacts: "contactos", person_links: "vínculos", needs: "necesidades", conversation_links: "conversaciones", introductions: "introducciones", project_participants: "proyectos", project_organizations: "proyectos", workspace_members: "la ficha de un miembro", meeting_participants: "reuniones", commission_interest: "comisiones" };
export function reportUndo(data: unknown) {
  const r = (data ?? {}) as { reverted?: { summary: string }[]; kept?: { summary: string; reason: string }[] };
  const kept = r.kept ?? [];
  if (!kept.length) { toast.success(`Deshecho${r.reverted?.length ? ` (${r.reverted.length} cambios)` : ""}`); return; }
  toast.warning(`Deshice ${r.reverted?.length ?? 0} cambios y conservé ${kept.length}`, { description: kept.map((k) => `${k.summary}: ${k.reason.replace(/se usa en (\w+)/, (_, t: string) => `se usa en ${TABLE_ES[t] ?? t}`)}`).join(" · "), duration: 12000 });
}

/** Reviewable batch inside the chat: accept / discard per item or all; correct or associate opens the full review. */
function BatchView({ b }: { b: BatchCard }) {
  const qc = useQueryClient();
  const { data: live = [] } = useQuery({
    queryKey: ["brain-batch", b.extraction_id],
    queryFn: async () => (await supabase.from("brain_proposals").select("id, status").eq("extraction_id", b.extraction_id)).data ?? [],
  });
  const status = (id: string) => live.find((x) => x.id === id)?.status ?? "pending";
  const pending = b.proposals.filter((p) => status(p.id) === "pending");
  async function decide(ids: string[], action: "accept" | "reject") {
    if (!ids.length) return;
    const { data, error } = await supabase.rpc("confirm_extraction", { _extraction: b.extraction_id, _decisions: ids.map((proposal_id) => ({ proposal_id, action })) });
    if (error) { toast.error(`No se aplicó: ${error.message}`); return; }
    const r = data as { created: number; rejected: number; pending: number };
    toast.success(`${r.created} aplicadas · ${r.rejected} descartadas · ${r.pending} pendientes`);
    qc.invalidateQueries();
  }
  const ST: Record<string, string> = { pending: "pendiente", accepted: "aceptada", corrected: "corregida", rejected: "descartada" };
  return (
    <section aria-label={`Lote para revisar: ${b.title}`} className="space-y-3 border-l-2 border-mint pl-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label-mono">Lote para revisar · {b.proposals.length} propuestas{b.attachment ? ` · desde ${b.attachment.file_name}` : ""}{b.reused ? " · ya analizado antes" : ""}</span>
        <Link to="/conversaciones/revision/$id" params={{ id: b.extraction_id }} className="text-xs text-primary underline">Corregir o asociar a registros existentes</Link>
      </div>
      {!b.proposals.length && <p className="text-muted-foreground">No encontré nada con respaldo suficiente para proponer.</p>}
      <ul className="space-y-2">
        {b.proposals.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div>{p.summary}</div>
              {p.evidence && <q className="block text-xs text-muted-foreground">{p.evidence}</q>}
              {p.source_ref && <div className="data-mono text-[11px] text-muted-foreground">Fuente: {p.source_ref}</div>}
              {b.attachment && !p.source_ref && <div className="text-[11px] text-warning">Sin fragmento verificable en el archivo</div>}
              {p.ambiguity && <div className="text-xs text-destructive">Duda: {p.ambiguity}</div>}
            </div>
            {status(p.id) === "pending" ? (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => void decide([p.id], "accept")}>Aceptar</Button>
                <Button size="sm" variant="ghost" onClick={() => void decide([p.id], "reject")}>Descartar</Button>
              </div>
            ) : <span className="label-mono text-muted-foreground">{ST[status(p.id)] ?? status(p.id)}</span>}
          </li>
        ))}
      </ul>
      {pending.length > 1 && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void decide(pending.map((p) => p.id), "accept")}>Aceptar las {pending.length} pendientes</Button>
          <Button size="sm" variant="ghost" onClick={() => void decide(pending.map((p) => p.id), "reject")}>Descartar todas</Button>
        </div>
      )}
    </section>
  );
}
