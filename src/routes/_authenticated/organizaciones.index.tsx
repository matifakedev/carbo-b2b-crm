import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceTag, Tag, VerificationTag, selectClass } from "@/components/crm/fields";
import { ORG_ROLES, SOURCE_LABELS, VERIFICATION_LABELS, formatDateTime, type SourceType, type VerificationStatus } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/organizaciones/")({
  head: () => ({ meta: [{ title: "Organizaciones · CRM - CARBO" }, { name: "description", content: "Directorio de organizaciones del CRM de Carbo Energy." }, { property: "og:title", content: "Organizaciones · CRM - CARBO" }, { property: "og:description", content: "Directorio de organizaciones del CRM de Carbo Energy." }] }),
  component: OrgList,
});

function OrgList() {
  const { current } = useWorkspace();
  const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [source, setSource] = useState(""); const [ver, setVer] = useState(""); const [archived, setArchived] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["orgs", current?.id], enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations")
        .select("id, name, normalized_name, location, org_roles, source_type, verification_status, archived_at, updated_at, affiliations(id, archived_at)")
        .eq("workspace_id", current!.id).order("name");
      if (error) throw error; return data;
    },
  });
  const norm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const rows = data.filter((o) => !!o.archived_at === archived && (!role || o.org_roles.includes(role)) && (!source || o.source_type === source) && (!ver || o.verification_status === ver)
    && (!norm || `${o.normalized_name} ${(o.location ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`.includes(norm)));
  return (
    <>
      <PageHeader crumb={`Directorio / ${current?.name ?? ""}`} title="Organizaciones" action={<Button asChild><Link to="/organizaciones/nueva">Nueva organización</Link></Button>} />
      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_200px_200px_180px_auto]">
        <Input aria-label="Buscar" placeholder="Buscar por nombre o ubicación" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Rol" className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}><option value="">Todos los roles</option>{Object.entries(ORG_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Procedencia" className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}><option value="">Toda procedencia</option>{Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Verificación" className={selectClass} value={ver} onChange={(e) => setVer(e.target.value)}><option value="">Toda verificación</option>{Object.entries(VERIFICATION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archivadas</label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left"><tr className="label-mono text-muted-foreground">
            <th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3 text-right">Personas</th><th className="px-4 py-3">Procedencia</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Modificado</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-panel-subtle">
                <td className="px-4 py-3"><Link to="/organizaciones/$id" params={{ id: o.id }} className="font-semibold hover:text-primary">{o.name}</Link>{o.location && <div className="text-xs text-muted-foreground">{o.location}</div>}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{o.org_roles.map((r) => <Tag key={r}>{ORG_ROLES[r] ?? r}</Tag>)}</div></td>
                <td className="px-4 py-3 text-right font-mono">{o.affiliations.filter((a) => !a.archived_at).length}</td>
                <td className="px-4 py-3"><SourceTag source={o.source_type as SourceType} /></td>
                <td className="px-4 py-3"><VerificationTag status={o.verification_status as VerificationStatus} /></td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{formatDateTime(o.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 && <div className="px-4 py-12 text-center text-muted-foreground">{data.length === 0 ? "Todavía no hay organizaciones en este espacio." : "Ningún resultado con estos filtros."}</div>}
      </div>
    </>
  );
}
