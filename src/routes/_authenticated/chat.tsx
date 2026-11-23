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
    <div className="grid gap-4 lg:grid-cols-[232px_1fr] lg:gap-8">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="flex items-center gap-2 lg:block lg:space-y-3">
          <Button asChild className="lg:w-full"><Link to="/chat" search={{}}>Nuevo chat</Link></Button>
          <details className="group flex-1 lg:hidden">
            <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">Tus chats ({threads.length})</summary>
            <ThreadList threads={threads} />
          </details>
        </div>
        <div className="hidden lg:block">
          <div className="label-mono mb-2 mt-5 text-muted-foreground">Tus chats</div>
          <ThreadList threads={threads} />
          <Link to="/actividad" className="mt-4 block text-xs font-semibold text-primary underline-offset-2 hover:underline">Actividad del Brain</Link>
        </div>
      </aside>
      <section className="min-w-0"><Outlet /></section>
    </div>
  );
}

function ThreadList({ threads }: { threads: { id: string; title: string }[] }) {
  return (
    <nav className="mt-2 max-h-[60vh] space-y-0.5 overflow-y-auto lg:mt-0 lg:max-h-[70vh]">
      {threads.map((t) => (
        <Link key={t.id} to="/chat/$threadId" params={{ threadId: t.id }} className="block truncate rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" activeProps={{ className: "bg-muted font-semibold !text-foreground" }}>{t.title}</Link>
      ))}
      {!threads.length && <p className="px-3 text-xs text-muted-foreground">Todavía no hay chats.</p>}
    </nav>
  );
}
