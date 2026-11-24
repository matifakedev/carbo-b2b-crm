import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";

const nav = [
  { to: "/chat", label: "Brain" },
  { to: "/agenda", label: "Agenda" },
  { to: "/red", label: "Red" },
  // Ocultos del menú por ahora (las pantallas siguen existiendo):
  // { to: "/proyectos", label: "Proyectos" },
  // { to: "/oportunidades", label: "Oportunidades" },
  { to: "/personas", label: "Personas" },
  { to: "/organizaciones", label: "Organizaciones" },
  { to: "/introducciones", label: "Introducciones" },
  { to: "/conversaciones", label: "Conversaciones" },
  { to: "/capacidades", label: "Capacidades Carbo" },
  // { to: "/importar-agenda", label: "Importar agenda" }, // oculto del menú por ahora
  { to: "/equipo", label: "Equipo" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { workspaces, current, setCurrentId, email } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [open]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <span className="font-mono text-base font-bold tracking-tight">CRM · CARBO</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="app-nav" className="rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-sidebar-accent">{open ? "Cerrar" : "Menú"}</button>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside id="app-nav" className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
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
            className="mt-2 h-10 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 text-sm text-sidebar-foreground"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}{w.is_demo ? " (ficticio)" : ""}</option>
            ))}
          </select>
        </div>
        <nav className="flex-1 px-3 py-4">
          {nav.map((n, i) => (<div key={n.to}>{i === 1 && <div className="label-mono px-3 pb-1 pt-4 text-sidebar-muted">Módulos</div>}
            <Link
              key={n.to}
              to={n.to}
              className="relative block rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "bg-sidebar-accent !text-sidebar-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-mint" }}
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
      <main className="min-w-0 flex-1 pt-14 lg:pt-0">
        {current?.is_demo && (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 label-mono text-warning md:px-8">
            Espacio de demostración · todos los datos son ficticios
          </div>
        )}
        {!current && workspaces.length === 0 ? (
          <div className="mx-auto max-w-xl px-8 py-16">
            <h1 className="text-2xl font-semibold">Sin acceso a un espacio</h1>
            <p className="mt-2 text-muted-foreground">Tu cuenta no pertenece a ningún espacio de trabajo. Pedí una invitación a un administrador.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">{children}</div>
        )}
      </main>
    </div>
  );
}

export function PageHeader({ crumb, title, action }: { crumb: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 pb-2">
      <div>
        <div className="label-mono text-muted-foreground">{crumb}</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}
