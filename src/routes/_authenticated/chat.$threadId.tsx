import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace";
import { ChatView } from "@/components/crm/BrainChat";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: Thread,
});
function Thread() {
  const { threadId } = Route.useParams();
  const { current } = useWorkspace();
  if (!current) return null;
  return <ChatView key={threadId} ws={current.id} threadId={threadId} />;
}
