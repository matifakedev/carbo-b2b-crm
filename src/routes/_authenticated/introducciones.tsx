import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { IntroList } from "@/components/crm/network-ui";

export const Route = createFileRoute("/_authenticated/introducciones")({
  head: () => ({ meta: [{ title: "Introducciones · CRM - CARBO" }, { name: "description", content: "Pedidos y presentaciones de la red de Carbo." }, { property: "og:title", content: "Introducciones · CRM - CARBO" }, { property: "og:description", content: "Pedidos y presentaciones de la red de Carbo." }] }),
  component: () => {
    const { current } = useWorkspace();
    if (!current) return null;
    return (<><PageHeader crumb={`Red / ${current.name}`} title="Introducciones" /><IntroList ws={current.id} allowNew emptyText="Todavía no hay introducciones." /></>);
  },
});
