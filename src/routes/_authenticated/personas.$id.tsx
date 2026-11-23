import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { PersonForm, type PersonDraft, type ContactDraft } from "@/components/crm/PersonForm";
import { AffiliationForm, affPayload, emptyAff, type AffDraft } from "@/components/crm/AffiliationForm";
import { AuditFooter, SourceTag, Tag, VerificationTag } from "@/components/crm/fields";
import { CONTACT_LABELS, PERSON_ROLES, describeTenure, type ContactKind, type SourceType, type VerificationStatus } from "@/lib/crm";
import { personPayload, syncContacts } from "@/lib/people";

export const Route = createFileRoute("/_authenticated/personas/$id")({
  head: () => ({ meta: [{ title: "Ficha de persona · CRM - CARBO" }, { name: "description", content: "Ficha de persona en el CRM de Carbo." }, { property: "og:title", content: "Ficha de persona · CRM - CARBO" }, { property: "og:description", content: "Ficha de persona en el CRM de Carbo." }] }),
  component: PersonDetail,
});

function PersonDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [affEdit, setAffEdit] = useState<string | "new" | null>(null);

  const { data: p, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("people")
        .select("*, person_contacts(id, kind, value, label), affiliations(*, organizations(id, name))")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-select", p?.workspace_id],
    enabled: !!p,
    queryFn: async () => (await supabase.from("organizations").select("id, name").eq("workspace_id", p!.workspace_id).is("archived_at", null).order("name")).data ?? [],
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["person", id] }); qc.invalidateQueries({ queryKey: ["people"] }); };

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!p) return <p>No encontramos esta persona o no tenés acceso.</p>;

  const draft: PersonDraft = {
    full_name: p.full_name, location: p.location ?? "", relationship_context: p.relationship_context ?? "", notes: p.notes ?? "",
    person_roles: p.person_roles, source_type: p.source_type as SourceType, source_detail: p.source_detail ?? "",
    verification_status: p.verification_status as VerificationStatus,
    contacts: p.person_contacts.map((c): ContactDraft => ({ id: c.id, kind: c.kind as ContactKind, value: c.value, label: c.label ?? "" })),
  };

  async function save(d: PersonDraft) {
    setBusy(true);
    try {
      const { error } = await supabase.from("people").update(personPayload(d)).eq("id", id);
      if (error) throw error;
      await syncContacts(p!.workspace_id, id, d.contacts, p!.person_contacts.map((c) => c.id));
      toast.success("Cambios guardados");
      setEditing(false); refresh();
    } catch (e) { toast.error(`No se pudo guardar: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  async function toggleArchive() {
    const { error } = await supabase.from("people").update({ archived_at: p!.archived_at ? null : new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(p!.archived_at ? "Persona restaurada" : "Persona archivada");
    refresh();
  }

  async function saveAff(d: AffDraft, affId?: string) {
    setBusy(true);
    const { error } = affId
      ? await supabase.from("affiliations").update(affPayload(d)).eq("id", affId)
      : await supabase.from("affiliations").insert({ ...affPayload(d), workspace_id: p!.workspace_id, person_id: id, organization_id: d.organization_id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setAffEdit(null); refresh();
  }
  async function archiveAff(affId: string, archived: boolean) {
    const { error } = await supabase.from("affiliations").update({ archived_at: archived ? null : new Date().toISOString() }).eq("id", affId);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  const affs = [...p.affiliations].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at));

  return (
    <>
      <PageHeader crumb="Directorio / Personas" title={p.full_name}
        action={!editing && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={toggleArchive}>{p.archived_at ? "Restaurar" : "Archivar"}</Button>
            <Button onClick={() => setEditing(true)}>Editar</Button>
          </div>
        )} />
      {p.archived_at && <div className="mb-6"><Tag tone="warning">Archivada</Tag></div>}
      {editing ? (
        <PersonForm initial={draft} submitLabel="Guardar cambios" busy={busy} onSubmit={save} onCancel={() => setEditing(false)} />
      ) : (
        <div className="space-y-6">
          <section className="panel grid gap-6 p-6 md:grid-cols-3">
            <Info label="Ubicación">{p.location || "Desconocida"}</Info>
            <Info label="Rol en la red">
              <div className="flex flex-wrap gap-1">{p.person_roles.length ? p.person_roles.map((r) => <Tag key={r}>{PERSON_ROLES[r] ?? r}</Tag>) : "—"}</div>
            </Info>
            <Info label="Procedencia">
              <div className="flex flex-wrap items-center gap-2"><SourceTag source={p.source_type as SourceType} /><VerificationTag status={p.verification_status as VerificationStatus} /></div>
              {p.source_detail && <div className="mt-1 text-sm text-muted-foreground">{p.source_detail}</div>}
            </Info>
            <div className="md:col-span-3"><Info label="Contexto del vínculo">{p.relationship_context || "—"}</Info></div>
            <div className="md:col-span-3">
              <Info label="Medios de contacto">
                {p.person_contacts.length ? (
                  <ul className="space-y-1">{p.person_contacts.map((c) => (
                    <li key={c.id} className="font-mono text-sm"><span className="label-mono mr-2 text-muted-foreground">{CONTACT_LABELS[c.kind as ContactKind]}</span>{c.value}{c.label ? ` · ${c.label}` : ""}</li>
                  ))}</ul>
                ) : <span className="text-muted-foreground">Sin medios de contacto registrados</span>}
              </Info>
            </div>
            {p.notes && <div className="md:col-span-3"><Info label="Notas">{p.notes}</Info></div>}
          </section>

          <section className="panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Afiliaciones</h2>
              {affEdit === null && <Button size="sm" variant="outline" onClick={() => setAffEdit("new")}>Agregar afiliación</Button>}
            </div>
            {affEdit === "new" && <div className="mb-4"><AffiliationForm orgs={orgs} initial={emptyAff} busy={busy} onSubmit={(d) => saveAff(d)} onCancel={() => setAffEdit(null)} /></div>}
            {orgs.length === 0 && affEdit === "new" && <p className="mb-4 text-sm text-muted-foreground">Primero creá una organización en este espacio.</p>}
            <ul className="divide-y divide-border border-y border-border">
              {affs.map((a) => {
                const org = a.organizations as { id: string; name: string } | null;
                return (
                  <li key={a.id} className="py-4">
                    {affEdit === a.id ? (
                      <AffiliationForm orgs={org ? [org, ...orgs.filter((o) => o.id !== org.id)] : orgs} lockOrg busy={busy}
                        initial={{ organization_id: a.organization_id, title: a.title ?? "", is_current: a.is_current === null ? "" : a.is_current ? "true" : "false",
                          tenure_known: a.tenure_known, start_date: a.start_date ?? "", end_date: a.end_date ?? "", notes: a.notes ?? "",
                          source_type: a.source_type as SourceType, source_detail: a.source_detail ?? "", verification_status: a.verification_status as VerificationStatus }}
                        onSubmit={(d) => saveAff(d, a.id)} onCancel={() => setAffEdit(null)} />
                    ) : (
                      <div className={`flex flex-wrap items-start justify-between gap-4 ${a.archived_at ? "opacity-60" : ""}`}>
                        <div>
                          {org ? <Link to="/organizaciones/$id" params={{ id: org.id }} className="font-semibold hover:text-primary">{org.name}</Link> : "—"}
                          <div className="text-sm">{a.title || <span className="text-muted-foreground">Cargo desconocido</span>}</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{describeTenure(a)}</div>
                          <div className="mt-2 flex gap-2"><SourceTag source={a.source_type as SourceType} /><VerificationTag status={a.verification_status as VerificationStatus} />{a.archived_at && <Tag tone="warning">Archivada</Tag>}</div>
                        </div>
                        <div className="flex gap-3 text-sm font-semibold">
                          <button className="text-primary hover:underline" onClick={() => setAffEdit(a.id)}>Editar</button>
                          <button className="text-muted-foreground hover:underline" onClick={() => archiveAff(a.id, !!a.archived_at)}>{a.archived_at ? "Restaurar" : "Archivar"}</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {affs.length === 0 && <li className="py-6 text-sm text-muted-foreground">Sin afiliaciones. Una persona puede tener varias.</li>}
            </ul>
          </section>
          <AuditFooter row={p} workspaceId={p.workspace_id} />
        </div>
      )}
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="label-mono mb-1 text-muted-foreground">{label}</div><div>{children}</div></div>;
}
