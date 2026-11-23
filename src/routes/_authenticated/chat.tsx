import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Brain · CRM - CARBO" }, { name: "description", content: "Conversá con el Brain para consultar y gestionar el CRM de Carbo." }, { property: "og:title", content: "Brain · CRM - CARBO" }, { property: "og:description", content: "Conversá con el Brain para consultar y gestionar el CRM de Carbo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChatLayout,
});

function ChatLayout() {
  const { current, userId } = useWorkspace();
  const ws = current?.id;
  const { data: threads = [] } = useQuery({
    queryKey: ["brain-threads", ws, userId], enabled: !!ws && !!userId,
    queryFn: async () => (await supabase.from("brain_threads").select("id, title, updated_at").eq("workspace_id", ws!).eq("owner_user_id", userId!).is("archived_at", null).order("updated_at", { ascending: false }).limit(50)).data ?? [],
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-3 lg:border-r lg:border-border lg:pr-4">
        <Button asChild className="w-full"><Link to="/chat" search={{}}>Nuevo chat</Link></Button>
        <div className="label-mono text-muted-foreground">Tus chats</div>
        <nav className="max-h-[70vh] space-y-1 overflow-y-auto">
          {threads.map((t) => (
            <Link key={t.id} to="/chat/$threadId" params={{ threadId: t.id }} className="block truncate rounded-sm px-2 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted font-semibold" }}>{t.title}</Link>
          ))}
          {!threads.length && <p className="text-xs text-muted-foreground">Todavía no hay chats.</p>}
        </nav>
        <Link to="/actividad" className="block text-xs font-semibold text-primary underline">Actividad del Brain</Link>
      </aside>
      <section className="min-w-0"><Outlet /></section>
    </div>
  );
}
