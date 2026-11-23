import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Section } from "@/components/crm/network-ui";
import { OPP_SELECT, OpportunityCard, type Opp } from "@/components/crm/projects-ui";
import { STAGES, STAGE_LABELS } from "@/lib/projects";

export const Route = createFileRoute("/_authenticated/oportunidades")({
  head: () => ({ meta: [{ title: "Oportunidades · CRM - CARBO" }, { name: "description", content: "Pipeline simple por etapa: solo oportunidades con proyecto, necesidad y fundamento." }, { property: "og:title", content: "Oportunidades · CRM - CARBO" }, { property: "og:description", content: "Pipeline simple por etapa: solo oportunidades con proyecto, necesidad y fundamento." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Pipeline,
});

function Pipeline() {
  const { current } = useWorkspace();
  const [showOut, setShowOut] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["opps", current?.id, "all"], enabled: !!current,
    queryFn: async () => ((await supabase.from("opportunities").select(OPP_SELECT).eq("workspace_id", current!.id).is("archived_at", null).order("updated_at", { ascending: false })).data ?? []) as unknown as Opp[],
  });
  if (!current) return null;
  const inP = data.filter((o) => o.in_pipeline);
  const out = data.filter((o) => !o.in_pipeline);
  return (
    <>
      <PageHeader crumb={`Pipeline / ${current.name}`} title="Oportunidades" />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">Solo se cuentan las oportunidades marcadas en el pipeline. No hay probabilidades de cierre ni montos estimados: los montos aparecen solo si alguien los informó.</p>
      <div className="space-y-8">
        {STAGES.map((s) => {
          const list = inP.filter((o) => o.stage === s);
          return (
            <Section key={s} title={`${STAGE_LABELS[s]} (${list.length})`}>
              <div className="divide-y divide-border border-y border-border">
                {list.map((o) => <OpportunityCard key={o.id} o={o} showProject />)}
                {list.length === 0 && <p className="py-3 text-sm text-muted-foreground">Ninguna.</p>}
              </div>
            </Section>
          );
        })}
        <Section title={`Fuera del pipeline (${out.length})`}>
          <button className="text-sm font-semibold text-primary hover:underline" onClick={() => setShowOut((v) => !v)}>{showOut ? "Ocultar" : "Mostrar"} relaciones institucionales e hipótesis</button>
          {showOut && <div className="divide-y divide-border">{out.map((o) => <OpportunityCard key={o.id} o={o} showProject />)}</div>}
        </Section>
      </div>
    </>
  );
}
