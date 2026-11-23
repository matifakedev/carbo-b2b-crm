import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/crm/fields";
import { BrainToggle } from "@/components/crm/BrainPanel";
import { ConversationList, Section, TaskList, invalidateAll } from "@/components/crm/network-ui";
import { OpportunityList, Participants, ProjectForm, ProjectOrgs, ProjectSummary, type ProjectRow } from "@/components/crm/projects-ui";

export const Route = createFileRoute("/_authenticated/proyectos/$id")({
  head: () => ({ meta: [{ title: "Ficha de proyecto · CRM - CARBO" }, { name: "description", content: "Necesidad, participantes, rutas de acceso y oportunidades del proyecto." }, { property: "og:title", content: "Ficha de proyecto · CRM - CARBO" }, { property: "og:description", content: "Necesidad, participantes, rutas de acceso y oportunidades del proyecto." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: p, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => ((await supabase.from("projects").select("*").eq("id", id).maybeSingle()).data ?? null) as ProjectRow | null,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!p) return <p className="text-sm text-muted-foreground">Proyecto no encontrado.</p>;
  async function archive() {
    const { error } = await supabase.from("projects").update({ archived_at: p!.archived_at ? null : new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { invalidateAll(qc); void qc.invalidateQueries({ queryKey: ["project", id] }); }
  }
  const row = (label: string, v: string | null) => <div><div className="label-mono text-muted-foreground">{label}</div><div className="whitespace-pre-wrap text-sm">{v ?? <span className="text-muted-foreground">Sin registrar</span>}</div></div>;
  return (
    <>
      <PageHeader crumb="Proyectos" title={p.name} />
      <div className="space-y-8">
        {editing ? <ProjectForm ws={p.workspace_id} initial={p} onDone={() => { setEditing(false); void qc.invalidateQueries({ queryKey: ["project", id] }); }} /> : (
          <Section title="Resumen" action={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button><Button size="sm" variant="outline" onClick={archive}>{p.archived_at ? "Restaurar" : "Archivar"}</Button></div>}>
            {p.archived_at && <Tag tone="warning">Archivado</Tag>}
            <ProjectSummary p={p} />
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {row("Necesidad", p.need)}{row("Evidencia / fundamento", p.evidence)}{row("Bloqueos", p.blockers)}{row("Siguiente hito", p.next_milestone)}
            </div>
          </Section>
        )}
        <BrainToggle ws={p.workspace_id} focusType="project" focusId={id} label="Preguntar al Brain sobre el proyecto" />
        <ProjectOrgs ws={p.workspace_id} projectId={id} />
        <Participants ws={p.workspace_id} projectId={id} />
        <OpportunityList ws={p.workspace_id} projectId={id} />
        <TaskList ws={p.workspace_id} filter={{ projectId: id }} allowNew defaults={{ project_id: id }} title="Tareas del proyecto" />
        <ConversationList ws={p.workspace_id} filter={{ projectId: id }} title="Conversaciones del proyecto" />
      </div>
    </>
  );
}
