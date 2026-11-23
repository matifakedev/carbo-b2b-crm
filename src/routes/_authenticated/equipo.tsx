import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Tag, selectClass } from "@/components/crm/fields";
import { createInvitation } from "@/lib/invitations.functions";
import { formatDateTime } from "@/lib/crm";
import { usePeopleOptions } from "@/lib/options";

export const Route = createFileRoute("/_authenticated/equipo")({
  head: () => ({ meta: [{ title: "Equipo · CRM - CARBO" }, { name: "description", content: "Miembros e invitaciones del espacio Carbo." }, { property: "og:title", content: "Equipo · CRM - CARBO" }, { property: "og:description", content: "Miembros e invitaciones del espacio Carbo." }] }),
  component: Team,
});

function Team() {
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const invite = useServerFn(createInvitation);
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"collaborator" | "admin">("collaborator");
  const [link, setLink] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const isAdmin = current?.role === "admin";
  const { userId } = useWorkspace();
  const { data: people = [] } = usePeopleOptions(current?.id);
  async function setMe(personId: string) {
    if (!current) return;
    const { error } = await supabase.rpc("set_my_person", { _ws: current.id, _person: (personId || null) as string });
    if (error) { toast.error(error.message); return; }
    toast.success("Vínculo guardado"); qc.invalidateQueries({ queryKey: ["team"] }); qc.invalidateQueries({ queryKey: ["graph"] });
  }

  const { data: members = [] } = useQuery({
    queryKey: ["team", current?.id], enabled: !!current,
    queryFn: async () => (await supabase.from("workspace_members").select("user_id, email, display_name, role, created_at, person_id").eq("workspace_id", current!.id).order("created_at")).data ?? [],
  });
  const { data: invites = [] } = useQuery({
    queryKey: ["invites", current?.id], enabled: !!current && isAdmin,
    queryFn: async () => (await supabase.from("invitations").select("id, email, role, expires_at, accepted_at, revoked_at, created_at").eq("workspace_id", current!.id).order("created_at", { ascending: false })).data ?? [],
  });

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!current) return; setBusy(true); setLink(null);
    try {
      const { token } = await invite({ data: { workspaceId: current.id, email, role } });
      setLink(`${window.location.origin}/invitacion/${token}`); setEmail("");
      qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    const { error } = await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["invites"] });
  }

  return (
    <>
      <PageHeader crumb={`Espacio / ${current?.name ?? ""}`} title="Equipo" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="mb-4 text-lg font-semibold">Miembros</h2>
          <ul className="divide-y divide-border border-y border-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-3">
                <div><div className="font-medium">{m.display_name || m.email}</div><div className="font-mono text-xs text-muted-foreground">{m.email}</div></div>
                <div className="flex items-center gap-3">
                  {m.user_id === userId ? (
                    <select aria-label="Esta persona soy yo" className={`${selectClass} h-9 w-48`} value={m.person_id ?? ""} onChange={(e) => setMe(e.target.value)}>
                      <option value="">Esta persona soy yo…</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  ) : <span className="font-mono text-xs text-muted-foreground">{people.find((p) => p.id === m.person_id)?.full_name ?? "sin ficha"}</span>}
                  <Tag tone={m.role === "admin" ? "primary" : "neutral"}>{m.role === "admin" ? "Administrador" : "Colaborador"}</Tag>
                </div>
              </li>
            ))}
          </ul>
        </section>
        {isAdmin ? (
          <section className="panel space-y-4 p-6">
            <h2 className="text-lg font-semibold">Invitar</h2>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_180px]">
              <Field label="Email" htmlFor="inv-email"><Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Rol" htmlFor="inv-role">
                <select id="inv-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  <option value="collaborator">Colaborador</option><option value="admin">Administrador</option>
                </select>
              </Field>
              <div><Button type="submit" disabled={busy}>Generar enlace</Button></div>
            </form>
            <p className="text-sm text-muted-foreground">Todavía no hay envío de correos configurado: el enlace no se manda solo. Copialo y envialo vos por un canal seguro. Es de un solo uso y vence en 7 días.</p>
            {link && (
              <div className="rounded-sm border border-primary bg-accent p-4">
                <div className="label-mono text-primary">Enlace generado · se muestra una sola vez</div>
                <div className="mt-2 break-all font-mono text-xs">{link}</div>
                <Button size="sm" className="mt-3" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copiado"); }}>Copiar enlace</Button>
              </div>
            )}
            <ul className="divide-y divide-border border-y border-border">
              {invites.map((i) => {
                const state = i.accepted_at ? "Aceptada" : i.revoked_at ? "Revocada" : new Date(i.expires_at) < new Date() ? "Vencida" : "Pendiente";
                return (
                  <li key={i.id} className="flex items-center justify-between gap-4 py-3">
                    <div><div className="font-mono text-sm">{i.email}</div><div className="font-mono text-xs text-muted-foreground">Creada {formatDateTime(i.created_at)}</div></div>
                    <div className="flex items-center gap-3">
                      <Tag tone={state === "Aceptada" ? "success" : state === "Pendiente" ? "warning" : "neutral"}>{state}</Tag>
                      {state === "Pendiente" && <button className="text-sm font-semibold text-destructive hover:underline" onClick={() => revoke(i.id)}>Revocar</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="panel p-6 text-sm text-muted-foreground">Solo un administrador puede invitar miembros.</section>
        )}
      </div>
    </>
  );
}
