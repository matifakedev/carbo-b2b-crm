import { supabase } from "@/integrations/supabase/client";
import type { PersonDraft } from "@/components/crm/PersonForm";

export function personPayload(d: PersonDraft) {
  return {
    full_name: d.full_name.trim(),
    location: d.location.trim() || null,
    relationship_context: d.relationship_context.trim() || null,
    notes: d.notes.trim() || null,
    person_roles: d.person_roles,
    source_type: d.source_type,
    source_detail: d.source_detail.trim() || null,
    verification_status: d.verification_status,
  };
}

export async function syncContacts(workspaceId: string, personId: string, contacts: PersonDraft["contacts"], existingIds: string[]) {
  const keep = contacts.filter((c) => c.id).map((c) => c.id!);
  const removed = existingIds.filter((id) => !keep.includes(id));
  if (removed.length) {
    const { error } = await supabase.from("person_contacts").delete().in("id", removed);
    if (error) throw error;
  }
  for (const c of contacts) {
    const row = { kind: c.kind, value: c.value.trim(), label: c.label.trim() || null };
    const { error } = c.id
      ? await supabase.from("person_contacts").update(row).eq("id", c.id)
      : await supabase.from("person_contacts").insert({ ...row, workspace_id: workspaceId, person_id: personId });
    if (error) throw error;
  }
}
