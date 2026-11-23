import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMembers(ws: string | undefined) {
  return useQuery({
    queryKey: ["members-full", ws], enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.from("workspace_members").select("user_id, email, display_name, role, person_id").eq("workspace_id", ws!).order("created_at");
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, name: m.display_name || m.email || "Usuario" }));
    },
  });
}
export function usePeopleOptions(ws: string | undefined) {
  return useQuery({
    queryKey: ["people-opts", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("people").select("id, full_name, archived_at").eq("workspace_id", ws!).order("full_name")).data ?? [],
  });
}
export function useOrgOptions(ws: string | undefined) {
  return useQuery({
    queryKey: ["org-opts", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("organizations").select("id, name, archived_at").eq("workspace_id", ws!).order("name")).data ?? [],
  });
}
export function useIntroOptions(ws: string | undefined) {
  return useQuery({
    queryKey: ["intro-opts", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("introductions").select("id, purpose, target_description, introducer:people!introductions_introducer_person_id_fkey(full_name), target:people!introductions_target_person_id_fkey(full_name), org:organizations(name)").eq("workspace_id", ws!).order("created_at", { ascending: false })).data ?? [],
  });
}
export function introLabel(i: { purpose: string | null; target_description: string | null; introducer: { full_name: string } | null; target: { full_name: string } | null; org: { name: string } | null }) {
  const to = i.target?.full_name ?? i.org?.name ?? i.target_description ?? "destino sin identificar";
  return `${i.introducer?.full_name ?? "?"} → ${to}${i.purpose ? ` · ${i.purpose}` : ""}`;
}
