import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/crm/fields";
import { Section, TASK_SELECT, TaskForm, TaskItem, type TaskRow } from "@/components/crm/network-ui";
import { useMembers } from "@/lib/options";
import { groupAgenda } from "@/lib/agenda";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda · CRM - CARBO" }, { name: "description", content: "Acciones vencidas, próximas y pendientes de respuesta." }, { property: "og:title", content: "Agenda · CRM - CARBO" }, { property: "og:description", content: "Acciones vencidas, próximas y pendientes de respuesta." }] }),
  component: Agenda,
});

function Agenda() {
  const { current, userId } = useWorkspace();
  const ws = current?.id;
  const [owner, setOwner] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const { data: memberList = [] } = useMembers(ws);
  const members = Object.fromEntries(memberList.map((m) => [m.user_id, m.name]));
  const { data = [] } = useQuery({
    queryKey: ["tasks", ws, "agenda"], enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("workspace_id", ws!).in("status", ["open", "waiting"]).order("due_date", { nullsFirst: false });
      if (error) throw error; return data as unknown as TaskRow[];
    },
  });
  if (!ws) return null;
  const rows = owner === "none" ? data.filter((t) => !t.owner_user_id) : owner ? data.filter((t) => t.owner_user_id === owner) : data;
  const g = groupAgenda(rows, new Date().toISOString().slice(0, 10));
  const block = (title: string, items: TaskRow[], empty: string) => (
    <Section title={`${title} (${items.length})`}>
      <ul className="divide-y divide-border border-y border-border">
        {items.map((t) => <TaskItem key={t.id} t={t} ws={ws} members={members} />)}
        {items.length === 0 && <li className="py-4 text-sm text-muted-foreground">{empty}</li>}
      </ul>
    </Section>
  );
  return (
    <>
      <PageHeader crumb={`Acciones / ${current?.name}`} title="Agenda" action={!adding && <Button onClick={() => setAdding(true)}>Nueva tarea</Button>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select aria-label="Responsable" className={`${selectClass} max-w-xs`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos los responsables</option>
          {userId && <option value={userId}>Mis tareas</option>}
          {memberList.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          <option value="none">Sin responsable</option>
        </select>
      </div>
      {adding && <div className="mb-6"><TaskForm ws={ws} onDone={() => setAdding(false)} /></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        {block("Vencidas", g.overdue, "Nada vencido.")}
        {block("Esperando respuesta de terceros", g.waiting, "Sin pendientes de terceros.")}
        {block("Próximas", g.upcoming, "Nada programado.")}
        {block("Sin fecha", g.undated, "Todo tiene fecha.")}
      </div>
    </>
  );
}
