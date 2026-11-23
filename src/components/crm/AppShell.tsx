import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";

const nav = [
  { to: "/chat", label: "Brain" },
  { to: "/agenda", label: "Agenda" },
  { to: "/red", label: "Red" },
  { to: "/proyectos", label: "Proyectos" },
  { to: "/oportunidades", label: "Oportunidades" },
  { to: "/personas", label: "Personas" },
  { to: "/organizaciones", label: "Organizaciones" },
  { to: "/introducciones", label: "Introducciones" },
  { to: "/conversaciones", label: "Conversaciones" },
  { to: "/capacidades", label: "Capacidades Carbo" },
  { to: "/importar-agenda", label: "Importar agenda" },
  { to: "/equipo", label: "Equipo" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { workspaces, current, setCurrentId, email } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border px-6 py-6">
          <div className="font-mono text-lg font-bold tracking-tight">CRM · CARBO</div>
          <div className="label-mono mt-1 text-sidebar-muted">Carbo Energy</div>
        </div>
        <div className="border-b border-sidebar-border px-6 py-4">
          <label htmlFor="ws" className="label-mono text-sidebar-muted">Espacio</label>
          <select
            id="ws"
            value={current?.id ?? ""}
            onChange={(e) => setCurrentId(e.target.value)}
            className="mt-2 h-10 w-full rounded-sm border border-sidebar-border bg-sidebar-accent px-2 text-sm text-sidebar-foreground"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}{w.is_demo ? " (ficticio)" : ""}</option>
            ))}
          </select>
        </div>
        <nav className="flex-1 py-4">
          {nav.map((n, i) => (<div key={n.to}>{i === 1 && <div className="label-mono px-6 pb-1 pt-4 text-sidebar-muted">Módulos</div>}
            <Link
              key={n.to}
              to={n.to}
              className="block border-l-2 border-transparent px-6 py-3 text-sm font-medium text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "!border-mint bg-sidebar-accent !text-sidebar-foreground" }}
            >
              {n.label}
            </Link></div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-6 py-4">
          <div className="truncate font-mono text-xs text-sidebar-muted">{email}</div>
          <button onClick={signOut} className="mt-2 text-sm font-semibold text-sidebar-foreground hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {current?.is_demo && (
          <div className="border-b border-warning/40 bg-warning/10 px-8 py-2 label-mono text-warning">
            Espacio de demostración · todos los datos son ficticios
          </div>
        )}
        {!current && workspaces.length === 0 ? (
          <div className="mx-auto max-w-xl px-8 py-16">
            <h1 className="text-2xl font-semibold">Sin acceso a un espacio</h1>
            <p className="mt-2 text-muted-foreground">Tu cuenta no pertenece a ningún espacio de trabajo. Pedí una invitación a un administrador.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-[1440px] px-8 py-10">{children}</div>
        )}
      </main>
    </div>
  );
}

export function PageHeader({ crumb, title, action }: { crumb: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        <div className="label-mono text-muted-foreground">{crumb}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}
