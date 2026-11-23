import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { OrgForm, emptyOrg, orgPayload, type OrgDraft } from "@/components/crm/OrgForm";
import { DuplicateWarning } from "@/components/crm/fields";

export const Route = createFileRoute("/_authenticated/organizaciones/nueva")({
  head: () => ({ meta: [{ title: "Nueva organización · CRM - CARBO" }, { name: "description", content: "Crear una organización en el CRM de Carbo." }, { property: "og:title", content: "Nueva organización · CRM - CARBO" }, { property: "og:description", content: "Crear una organización en el CRM de Carbo." }] }),
  component: NewOrg,
});

function NewOrg() {
  const { current } = useWorkspace();
  const navigate = useNavigate(); const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<OrgDraft>(emptyOrg);
  const [dups, setDups] = useState<{ id: string; label: string; reason: string; archived: boolean }[] | null>(null);

  async function create(d: OrgDraft) {
    if (!current) return; setBusy(true);
    const { data, error } = await supabase.from("organizations").insert({ ...orgPayload(d), workspace_id: current.id }).select("id").single();
    setBusy(false);
    if (error) { toast.error(`No se pudo guardar: ${error.message}`); return; }
    qc.invalidateQueries({ queryKey: ["orgs"] }); toast.success("Organización creada");
    navigate({ to: "/organizaciones/$id", params: { id: data.id } });
  }
  async function check(d: OrgDraft) {
    if (!current) return; setDraft(d); setBusy(true);
    const { data, error } = await supabase.rpc("find_org_duplicates", { _ws: current.id, _name: d.name });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data?.length) { setDups(data.map((r) => ({ id: r.id, label: r.name, reason: r.reason, archived: r.archived }))); return; }
    await create(d);
  }
  return (
    <>
      <PageHeader crumb="Directorio / Organizaciones" title="Nueva organización" />
      {dups ? <DuplicateWarning items={dups} onOpen={(id) => navigate({ to: "/organizaciones/$id", params: { id } })} onContinue={() => { setDups(null); create(draft); }} onCancel={() => setDups(null)} />
        : <OrgForm key={JSON.stringify(draft)} initial={draft} submitLabel="Crear organización" busy={busy} onSubmit={check} onCancel={() => navigate({ to: "/organizaciones" })} />}
    </>
  );
}
