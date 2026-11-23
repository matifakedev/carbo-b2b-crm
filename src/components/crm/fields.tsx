import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SOURCE_LABELS,
  VERIFICATION_LABELS,
  formatDateTime,
  type SourceType,
  type VerificationStatus,
} from "@/lib/crm";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="label-mono block text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const selectClass =
  "h-11 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-3 focus-visible:outline-mint";

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "error" | "primary" }) {
  const tones = {
    neutral: "text-muted-foreground",
    success: "text-success",
    warning: "text-warning",
    error: "text-destructive",
    primary: "text-primary",
  };
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-sm border border-current px-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em]", tones[tone])}>
      {children}
    </span>
  );
}

export function VerificationTag({ status }: { status: VerificationStatus }) {
  const tone = status === "verified" ? "success" : status === "doubtful" ? "error" : "warning";
  return <Tag tone={tone}>{VERIFICATION_LABELS[status]}</Tag>;
}

export function SourceTag({ source }: { source: SourceType }) {
  return <Tag tone={source === "hypothesis" ? "warning" : "primary"}>{SOURCE_LABELS[source]}</Tag>;
}

export function ProvenanceFields({
  value,
  onChange,
  idPrefix,
}: {
  value: { source_type: SourceType; source_detail: string; verification_status: VerificationStatus };
  onChange: (v: { source_type: SourceType; source_detail: string; verification_status: VerificationStatus }) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Procedencia" htmlFor={`${idPrefix}-src`}>
        <select id={`${idPrefix}-src`} className={selectClass} value={value.source_type}
          onChange={(e) => onChange({ ...value, source_type: e.target.value as SourceType })}>
          {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Detalle de la fuente" htmlFor={`${idPrefix}-srcd`}>
        <input id={`${idPrefix}-srcd`} className={selectClass} value={value.source_detail}
          placeholder="Ej.: reunión IVLP, sitio oficial…"
          onChange={(e) => onChange({ ...value, source_detail: e.target.value })} />
      </Field>
      <Field label="Verificación" htmlFor={`${idPrefix}-ver`}>
        <select id={`${idPrefix}-ver`} className={selectClass} value={value.verification_status}
          onChange={(e) => onChange({ ...value, verification_status: e.target.value as VerificationStatus })}>
          {Object.entries(VERIFICATION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
    </div>
  );
}

export function RolesPicker({ options, value, onChange }: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(options).map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button type="button" key={k} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={cn("h-9 rounded-sm border px-3 text-sm font-medium",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card hover:bg-accent")}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function useMemberNames(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase.from("workspace_members").select("user_id, email, display_name").eq("workspace_id", workspaceId!);
      const map: Record<string, string> = {};
      for (const m of data ?? []) map[m.user_id] = m.display_name || m.email || "Usuario";
      return map;
    },
  });
}

export function AuditFooter({ row, workspaceId }: {
  row: { created_by: string | null; created_at: string; updated_by: string | null; updated_at: string; archived_at?: string | null };
  workspaceId: string;
}) {
  const { data: names = {} } = useMemberNames(workspaceId);
  const n = (id: string | null) => (id ? names[id] ?? "Usuario" : "—");
  return (
    <dl className="grid gap-4 border-t border-border pt-4 font-mono text-xs text-muted-foreground md:grid-cols-3">
      <div><dt className="label-mono">Creado</dt><dd>{formatDateTime(row.created_at)} · {n(row.created_by)}</dd></div>
      <div><dt className="label-mono">Última modificación</dt><dd>{formatDateTime(row.updated_at)} · {n(row.updated_by)}</dd></div>
      {row.archived_at && <div><dt className="label-mono">Archivado</dt><dd>{formatDateTime(row.archived_at)}</dd></div>}
    </dl>
  );
}

export function DuplicateWarning({ items, onOpen, onContinue, onCancel }: {
  items: { id: string; label: string; reason: string; archived: boolean }[];
  onOpen: (id: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alert" className="rounded-sm border border-warning bg-warning/10 p-6">
      <div className="label-mono text-warning">Posibles duplicados</div>
      <p className="mt-2 text-sm">Encontramos registros parecidos. No se fusionan automáticamente: revisá si es la misma persona u organización.</p>
      <ul className="mt-4 divide-y divide-border border-y border-border">
        {items.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="font-medium">{d.label}</div>
              <div className="font-mono text-xs text-muted-foreground">{d.reason}{d.archived ? " · archivado" : ""}</div>
            </div>
            <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => onOpen(d.id)}>Abrir existente</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onContinue} className="h-11 rounded-sm bg-secondary px-5 text-sm font-semibold text-secondary-foreground">Es distinto, crear igual</button>
        <button type="button" onClick={onCancel} className="h-11 rounded-sm border border-border-strong px-5 text-sm font-semibold">Volver al formulario</button>
      </div>
    </div>
  );
}
