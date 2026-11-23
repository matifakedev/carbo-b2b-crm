import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CARBO_WORKSPACE_ID } from "@/lib/crm";

type Ws = { id: string; name: string; is_demo: boolean; role: "admin" | "collaborator" };
type Ctx = { workspaces: Ws[]; current: Ws | null; setCurrentId: (id: string) => void; userId: string | null; email: string | null };
const WorkspaceContext = createContext<Ctx | null>(null);
const KEY = "carbo.workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentId, setCurrentIdState] = useState<string>(CARBO_WORKSPACE_ID);
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) setCurrentIdState(saved);
  }, []);
  const setCurrentId = (id: string) => {
    localStorage.setItem(KEY, id);
    setCurrentIdState(id);
  };
  const { data } = useQuery({
    queryKey: ["me-workspaces"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const { data: rows, error } = await supabase
        .from("workspace_members")
        .select("role, workspaces(id, name, is_demo)")
        .eq("user_id", uid ?? "");
      if (error) throw error;
      const ws = (rows ?? [])
        .filter((r) => r.workspaces)
        .map((r) => ({ ...(r.workspaces as { id: string; name: string; is_demo: boolean }), role: r.role }))
        .sort((a, b) => Number(a.is_demo) - Number(b.is_demo));
      return { ws, uid, email: u.user?.email ?? null };
    },
  });
  const workspaces = data?.ws ?? [];
  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0] ?? null;
  return (
    <WorkspaceContext.Provider value={{ workspaces, current, setCurrentId, userId: data?.uid ?? null, email: data?.email ?? null }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error("useWorkspace outside provider");
  return c;
}
