import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceTag, Tag, VerificationTag, selectClass } from "@/components/crm/fields";
import { PERSON_ROLES, SOURCE_LABELS, VERIFICATION_LABELS, formatDateTime, type SourceType, type VerificationStatus } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/personas/")({
  head: () => ({ meta: [{ title: "Personas · CRM - CARBO" }, { name: "description", content: "Directorio de personas del CRM de Carbo Energy." }, { property: "og:title", content: "Personas · CRM - CARBO" }, { property: "og:description", content: "Directorio de personas del CRM de Carbo Energy." }] }),
  component: PeopleList,
});

function PeopleList() {
  const { current } = useWorkspace();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [source, setSource] = useState("");
  const [ver, setVer] = useState("");
  const [archived, setArchived] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["people", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, full_name, normalized_name, location, person_roles, source_type, verification_status, archived_at, updated_at, affiliations(title, archived_at, organizations(name)), person_contacts(value)")
        .eq("workspace_id", current!.id)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const norm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const rows = data.filter((p) => {
    if (!!p.archived_at !== archived) return false;
    if (role && !p.person_roles.includes(role)) return false;
    if (source && p.source_type !== source) return false;
    if (ver && p.verification_status !== ver) return false;
    if (!norm) return true;
    const hay = [p.normalized_name, p.location ?? "", ...p.affiliations.map((a) => `${a.title ?? ""} ${(a.organizations as { name: string } | null)?.name ?? ""}`), ...p.person_contacts.map((c) => c.value)]
      .join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return hay.includes(norm);
  });

  return (
    <>
      <PageHeader crumb={`Directorio / ${current?.name ?? ""}`} title="Personas"
        action={<Button asChild><Link to="/personas/nueva">Nueva persona</Link></Button>} />
      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_200px_200px_180px_auto]">
        <Input aria-label="Buscar" placeholder="Buscar por nombre, organización, cargo, ubicación o contacto" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Rol" className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Todos los roles</option>
          {Object.entries(PERSON_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Procedencia" className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Toda procedencia</option>
          {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Verificación" className={selectClass} value={ver} onChange={(e) => setVer(e.target.value)}>
          <option value="">Toda verificación</option>
          {Object.entries(VERIFICATION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archivados</label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left">
            <tr className="label-mono text-muted-foreground">
              <th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Afiliaciones</th><th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Procedencia</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Modificado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-panel-subtle">
                <td className="px-4 py-3">
                  <Link to="/personas/$id" params={{ id: p.id }} className="font-semibold text-foreground hover:text-primary">{p.full_name}</Link>
                  {p.location && <div className="text-xs text-muted-foreground">{p.location}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.affiliations.filter((a) => !a.archived_at).map((a) => (a.organizations as { name: string } | null)?.name).filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{p.person_roles.map((r) => <Tag key={r}>{PERSON_ROLES[r] ?? r}</Tag>)}</div></td>
                <td className="px-4 py-3"><SourceTag source={p.source_type as SourceType} /></td>
                <td className="px-4 py-3"><VerificationTag status={p.verification_status as VerificationStatus} /></td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{formatDateTime(p.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-muted-foreground">
            {data.length === 0 ? "Todavía no hay personas en este espacio." : "Ningún resultado con estos filtros."}
          </div>
        )}
      </div>
    </>
  );
}
