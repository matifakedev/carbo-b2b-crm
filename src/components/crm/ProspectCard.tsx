import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EXECUTION_LABEL, SUFFICIENCY_LABEL, type ProspectView } from "@/lib/prospecting";

/** Markdown without raw HTML (react-markdown escapes HTML by default; skipHtml drops it). */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-mint [&_blockquote]:pl-3 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{text}</ReactMarkdown>
    </div>
  );
}

const Src = ({ url, date }: { url: string | null; date?: string | null }) =>
  url ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{new URL(url).hostname}{date ? ` · ${date.slice(0, 10)}` : ""}</a> : <span className="text-muted-foreground">sin fuente</span>;

export function ProspectCard({ p }: { p: ProspectView }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-sm border border-border px-2 py-0.5"><span className="label-mono">Ejecución</span> {EXECUTION_LABEL[p.execution]}</span>
        <span className={`rounded-sm border px-2 py-0.5 ${p.sufficiency === "sufficient" ? "border-mint" : "border-destructive text-destructive"}`}><span className="label-mono">Suficiencia</span> {SUFFICIENCY_LABEL[p.sufficiency]}</span>
        <span className="rounded-sm border border-border px-2 py-0.5 text-muted-foreground">Perfil: {p.profile_origin}</span>
      </div>
      {p.recommendation && <Markdown text={p.recommendation} />}
      {p.candidates.map((c) => (
        <details key={c.company} className="rounded-sm border border-border p-2">
          <summary className="cursor-pointer text-sm"><span className="font-semibold">{c.company}</span> <span className="label-mono ml-2">{c.tier === "qualified" ? "Oportunidad calificada" : "Exploratoria"}</span> <span className="text-muted-foreground">· {c.target_role}</span></summary>
          <dl className="mt-2 space-y-1.5 text-xs">
            <div><dt className="label-mono">Vinculación {c.linkage.verified ? "documentada" : "no verificada"}</dt><dd>{c.linkage.text} — <Src url={c.linkage.url} />{c.linkage.quote && <q className="block text-muted-foreground">{c.linkage.quote}</q>}</dd></div>
            <div><dt className="label-mono">Señal comercial</dt><dd>{c.signal.text} — <Src url={c.signal.url} date={c.signal.date} />{c.signal.quote && <q className="block text-muted-foreground">{c.signal.quote}</q>}</dd></div>
            <div><dt className="label-mono">Hipótesis de aplicación</dt><dd>{c.hypothesis}</dd></div>
            <div><dt className="label-mono">Falta validar</dt><dd>{c.to_validate}</dd></div>
            <div><dt className="label-mono">Pedido al contacto</dt><dd className="rounded-sm bg-mint/10 p-2">{c.intro_request}</dd></div>
            <div className="text-muted-foreground">{c.notes.join(" ")}</div>
          </dl>
        </details>
      ))}
      {p.gaps.length > 0 && <details className="text-xs"><summary className="cursor-pointer label-mono">Brechas ({p.gaps.length})</summary><ul className="ml-4 mt-1 list-disc">{p.gaps.map((g) => <li key={g}>{g}</li>)}</ul></details>}
      <details className="text-xs"><summary className="cursor-pointer label-mono">Fuentes consultadas ({p.sources.length}) · {p.usage.queries} búsquedas · {p.usage.llm_calls} llamadas IA · {p.usage.seconds}s</summary>
        <ul className="ml-4 mt-1 list-disc">{p.sources.map((s) => <li key={s.url}><Src url={s.url} date={s.published_at} /> {s.title}</li>)}</ul></details>
    </div>
  );
}
