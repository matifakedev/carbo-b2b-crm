import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SourceType, VerificationStatus } from "@/lib/crm";
import { Field, ProvenanceFields, selectClass } from "./fields";

export type AffDraft = {
  organization_id: string; title: string; is_current: "" | "true" | "false";
  tenure_known: boolean; start_date: string; end_date: string; notes: string;
  source_type: SourceType; source_detail: string; verification_status: VerificationStatus;
};
export const emptyAff: AffDraft = {
  organization_id: "", title: "", is_current: "", tenure_known: false, start_date: "", end_date: "", notes: "",
  source_type: "personal", source_detail: "", verification_status: "unverified",
};
export function affPayload(d: AffDraft) {
  return {
    title: d.title.trim() || null,
    is_current: d.is_current === "" ? null : d.is_current === "true",
    tenure_known: d.tenure_known,
    start_date: d.tenure_known && d.start_date ? d.start_date : null,
    end_date: d.tenure_known && d.end_date ? d.end_date : null,
    notes: d.notes.trim() || null,
    source_type: d.source_type, source_detail: d.source_detail.trim() || null, verification_status: d.verification_status,
  };
}

export function AffiliationForm({ orgs, initial, lockOrg, onSubmit, onCancel, busy }: {
  orgs: { id: string; name: string }[]; initial: AffDraft; lockOrg?: boolean; busy?: boolean;
  onSubmit: (d: AffDraft) => void; onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-4 rounded-sm border border-border bg-panel-subtle p-4" onSubmit={(e) => {
      e.preventDefault();
      if (!d.organization_id) { setErr("Elegí una organización."); return; }
      onSubmit(d);
    }}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Organización *" htmlFor="a-org">
          <select id="a-org" disabled={lockOrg} className={selectClass} value={d.organization_id} onChange={(e) => setD({ ...d, organization_id: e.target.value })}>
            <option value="">Elegir…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Cargo o rol" htmlFor="a-title" hint="Tal como se conoce; no implica autoridad de compra.">
          <Input id="a-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
        <Field label="Situación" htmlFor="a-cur">
          <select id="a-cur" className={selectClass} value={d.is_current} onChange={(e) => setD({ ...d, is_current: e.target.value as AffDraft["is_current"] })}>
            <option value="">Desconocida</option><option value="true">Actual</option><option value="false">Pasada</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.tenure_known} onChange={(e) => setD({ ...d, tenure_known: e.target.checked })} />
        Vigencia conocida
      </label>
      {d.tenure_known && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Desde" htmlFor="a-from"><Input id="a-from" type="date" value={d.start_date} onChange={(e) => setD({ ...d, start_date: e.target.value })} /></Field>
          <Field label="Hasta" htmlFor="a-to"><Input id="a-to" type="date" value={d.end_date} onChange={(e) => setD({ ...d, end_date: e.target.value })} /></Field>
        </div>
      )}
      <ProvenanceFields idPrefix="a" value={d} onChange={(v) => setD({ ...d, ...v })} />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={busy}>Guardar afiliación</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}
