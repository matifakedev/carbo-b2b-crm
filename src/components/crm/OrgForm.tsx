import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ORG_ROLES, type SourceType, type VerificationStatus } from "@/lib/crm";
import { Field, ProvenanceFields, RolesPicker } from "./fields";

export type OrgDraft = {
  name: string; location: string; website: string; description: string; org_roles: string[];
  source_type: SourceType; source_detail: string; verification_status: VerificationStatus;
};
export const emptyOrg: OrgDraft = { name: "", location: "", website: "", description: "", org_roles: [], source_type: "personal", source_detail: "", verification_status: "unverified" };
export function orgPayload(d: OrgDraft) {
  return {
    name: d.name.trim(), location: d.location.trim() || null, website: d.website.trim() || null,
    description: d.description.trim() || null, org_roles: d.org_roles,
    source_type: d.source_type, source_detail: d.source_detail.trim() || null, verification_status: d.verification_status,
  };
}

export function OrgForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: OrgDraft; submitLabel: string; busy?: boolean; onSubmit: (d: OrgDraft) => void; onCancel?: () => void;
}) {
  const [d, setD] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); if (!d.name.trim()) { setErr("El nombre es obligatorio."); return; } setErr(null); onSubmit(d); }}>
      <section className="panel space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre *" htmlFor="o-name"><Input id="o-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Ubicación / país" htmlFor="o-loc"><Input id="o-loc" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} /></Field>
          <Field label="Sitio web" htmlFor="o-web"><Input id="o-web" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} /></Field>
        </div>
        <Field label="Roles de la organización"><RolesPicker options={ORG_ROLES} value={d.org_roles} onChange={(v) => setD({ ...d, org_roles: v })} /></Field>
        <Field label="Descripción" htmlFor="o-desc"><Textarea id="o-desc" rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
      </section>
      <section className="panel space-y-4 p-6">
        <div className="label-mono">Procedencia del dato</div>
        <ProvenanceFields idPrefix="o" value={d} onChange={(v) => setD({ ...d, ...v })} />
      </section>
      {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Guardando…" : submitLabel}</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </form>
  );
}
