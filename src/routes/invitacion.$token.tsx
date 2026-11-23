import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/crm/fields";
import { AuthLayout } from "./auth";
import { acceptInvitation, getInvitation } from "@/lib/invitations.functions";

export const Route = createFileRoute("/invitacion/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Invitación · CRM - CARBO" }, { name: "description", content: "Aceptar invitación al CRM de Carbo." }, { property: "og:title", content: "Invitación · CRM - CARBO" }, { property: "og:description", content: "Aceptar invitación al CRM de Carbo." }, { name: "robots", content: "noindex" }] }),
  component: AcceptPage,
});

function AcceptPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getInvitation); const accept = useServerFn(acceptInvitation);
  const { data: inv, isLoading } = useQuery({ queryKey: ["inv", token], queryFn: () => get({ data: { token } }) });
  const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setErr("Las contraseñas no coinciden.");
    setBusy(true); setErr(null);
    try {
      const { email } = await accept({ data: { token, password: pw, displayName: name } });
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      navigate({ to: "/personas" });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (isLoading) return <AuthLayout title="Invitación"><p className="text-muted-foreground">Verificando…</p></AuthLayout>;
  if (!inv) return <AuthLayout title="Invitación no válida"><p className="text-muted-foreground">El enlace no existe, ya se usó, fue revocado o venció. Pedí uno nuevo al administrador.</p></AuthLayout>;
  return (
    <AuthLayout title="Crear tu acceso">
      <p className="mb-6 text-sm text-muted-foreground">Invitación a <strong className="text-foreground">{inv.workspace}</strong> como {inv.role === "admin" ? "administrador" : "colaborador"} para <span className="font-mono">{inv.email}</span>.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tu nombre" htmlFor="n"><Input id="n" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Contraseña" htmlFor="p" hint="Mínimo 10 caracteres."><Input id="p" type="password" autoComplete="new-password" required minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repetir contraseña" htmlFor="p2"><Input id="p2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creando…" : "Crear acceso"}</Button>
      </form>
    </AuthLayout>
  );
}
