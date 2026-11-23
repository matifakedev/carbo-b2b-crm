import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { ChatView } from "@/components/crm/BrainChat";

type Search = { foco?: string };
export const Route = createFileRoute("/_authenticated/chat/")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s["foco"] === "string" ? { foco: s["foco"] } : {}),
  component: NewChat,
});

function NewChat() {
  const { current } = useWorkspace();
  const { foco } = Route.useSearch();
  const ws = current?.id;
  const [ft, fid] = foco?.split(":") ?? [];
  const focus = ft && fid ? { type: ft, id: fid } : null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: s } = useQuery({
    queryKey: ["brain-summary", ws, today], enabled: !!ws,
    queryFn: async () => {
      const [over, wait, week, projs] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws!).eq("status", "open").lt("due_date", today),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws!).eq("status", "waiting"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws!).in("status", ["open", "waiting"]).gte("due_date", today).lte("due_date", new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)),
        supabase.from("projects").select("id, name, project_participants(role, archived_at)").eq("workspace_id", ws!).is("archived_at", null),
      ]);
      const gaps = (projs.data ?? []).filter((p) => !["economic_decider", "technical_evaluator"].every((r) => p.project_participants.some((x) => x.role === r && !x.archived_at)));
      return { overdue: over.count ?? 0, waiting: wait.count ?? 0, week: week.count ?? 0, gaps: gaps.map((g) => g.name) };
    },
  });
  if (!ws) return null;
  const intro = (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Hola, ¿qué hacemos hoy?</h1>
        <p className="mt-2 text-muted-foreground">Preguntame por el CRM, pedime tareas o pegá emails, notas y novedades: yo los ordeno en el CRM y te aviso qué hice. Todo se puede deshacer.{focus ? " Este chat está enfocado en el registro desde el que llegaste." : ""}</p>
      </div>
      {s && (
        <div className="grid gap-3 md:grid-cols-4">
          <Stat n={s.overdue} l="tareas vencidas" /><Stat n={s.waiting} l="esperando respuesta" /><Stat n={s.week} l="para los próximos 7 días" /><Stat n={s.gaps.length} l="proyectos sin decisor o evaluador" />
        </div>
      )}
      {s?.gaps.length ? <p className="text-sm text-muted-foreground">Proyectos con huecos: {s.gaps.slice(0, 5).join(", ")}</p> : null}
      <div className="label-mono text-muted-foreground">Podés empezar con: «¿Qué tengo esta semana?», «Mostrame las vencidas», «Investigá la organización X», o pegar un email.</div>
    </div>
  );
  return <ChatView key={foco ?? "new"} ws={ws} threadId={null} focus={focus} intro={intro} />;
}
function Stat({ n, l }: { n: number; l: string }) { return <div className="panel p-4"><div className="font-mono text-2xl font-bold">{n}</div><div className="text-sm text-muted-foreground">{l}</div></div>; }
