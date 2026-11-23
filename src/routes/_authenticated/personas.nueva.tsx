import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { PersonForm, emptyPerson, type PersonDraft } from "@/components/crm/PersonForm";
import { DuplicateWarning } from "@/components/crm/fields";
import { personPayload, syncContacts } from "@/lib/people";

export const Route = createFileRoute("/_authenticated/personas/nueva")({
  head: () => ({ meta: [{ title: "Nueva persona · CRM - CARBO" }, { name: "description", content: "Crear una persona en el CRM de Carbo." }, { property: "og:title", content: "Nueva persona · CRM - CARBO" }, { property: "og:description", content: "Crear una persona en el CRM de Carbo." }] }),
  component: NewPerson,
});

type Dup = { id: string; label: string; reason: string; archived: boolean };

function NewPerson() {
  const { current } = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PersonDraft>(emptyPerson);
  const [dups, setDups] = useState<Dup[] | null>(null);

  async function create(d: PersonDraft) {
    if (!current) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("people").insert({ ...personPayload(d), workspace_id: current.id }).select("id").single();
      if (error) throw error;
      await syncContacts(current.id, data.id, d.contacts, []);
      qc.invalidateQueries({ queryKey: ["people"] });
      toast.success("Persona creada");
      navigate({ to: "/personas/$id", params: { id: data.id } });
    } catch (e) {
      toast.error(`No se pudo guardar: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function check(d: PersonDraft) {
    if (!current) return;
    setDraft(d);
    setBusy(true);
    const { data, error } = await supabase.rpc("find_person_duplicates", { _ws: current.id, _name: d.full_name, _contacts: d.contacts.map((c) => c.value) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data && data.length) { setDups(data.map((r) => ({ id: r.id, label: r.full_name, reason: r.reason, archived: r.archived }))); return; }
    await create(d);
  }

  return (
    <>
      <PageHeader crumb="Directorio / Personas" title="Nueva persona" />
      {dups ? (
        <DuplicateWarning items={dups}
          onOpen={(id) => navigate({ to: "/personas/$id", params: { id } })}
          onContinue={() => { setDups(null); create(draft); }}
          onCancel={() => setDups(null)} />
      ) : (
        <PersonForm key={JSON.stringify(draft)} initial={draft} submitLabel="Crear persona" busy={busy} onSubmit={check} onCancel={() => navigate({ to: "/personas" })} />
      )}
    </>
  );
}
