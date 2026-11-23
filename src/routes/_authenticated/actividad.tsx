import { createFileRoute } from "@tanstack/react-router";
import { reportUndo } from "@/components/crm/BrainChat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { useMemberNames } from "@/components/crm/fields";
import { Button } from "@/components/ui/button";

const META = "Registro de todo lo que el Brain creó o modificó en el CRM, con opción de deshacer.";
export const Route = createFileRoute("/_authenticated/actividad")({
  head: () => ({ meta: [{ title: "Actividad del Brain · CRM - CARBO" }, { name: "description", content: META }, { property: "og:title", content: "Actividad del Brain · CRM - CARBO" }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Activity,
});
function Activity() {
  const { current } = useWorkspace(); const ws = current?.id; const qc = useQueryClient();
  const { data: names = {} } = useMemberNames(ws);
  const { data = [] } = useQuery({ queryKey: ["brain-activity", ws], enabled: !!ws, queryFn: async () => (await supabase.from("brain_actions").select("*").eq("workspace_id", ws!).order("created_at", { ascending: false }).limit(200)).data ?? [] });
  if (!ws) return null;
  async function undo(id: string) { const { data, error } = await supabase.rpc("brain_undo_action", { _id: id }); if (error) toast.error(error.message); else { reportUndo(data); qc.invalidateQueries(); } }
  return (
    <>
      <PageHeader crumb={`Brain / ${current?.name}`} title="Actividad del Brain" />
      <ul className="divide-y divide-border border-y border-border">
        {!data.length && <li className="py-6 text-sm text-muted-foreground">Sin actividad todavía.</li>}
        {data.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><div className={a.undone_at ? "line-through text-muted-foreground" : "font-medium"}>{a.summary}</div>
              <div className="font-mono text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("es-AR")} · pedido por {names[a.created_by ?? ""] ?? "miembro"}{a.thread_id ? ` · chat ${a.thread_id.slice(0, 8)}` : ""}{a.undone_at ? ` · deshecho ${new Date(a.undone_at).toLocaleString("es-AR")}` : ""}</div></div>
            {!a.undone_at && <Button size="sm" variant="outline" onClick={() => void undo(a.id)}>Deshacer</Button>}
          </li>
        ))}
      </ul>
    </>
  );
}
