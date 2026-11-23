import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_LABELS, PERSON_ROLES, type ContactKind, type SourceType, type VerificationStatus } from "@/lib/crm";
import { Field, ProvenanceFields, RolesPicker, selectClass } from "./fields";

export type ContactDraft = { id?: string; kind: ContactKind; value: string; label: string };
export type PersonDraft = {
  full_name: string;
  location: string;
  relationship_context: string;
  notes: string;
  person_roles: string[];
  source_type: SourceType;
  source_detail: string;
  verification_status: VerificationStatus;
  contacts: ContactDraft[];
};

export const emptyPerson: PersonDraft = {
  full_name: "", location: "", relationship_context: "", notes: "", person_roles: [],
  source_type: "personal", source_detail: "", verification_status: "unverified", contacts: [],
};

export function PersonForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: PersonDraft; submitLabel: string; busy?: boolean;
  onSubmit: (d: PersonDraft) => void; onCancel?: () => void;
}) {
  const [d, setD] = useState<PersonDraft>(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  return (
    <form className="space-y-8" onSubmit={(e) => {
      e.preventDefault();
      if (!d.full_name.trim()) { setErr("El nombre es obligatorio."); return; }
      setErr(null);
      onSubmit({ ...d, contacts: d.contacts.filter((c) => c.value.trim()) });
    }}>
      <section className="panel space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo *" htmlFor="p-name">
            <Input id="p-name" value={d.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </Field>
          <Field label="Ubicación" htmlFor="p-loc" hint="Solo si se conoce.">
            <Input id="p-loc" value={d.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
        </div>
        <Field label="Contexto del vínculo" htmlFor="p-ctx">
          <Textarea id="p-ctx" rows={3} value={d.relationship_context} onChange={(e) => set("relationship_context", e.target.value)} placeholder="Cómo la conocemos, a través de quién…" />
        </Field>
        <Field label="Rol en la red" hint="No implica autoridad de compra.">
          <RolesPicker options={PERSON_ROLES} value={d.person_roles} onChange={(v) => set("person_roles", v)} />
        </Field>
      </section>

      <section className="panel space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="label-mono">Medios de contacto · opcionales</div>
          <Button type="button" variant="outline" size="sm" onClick={() => set("contacts", [...d.contacts, { kind: "email", value: "", label: "" }])}>Agregar medio</Button>
        </div>
        {d.contacts.length === 0 && <p className="text-sm text-muted-foreground">Sin medios de contacto. Se puede guardar igual.</p>}
        {d.contacts.map((c, i) => (
          <div key={i} className="grid gap-3 md:grid-cols-[160px_1fr_200px_auto]">
            <select aria-label="Tipo" className={selectClass} value={c.kind}
              onChange={(e) => set("contacts", d.contacts.map((x, j) => j === i ? { ...x, kind: e.target.value as ContactKind } : x))}>
              {Object.entries(CONTACT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Input aria-label="Valor" value={c.value} onChange={(e) => set("contacts", d.contacts.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
            <Input aria-label="Etiqueta" placeholder="Etiqueta (opcional)" value={c.label} onChange={(e) => set("contacts", d.contacts.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <Button type="button" variant="ghost" onClick={() => set("contacts", d.contacts.filter((_, j) => j !== i))}>Quitar</Button>
          </div>
        ))}
      </section>

      <section className="panel space-y-4 p-6">
        <div className="label-mono">Procedencia del dato</div>
        <ProvenanceFields idPrefix="p" value={d} onChange={(v) => setD((p) => ({ ...p, ...v }))} />
        <Field label="Notas" htmlFor="p-notes">
          <Textarea id="p-notes" rows={3} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </section>

      {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Guardando…" : submitLabel}</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </form>
  );
}
