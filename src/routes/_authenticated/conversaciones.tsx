import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { ConversationList } from "@/components/crm/network-ui";

export const Route = createFileRoute("/_authenticated/conversaciones")({
  head: () => ({ meta: [{ title: "Conversaciones · CRM - CARBO" }, { name: "description", content: "Conversaciones y notas de la red de Carbo." }, { property: "og:title", content: "Conversaciones · CRM - CARBO" }, { property: "og:description", content: "Conversaciones y notas de la red de Carbo." }] }),
  component: () => {
    const { current } = useWorkspace();
    if (!current) return null;
    return (<><PageHeader crumb={`Red / ${current.name}`} title="Conversaciones y notas" /><ConversationList ws={current.id} allowNew title="Todas las conversaciones" /></>);
  },
});
