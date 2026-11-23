CREATE TABLE public.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text NOT NULL CHECK (length(trim(file_name)) > 0),
  mime text,
  format text NOT NULL CHECK (format IN ('pdf','text','markdown','eml','docx','csv','xlsx','xls','image')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','processing','ready','partial','failed')),
  read_condition text CHECK (read_condition IN ('text','scanned','mixed','protected','unreadable','unsupported')),
  pages_total integer,
  pages_read integer,
  extracted_text text,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  structure jsonb,
  limitation text,
  error text,
  source_document_id uuid REFERENCES public.source_documents(id) ON DELETE SET NULL,
  extraction_id uuid REFERENCES public.brain_extractions(id) ON DELETE SET NULL,
  processing_started_at timestamptz,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, sha256)
);
GRANT SELECT, INSERT, UPDATE ON public.chat_attachments TO authenticated;
GRANT ALL ON public.chat_attachments TO service_role;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read attachments" ON public.chat_attachments FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "members add attachments" ON public.chat_attachments FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id) AND storage_path LIKE workspace_id::text || '/%');
CREATE POLICY "members update attachments" ON public.chat_attachments FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id) AND storage_path LIKE workspace_id::text || '/%');
CREATE TRIGGER chat_attachments_audit BEFORE INSERT OR UPDATE ON public.chat_attachments FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TABLE public.chat_attachment_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES public.chat_attachments(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.brain_threads(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attachment_id, thread_id)
);
GRANT SELECT, INSERT ON public.chat_attachment_uses TO authenticated;
GRANT ALL ON public.chat_attachment_uses TO service_role;
ALTER TABLE public.chat_attachment_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read uses" ON public.chat_attachment_uses FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "members add uses" ON public.chat_attachment_uses FOR INSERT TO authenticated WITH CHECK (
  public.is_workspace_member(workspace_id)
  AND EXISTS (SELECT 1 FROM public.chat_attachments a WHERE a.id = attachment_id AND a.workspace_id = chat_attachment_uses.workspace_id)
  AND EXISTS (SELECT 1 FROM public.brain_threads t WHERE t.id = thread_id AND t.workspace_id = chat_attachment_uses.workspace_id AND t.owner_user_id = auth.uid())
);

ALTER TABLE public.source_documents ADD COLUMN attachment_id uuid REFERENCES public.chat_attachments(id) ON DELETE SET NULL;
ALTER TABLE public.source_documents DROP CONSTRAINT IF EXISTS source_documents_kind_check;
ALTER TABLE public.source_documents ADD CONSTRAINT source_documents_kind_check CHECK (kind IN ('email','notes','transcript','research','attachment'));

ALTER TABLE public.brain_requests ADD COLUMN progress text;

CREATE POLICY "members read brain files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brain-files' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "members upload brain files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brain-files' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid));