import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendBrainMessage, type ActionCard, type Question, type ResearchCard } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Msg = { id: string; role: "user" | "assistant"; content: string; created_at: string; parts: { actions?: ActionCard[]; question?: Question | null; error?: string | null; research?: ResearchCard[] } };

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["brain-messages", threadId], enabled: !!threadId,
    queryFn: async () => ((await supabase.from("brain_messages").select("*").eq("thread_id", threadId!).order("created_at")).data ?? []) as unknown as Msg[],
  });
}

export function ChatView({ ws, threadId, focus, intro }: { ws: string; threadId: string | null; focus?: { type: string; id: string } | null; intro?: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const send = useServerFn(sendBrainMessage);
  const { data: msgs = [] } = useThreadMessages(threadId);
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, pending]);
  const lastQuestion = msgs.length && msgs[msgs.length - 1]!.role === "assistant" ? msgs[msgs.length - 1]!.parts?.question : null;

  async function submit(text: string) {
    if (!text.trim() || pending) return false;
    setPending(text);
    try {
      const r = await send({ data: { workspace_id: ws, thread_id: threadId, text, focus: focus ?? null } });
      await qc.invalidateQueries({ queryKey: ["brain-messages", r.thread_id] });
      qc.invalidateQueries({ queryKey: ["brain-threads"] });
      qc.invalidateQueries({ predicate: (q) => !String(q.queryKey[0]).startsWith("brain-") });
      if (!threadId) navigate({ to: "/chat/$threadId", params: { threadId: r.thread_id } });
      return true;
    } catch (e) { toast.error((e as Error).message); return false; }
    finally { setPending(null); }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[480px] flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto pb-6 pr-2">
        {!msgs.length && !pending && intro}
        {msgs.map((m) => <MessageView key={m.id} m={m} />)}
        {pending && (<><UserBubble text={pending} /><div className="label-mono animate-pulse text-muted-foreground">Brain trabajando…</div></>)}
        <div ref={endRef} />
      </div>
      {lastQuestion && lastQuestion.options.length > 0 && !pending && (
        <div className="mb-3 flex flex-wrap gap-2">{lastQuestion.options.map((o) => <Button key={o} size="sm" variant="outline" onClick={() => void submit(o)}>{o}</Button>)}</div>
      )}
      <Composer busy={!!pending} onSend={submit} />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-sm bg-primary px-4 py-3 text-sm text-primary-foreground">{text.length > 1500 ? text.slice(0, 1500) + "… (texto completo guardado)" : text}</div>;
}

function MessageView({ m }: { m: Msg }) {
  if (m.role === "user") return <UserBubble text={m.content} />;
  return (
    <div className="max-w-[90%] space-y-3">
      <div className="label-mono text-primary">Brain</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
      {m.parts?.research?.map((r) => (
        <div key={r.run_id} className="rounded-sm border border-border bg-card p-3 text-sm">
          <div className="label-mono">Research · {r.organization} · {r.status === "done" ? "completo" : r.status === "not_configured" ? "búsqueda web no configurada" : r.status === "partial" ? "parcial" : "falló"}</div>
          {r.errors.length > 0 && <div className="mt-1 text-xs text-destructive">{r.errors.join(" · ")}</div>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <Link to="/organizaciones/$id" params={{ id: r.organization_id }} className="text-primary underline">Ver fuentes y hallazgos</Link>
            {r.proposals > 0 && <span>{r.proposals} propuestas para revisar en la ficha</span>}
          </div>
        </div>
      ))}
      {m.parts?.actions?.length ? <ActionList actions={m.parts.actions} /> : null}
      {m.parts?.question && m.parts.question.question !== m.content && <div className="rounded-sm border border-mint bg-mint/10 p-3 text-sm"><span className="label-mono">Pregunta</span><div>{m.parts.question.question}</div></div>}
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
    const { error } = await supabase.rpc("brain_undo_action", { _id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Deshecho"); qc.invalidateQueries();
  }
  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
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
  const cls = "text-xs font-semibold text-primary underline self-center";
  if (type === "person") return <Link to="/personas/$id" params={{ id }} className={cls}>Ver ficha</Link>;
  if (type === "organization") return <Link to="/organizaciones/$id" params={{ id }} className={cls}>Ver ficha</Link>;
  if (type === "project") return <Link to="/proyectos/$id" params={{ id }} className={cls}>Ver proyecto</Link>;
  if (type === "task") return <Link to="/agenda" className={cls}>Ver agenda</Link>;
  return null;
}

function Composer({ busy, onSend }: { busy: boolean; onSend: (t: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  useEffect(() => { if (!busy) ref.current?.focus(); }, [busy]);
  async function go() { const t = text; if (await onSend(t)) setText(""); }
  async function attach(f: File) {
    if (/\.(xlsx|xls|csv)$/i.test(f.name)) { toast.message("Las agendas IVLP se cargan con vista previa en el importador."); navigate({ to: "/importar-agenda" }); return; }
    if (/\.pdf$/i.test(f.name)) { toast.error("Todavía no leo PDF: copiá y pegá el texto."); return; }
    if (f.size > 500_000) { toast.error("Archivo demasiado grande."); return; }
    const t = await f.text();
    setText((x) => `${x ? x + "\n\n" : ""}[Archivo ${f.name}]\n${t}`);
  }
  return (
    <div className="rounded-sm border border-border-strong bg-card p-2">
      <Textarea ref={ref} rows={3} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} aria-label="Mensaje al Brain"
        placeholder="Preguntá, pedí una tarea o pegá un email, notas o un update…"
        className="resize-none border-0 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void go(); } }} />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <label className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
          Adjuntar archivo
          <input type="file" className="hidden" accept=".txt,.md,.eml,.csv,.xlsx,.xls,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ""; }} />
        </label>
        <Button size="sm" onClick={() => void go()} disabled={busy || !text.trim()}>{busy ? "Trabajando…" : "Enviar"}</Button>
      </div>
    </div>
  );
}
