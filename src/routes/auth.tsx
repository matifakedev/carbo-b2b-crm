import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/crm/fields";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Ingresar · CRM - CARBO" }, { name: "description", content: "Acceso privado al CRM de Carbo Energy." }, { property: "og:title", content: "Ingresar · CRM - CARBO" }, { property: "og:description", content: "Acceso privado al CRM de Carbo Energy." }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr("Email o contraseña incorrectos.");
    navigate({ to: "/personas" });
  }
  return <AuthLayout title="Ingresar">
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña" htmlFor="pw"><Input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</Button>
      <p className="text-sm text-muted-foreground">Acceso solo por invitación. No hay registro público.</p>
    </form>
  </AuthLayout>;
}

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground md:flex">
        <div className="font-mono text-xl font-bold">CRM · CARBO</div>
        <div>
          <div className="label-mono text-mint">Carbo Energy · Almacenamiento energético B2B</div>
          <p className="mt-4 max-w-md text-3xl font-semibold leading-tight">Personas, organizaciones y vínculos que llevan a cada proyecto.</p>
        </div>
        <div className="label-mono text-sidebar-muted">Espacio privado</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="mb-8 text-3xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
