import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { OrgForm, orgPayload, type OrgDraft } from "@/components/crm/OrgForm";
import { AuditFooter, SourceTag, Tag, VerificationTag } from "@/components/crm/fields";
import { ConversationList, IntroList, TaskList } from "@/components/crm/network-ui";
import { History } from "@/components/crm/person-extras";
import { ORG_ROLES, describeTenure, type SourceType, type VerificationStatus } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/organizaciones/$id")({
  head: () => ({ meta: [{ title: "Ficha de organización · CRM - CARBO" }, { name: "description", content: "Ficha de organización en el CRM de Carbo." }, { property: "og:title", content: "Ficha de organización · CRM - CARBO" }, { property: "og:description", content: "Ficha de organización en el CRM de Carbo." }] }),
  component: OrgDetail,
});

function OrgDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  const { data: o, isLoading } = useQuery({
    queryKey: ["org", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*, affiliations(*, people(id, full_name, archived_at))").eq("id", id).maybeSingle();
      if (error) throw error; return data;
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["org", id] }); qc.invalidateQueries({ queryKey: ["orgs"] }); };
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!o) return <p>No encontramos esta organización o no tenés acceso.</p>;

  const draft: OrgDraft = { name: o.name, location: o.location ?? "", website: o.website ?? "", description: o.description ?? "", org_roles: o.org_roles,
    source_type: o.source_type as SourceType, source_detail: o.source_detail ?? "", verification_status: o.verification_status as VerificationStatus };

  async function save(d: OrgDraft) {
    setBusy(true);
    const { error } = await supabase.from("organizations").update(orgPayload(d)).eq("id", id);
    setBusy(false);
    if (error) { toast.error(`No se pudo guardar: ${error.message}`); return; }
    toast.success("Cambios guardados"); setEditing(false); refresh();
  }
  async function toggleArchive() {
    const { error } = await supabase.from("organizations").update({ archived_at: o!.archived_at ? null : new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(o!.archived_at ? "Organización restaurada" : "Organización archivada"); refresh();
  }

  return (
    <>
      <PageHeader crumb="Directorio / Organizaciones" title={o.name}
        action={!editing && <div className="flex gap-3"><Button variant="outline" onClick={toggleArchive}>{o.archived_at ? "Restaurar" : "Archivar"}</Button><Button variant="outline" asChild><Link to="/red" search={{ origen: `o:${id}` }}>Ver en el mapa</Link></Button><Button onClick={() => setEditing(true)}>Editar</Button></div>} />
      {o.archived_at && <div className="mb-6"><Tag tone="warning">Archivada</Tag></div>}
      {editing ? <OrgForm initial={draft} submitLabel="Guardar cambios" busy={busy} onSubmit={save} onCancel={() => setEditing(false)} /> : (
        <div className="space-y-6">
          <section className="panel grid gap-6 p-6 md:grid-cols-3">
            <Info label="Ubicación">{o.location || "Desconocida"}</Info>
            <Info label="Sitio web">{o.website ? <span className="font-mono text-sm">{o.website}</span> : "—"}</Info>
            <Info label="Procedencia"><div className="flex flex-wrap gap-2"><SourceTag source={o.source_type as SourceType} /><VerificationTag status={o.verification_status as VerificationStatus} /></div>{o.source_detail && <div className="mt-1 text-sm text-muted-foreground">{o.source_detail}</div>}</Info>
            <div className="md:col-span-3"><Info label="Roles"><div className="flex flex-wrap gap-1">{o.org_roles.length ? o.org_roles.map((r) => <Tag key={r}>{ORG_ROLES[r] ?? r}</Tag>) : "—"}</div></Info></div>
            {o.description && <div className="md:col-span-3"><Info label="Descripción">{o.description}</Info></div>}
          </section>
          <section className="panel p-6">
            <h2 className="mb-4 text-lg font-semibold">Personas afiliadas</h2>
            <ul className="divide-y divide-border border-y border-border">
              {o.affiliations.filter((a) => !a.archived_at).map((a) => {
                const person = a.people as { id: string; full_name: string } | null;
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                    <div>
                      {person && <Link to="/personas/$id" params={{ id: person.id }} className="font-semibold hover:text-primary">{person.full_name}</Link>}
                      <div className="text-sm">{a.title || <span className="text-muted-foreground">Cargo desconocido</span>}</div>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{describeTenure(a)}</div>
                  </li>
                );
              })}
              {o.affiliations.filter((a) => !a.archived_at).length === 0 && <li className="py-6 text-sm text-muted-foreground">Sin personas afiliadas. Se agregan desde la ficha de cada persona.</li>}
            </ul>
          </section>
          <IntroList ws={o.workspace_id} filter={{ orgId: id }} allowNew defaults={{ target_org_id: id }} emptyText="Ninguna introducción apunta a esta organización." />
          <TaskList ws={o.workspace_id} filter={{ orgId: id }} allowNew defaults={{ organization_id: id }} />
          <ConversationList ws={o.workspace_id} filter={{ orgId: id }} allowNew initialLinks={{ orgs: [id] }} />
          <History ws={o.workspace_id} orgId={id} />
          <AuditFooter row={o} workspaceId={o.workspace_id} />
        </div>
      )}
    </>
  );
}
function Info({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="label-mono mb-1 text-muted-foreground">{label}</div><div>{children}</div></div>;
}
