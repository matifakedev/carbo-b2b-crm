import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; organization_id: string; focus?: string; web_search: boolean; urls?: string[]; pasted?: { title: string; url?: string; text: string } | null }) => {
    const urls = (d.urls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 5);
    for (const u of urls) { try { const p = new URL(u); if (!/^https?:$/.test(p.protocol)) throw 0; } catch { throw new Error(`URL inválida: ${u}`); } }
    if (d.pasted && (!d.pasted.text.trim() || d.pasted.text.length > 40000)) throw new Error("El texto aportado está vacío o es demasiado largo (máx. 40.000).");
    return { ...d, urls, focus: d.focus?.slice(0, 200) ?? "" };
  })
  .handler(async ({ data, context }) => {
    const { executeResearch } = await import("@/lib/research.server");
    return executeResearch(context.supabase, data);
  });
