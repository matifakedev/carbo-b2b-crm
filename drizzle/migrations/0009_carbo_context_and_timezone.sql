
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';

CREATE TABLE public.carbo_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  kind text NOT NULL CHECK (kind IN ('commercial_profile','team_note','claim')),
  title text NOT NULL,
  body text NOT NULL,
  evidence text,
  is_sensitive boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved')),
  approved_by uuid,
  approved_at timestamptz,
  source_detail text,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.carbo_context TO authenticated;
GRANT ALL ON public.carbo_context TO service_role;
ALTER TABLE public.carbo_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read context" ON public.carbo_context FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "members add context" ON public.carbo_context FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "members edit context" ON public.carbo_context FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

CREATE OR REPLACE FUNCTION public.carbo_context_review()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and not public.is_workspace_admin(new.workspace_id) then raise exception 'Solo un administrador puede aprobar'; end if;
    if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); else new.approved_by := null; new.approved_at := null; end if;
    return new;
  end if;
  changed := (new.kind, new.title, new.body, new.evidence, new.is_sensitive) is distinct from (old.kind, old.title, old.body, old.evidence, old.is_sensitive);
  if new.status = 'approved' and (old.status <> 'approved' or changed) then
    if public.is_workspace_admin(new.workspace_id) then new.approved_by := auth.uid(); new.approved_at := now();
    elsif old.status <> 'approved' then raise exception 'Solo un administrador puede aprobar';
    else new.status := 'in_review'; new.approved_by := null; new.approved_at := null; end if;
  elsif new.status <> 'approved' then new.approved_by := null; new.approved_at := null;
  else new.approved_by := old.approved_by; new.approved_at := old.approved_at; end if;
  return new;
end $$;
CREATE TRIGGER carbo_context_audit BEFORE INSERT OR UPDATE ON public.carbo_context FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();
CREATE TRIGGER carbo_context_review BEFORE INSERT OR UPDATE ON public.carbo_context FOR EACH ROW EXECUTE FUNCTION public.carbo_context_review();
