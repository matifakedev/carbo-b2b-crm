import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ATTACH_LIMITS, type AttachFormat } from "@/lib/attachments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/** Reads a stored attachment with the caller's own permissions and saves its extracted text. Safe to retry. */
export const processAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attachment_id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(d.attachment_id ?? ""))) throw new Error("Adjunto inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: a } = await sb.from("chat_attachments").select("*").eq("id", data.attachment_id).maybeSingle();
    if (!a) throw new Error("Adjunto no encontrado o sin acceso");
    if (a.status === "ready" || a.status === "partial" || (a.status === "failed" && a.read_condition)) return { status: a.status as string };
    const fresh = a.status === "processing" && a.processing_started_at && Date.now() - Date.parse(a.processing_started_at) < ATTACH_LIMITS.staleProcessingMs;
    if (fresh) return { status: "processing" };
    await sb.from("chat_attachments").update({ status: "processing", processing_started_at: new Date().toISOString(), error: null }).eq("id", a.id);
    const save = (patch: Record<string, unknown>) => sb.from("chat_attachments").update(patch).eq("id", a.id);
    try {
      const { data: blob, error } = await sb.storage.from("brain-files").download(a.storage_path);
      if (error || !blob) { await save({ status: "failed", error: "No se encontró el archivo guardado.", limitation: "La carga no terminó; volvé a adjuntarlo." }); return { status: "failed" }; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
      if (digest !== a.sha256) { await save({ status: "failed", read_condition: "unreadable", limitation: "El archivo guardado no coincide con el cargado." }); return { status: "failed" }; }
      const { extractAttachment } = await import("@/lib/attachments.server");
      const r = await extractAttachment(a.format as AttachFormat, bytes);
      let source_document_id: string | null = a.source_document_id;
      if (r.text.trim() && !source_document_id) {
        const { data: doc, error: e2 } = await sb.from("source_documents").insert({ workspace_id: a.workspace_id, kind: "attachment", title: a.file_name.slice(0, 200), original_text: r.text, attachment_id: a.id }).select("id").single();
        if (e2) throw new Error(e2.message);
        source_document_id = doc.id;
      }
      await save({ status: r.status, read_condition: r.read_condition, pages_total: r.pages_total, pages_read: r.pages_read, extracted_text: r.text || null, segments: r.segments, structure: r.structure, limitation: r.limitation, error: r.error, source_document_id });
      return { status: r.status };
    } catch (e) {
      console.error("attachment processing", a.id, e);
      await save({ status: "failed", error: (e as Error).message.slice(0, 300), limitation: "Falló el procesamiento; podés reintentar." , read_condition: null });
      return { status: "failed" };
    }
  });
