import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { ProjectList } from "@/components/crm/projects-ui";

export const Route = createFileRoute("/_authenticated/proyectos/")({
  head: () => ({ meta: [{ title: "Proyectos · CRM - CARBO" }, { name: "description", content: "Proyectos de almacenamiento: necesidad, participantes y camino a la compra." }, { property: "og:title", content: "Proyectos · CRM - CARBO" }, { property: "og:description", content: "Proyectos de almacenamiento: necesidad, participantes y camino a la compra." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => {
    const { current } = useWorkspace();
    if (!current) return null;
    return (<><PageHeader crumb={`Pipeline / ${current.name}`} title="Proyectos" /><ProjectList ws={current.id} allowNew /></>);
  },
});
