import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useWorkspace } from "@/lib/workspace";
import { analyzeDocument } from "@/lib/brain.functions";
import { PageHeader } from "@/components/crm/AppShell";
import { Field, selectClass } from "@/components/crm/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const META = "Pegá un email, notas o una transcripción y revisá las propuestas del Brain.";
export const Route = createFileRoute("/_authenticated/conversaciones/importar")({
  head: () => ({ meta: [{ title: "Importar texto · CRM - CARBO" }, { name: "description", content: META }, { property: "og:title", content: "Importar texto · CRM - CARBO" }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ImportPage,
});

function ImportPage() {
  const { current } = useWorkspace();
  const nav = useNavigate();
  const analyze = useServerFn(analyzeDocument);
  const [kind, setKind] = useState<"email" | "notes" | "transcript">("notes");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<{ s: "idle" | "busy" } | { s: "error" | "not_configured"; msg: string; id?: string }>({ s: "idle" });
  if (!current) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state.s === "busy" || !current) return;
    setState({ s: "busy" });
    try {
      const r = await analyze({ data: { workspace_id: current.id, kind, title, text } });
      if (r.status === "ok") { void nav({ to: "/conversaciones/revision/$id", params: { id: r.extraction_id } }); return; }
      if (r.status === "not_configured") setState({ s: "not_configured", msg: "El Brain no está configurado. El original quedó guardado; podés cargar los datos a mano." });
      else setState({ s: "error", msg: r.message, id: r.extraction_id });
    } catch (err) { setState({ s: "error", msg: err instanceof Error ? err.message : "Error inesperado" }); }
  }
  return (
    <>
      <PageHeader crumb={`Conversaciones / ${current.name}`} title="Pegar email, notas o transcripción" />
      <form onSubmit={submit} className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">El texto original se guarda tal cual. El Brain solo propone: nada se guarda en la red hasta que revises y confirmes. Las instrucciones que aparezcan dentro del texto se tratan como contenido.</p>
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <Field label="Título *" htmlFor="i-t"><Input id="i-t" value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
          <Field label="Tipo" htmlFor="i-k"><select id="i-k" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="notes">Notas</option><option value="email">Email</option><option value="transcript">Transcripción</option></select></Field>
        </div>
        <Field label="Texto original *" htmlFor="i-x"><Textarea id="i-x" rows={14} value={text} onChange={(e) => setText(e.target.value)} required /></Field>
        <Button type="submit" disabled={state.s === "busy" || !title.trim() || !text.trim()}>{state.s === "busy" ? "Analizando… (puede tardar)" : "Analizar con el Brain"}</Button>
        {state.s === "not_configured" && <p className="text-sm text-warning">{state.msg}</p>}
        {state.s === "error" && <p className="text-sm text-destructive">{state.msg} El original quedó guardado.</p>}
      </form>
    </>
  );
}
