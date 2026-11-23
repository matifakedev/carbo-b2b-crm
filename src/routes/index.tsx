import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [{ title: "CRM - CARBO" }, { name: "description", content: "CRM privado de Carbo Energy para ventas B2B de almacenamiento energético." }, { property: "og:title", content: "CRM - CARBO" }, { property: "og:description", content: "CRM privado de Carbo Energy para ventas B2B de almacenamiento energético." }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/personas" : "/auth" });
  },
});
