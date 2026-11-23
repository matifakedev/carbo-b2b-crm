
ALTER TABLE public.brain_actions ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE public.brain_actions ADD COLUMN IF NOT EXISTS seq integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS brain_actions_operation_idx ON public.brain_actions(operation_id);

CREATE TABLE public.brain_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  op_key text NOT NULL,
  result jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, op_key)
);
GRANT SELECT, INSERT ON public.brain_operations TO authenticated;
GRANT ALL ON public.brain_operations TO service_role;
ALTER TABLE public.brain_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read operations" ON public.brain_operations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "members insert operations" ON public.brain_operations FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));

CREATE TABLE public.brain_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  request_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  thread_id uuid,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, request_id)
);
GRANT SELECT, INSERT, UPDATE ON public.brain_requests TO authenticated;
GRANT ALL ON public.brain_requests TO service_role;
ALTER TABLE public.brain_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own requests read" ON public.brain_requests FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id));
CREATE POLICY "own requests insert" ON public.brain_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));
CREATE POLICY "own requests update" ON public.brain_requests FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Atomic, idempotent Brain write: all steps + audit rows in one transaction.
CREATE OR REPLACE FUNCTION public.brain_apply(_ws uuid, _thread uuid, _op_key text, _steps jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  prev jsonb; s jsonb; t text; vals jsonb; k text; v jsonb; cols text; refs jsonb := '{}'; row_before jsonb; row_after jsonb;
  rid uuid; aid uuid; op uuid := gen_random_uuid(); results jsonb := '[]'; i int := 0; cur_person uuid;
  allowed text[] := array['people','organizations','affiliations','tasks','projects','project_participants','project_organizations','needs','conversations','conversation_links','person_contacts','person_links','introductions'];
begin
  if not public.is_workspace_member(_ws) then raise exception 'Sin acceso a este espacio'; end if;
  if _op_key is not null then
    select result into prev from public.brain_operations where workspace_id = _ws and op_key = _op_key;
    if prev is not null then return prev || jsonb_build_object('replayed', true); end if;
  end if;
  for s in select x from jsonb_array_elements(_steps) x loop
    i := i + 1; t := s->>'table';
    if s->>'op' = 'set_my_person' then
      rid := coalesce((refs->>(s->>'person_ref'))::uuid, nullif(s->>'person_id','')::uuid);
      select person_id into cur_person from public.workspace_members where workspace_id = _ws and user_id = auth.uid() for update;
      if not found then raise exception 'No sos miembro de este espacio'; end if;
      if cur_person is not null and cur_person is distinct from rid then raise exception 'Tu usuario ya está asociado a otra ficha'; end if;
      if public.person_ws(rid) is distinct from _ws then raise exception 'Ficha fuera del espacio'; end if;
      if exists (select 1 from public.people where id = rid and archived_at is not null) then raise exception 'La ficha está archivada'; end if;
      update public.workspace_members set person_id = rid where workspace_id = _ws and user_id = auth.uid();
      insert into public.brain_actions(workspace_id, thread_id, table_name, record_id, op, summary, before, after, operation_id, seq)
        values (_ws, _thread, 'workspace_members', rid, 'update', coalesce(s->>'summary','Asocié tu usuario a tu ficha'), jsonb_build_object('person_id', cur_person), jsonb_build_object('person_id', rid), op, i) returning id into aid;
      results := results || jsonb_build_object('ref', s->>'ref', 'id', rid, 'action_id', aid, 'table', 'workspace_members', 'op', 'update', 'summary', s->>'summary', 'link_type', s->>'link_type', 'link_id', s->>'link_id');
      continue;
    end if;
    if not (t = any(allowed)) then raise exception 'Tabla no permitida: %', t; end if;
    vals := coalesce(s->'values', '{}');
    for k, v in select * from jsonb_each(vals) loop
      if jsonb_typeof(v) = 'string' and left(v #>> '{}', 5) = '$ref:' then
        if refs->>substr(v #>> '{}', 6) is null then raise exception 'Referencia sin resolver: %', v #>> '{}'; end if;
        vals := vals || jsonb_build_object(k, refs->>substr(v #>> '{}', 6));
      end if;
    end loop;
    vals := vals - 'id' - 'created_at' - 'created_by' - 'updated_at' - 'updated_by';
    if s->>'op' = 'insert' then
      vals := vals || jsonb_build_object('workspace_id', _ws);
      select string_agg(format('%I', key), ',') into cols from jsonb_object_keys(vals) key;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)', t, cols, cols, t, t) using vals into row_after;
      rid := (row_after->>'id')::uuid; row_before := null;
    elsif s->>'op' = 'update' then
      rid := (s->>'id')::uuid; vals := vals - 'workspace_id';
      execute format('select to_jsonb(x.*) from public.%I x where id = $1 and workspace_id = $2 for update', t) using rid, _ws into row_before;
      if row_before is null then raise exception 'Registro no encontrado'; end if;
      select string_agg(format('%I', key), ',') into cols from jsonb_object_keys(vals) key;
      if cols is null then raise exception 'Sin campos para actualizar'; end if;
      execute format('update public.%I x set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where x.id = $2 returning to_jsonb(x.*)', t, cols, cols, t) using vals, rid into row_after;
    else raise exception 'Operación inválida'; end if;
    if s->>'ref' is not null then refs := refs || jsonb_build_object(s->>'ref', rid); end if;
    insert into public.brain_actions(workspace_id, thread_id, table_name, record_id, op, summary, before, after, operation_id, seq)
      values (_ws, _thread, t, rid, case when s->>'op' = 'insert' then 'create' else 'update' end, coalesce(s->>'summary', 'Cambio del Brain'), row_before, row_after, op, i) returning id into aid;
    results := results || jsonb_build_object('ref', s->>'ref', 'id', rid, 'action_id', aid, 'table', t, 'op', case when s->>'op' = 'insert' then 'create' else 'update' end, 'summary', s->>'summary', 'link_type', s->>'link_type', 'link_id', coalesce(refs->>(s->>'link_ref'), s->>'link_id'));
  end loop;
  prev := jsonb_build_object('ok', true, 'operation_id', op, 'results', results, 'refs', refs);
  if _op_key is not null then insert into public.brain_operations(workspace_id, op_key, result) values (_ws, _op_key, prev); end if;
  return prev;
end $$;
GRANT EXECUTE ON FUNCTION public.brain_apply(uuid, uuid, text, jsonb) TO authenticated;

-- Live references to a record outside an exclusion set (generic via foreign keys).
CREATE OR REPLACE FUNCTION public.live_references(_table text, _id uuid, _exclude uuid[])
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
declare r record; hit boolean; has_arch boolean;
begin
  for r in
    select cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = ('public.' || _table)::regclass
      and cl.relname not in ('brain_actions','brain_proposals','import_rows','research_runs','source_documents','opportunity_stage_events')
  loop
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name='archived_at') into has_arch;
    if r.tbl = 'workspace_members' then
      execute format('select exists (select 1 from public.workspace_members where %I = $1)', r.col) using _id into hit;
    elsif has_arch then
      execute format('select exists (select 1 from public.%I where %I = $1 and archived_at is null and not (id = any($2)))', r.tbl, r.col) using _id, _exclude into hit;
    else
      execute format('select exists (select 1 from public.%I where %I = $1 and not (id = any($2)))', r.tbl, r.col) using _id, _exclude into hit;
    end if;
    if hit then return r.tbl; end if;
  end loop;
  return null;
end $$;

CREATE OR REPLACE FUNCTION public.brain_undo_action(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  a record; first record; cur jsonb; k text; setv jsonb; conflicts text[]; cols text; reverted uuid[] := '{}';
  done jsonb := '[]'; kept jsonb := '[]'; dep text; cur_person uuid; has_arch boolean;
  skip text[] := array['id','workspace_id','created_at','created_by','updated_at','updated_by','normalized_name','normalized_value'];
begin
  select * into first from public.brain_actions where id = _id for update;
  if first is null or not public.is_workspace_member(first.workspace_id) then raise exception 'Acción no encontrada'; end if;
  if first.undone_at is not null then return jsonb_build_object('already', true, 'reverted', '[]'::jsonb, 'kept', '[]'::jsonb); end if;
  for a in select * from public.brain_actions
      where (id = _id or (first.operation_id is not null and operation_id = first.operation_id)) and undone_at is null
      order by seq desc, created_at desc for update loop
    if a.table_name = 'workspace_members' then
      select person_id into cur_person from public.workspace_members where workspace_id = a.workspace_id and user_id = a.created_by for update;
      if cur_person is distinct from (a.after->>'person_id')::uuid then
        kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'la asociación cambió después'); continue;
      end if;
      update public.workspace_members set person_id = nullif(a.before->>'person_id','')::uuid where workspace_id = a.workspace_id and user_id = a.created_by;
    else
      if a.table_name not in ('people','organizations','affiliations','tasks','projects','project_participants','project_organizations','needs','conversations','conversation_links','person_contacts','person_links','introductions') then
        kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'tipo no reversible'); continue;
      end if;
      execute format('select to_jsonb(x.*) from public.%I x where id = $1 and workspace_id = $2 for update', a.table_name) using a.record_id, a.workspace_id into cur;
      if cur is null then kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'el registro ya no existe'); continue; end if;
      if a.op = 'create' then
        if a.after is not null then
          select array_agg(key) into conflicts from jsonb_object_keys(a.after) key
            where not (key = any(skip)) and key <> 'archived_at' and cur->key is distinct from a.after->key;
        elsif (cur->>'updated_at')::timestamptz > a.created_at then conflicts := array['editado'];
        else conflicts := null; end if;
        if conflicts is not null then
          kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'se editó después (' || array_to_string(conflicts, ', ') || ')'); continue;
        end if;
        dep := public.live_references(a.table_name, a.record_id, reverted);
        if dep is not null then kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'se usa en ' || dep); continue; end if;
        select exists (select 1 from information_schema.columns where table_schema='public' and table_name=a.table_name and column_name='archived_at') into has_arch;
        if has_arch then
          execute format('update public.%I set archived_at = now() where id = $1', a.table_name) using a.record_id;
        else
          execute format('delete from public.%I where id = $1', a.table_name) using a.record_id;
        end if;
      else
        setv := '{}'; conflicts := '{}';
        for k in select key from jsonb_object_keys(coalesce(a.after, '{}')) key where not (key = any(skip)) and a.before ? key loop
          if a.after->k is not distinct from a.before->k then continue; end if;
          if cur->k is not distinct from a.after->k then setv := setv || jsonb_build_object(k, a.before->k);
          else conflicts := conflicts || k; end if;
        end loop;
        select string_agg(format('%I', key), ',') into cols from jsonb_object_keys(setv) key;
        if cols is not null then
          execute format('update public.%I x set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where x.id = $2', a.table_name, cols, cols, a.table_name) using setv, a.record_id;
        end if;
        if array_length(conflicts, 1) > 0 then
          kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'se conservó el valor cambiado después en: ' || array_to_string(conflicts, ', '));
          if cols is null then continue; end if;
        end if;
      end if;
    end if;
    reverted := reverted || a.record_id;
    update public.brain_actions set undone_at = now(), undone_by = auth.uid() where id = a.id;
    done := done || jsonb_build_object('summary', a.summary);
  end loop;
  return jsonb_build_object('already', false, 'reverted', done, 'kept', kept);
end $$;

-- Cross-workspace reference guard (INSERT and UPDATE), independent of the UI.
CREATE OR REPLACE FUNCTION public.check_ws_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare i int := 0; col text; tbl text; ref uuid; w uuid; j jsonb := to_jsonb(new);
begin
  while i < tg_nargs loop
    col := tg_argv[i]; tbl := tg_argv[i+1]; i := i + 2;
    ref := nullif(j->>col, '')::uuid;
    if ref is null then continue; end if;
    execute format('select workspace_id from public.%I where id = $1', tbl) using ref into w;
    if w is distinct from new.workspace_id then raise exception 'Referencia de otro espacio (%)', col; end if;
  end loop;
  return new;
end $$;

CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.affiliations FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('person_id','people','organization_id','organizations','import_batch_id','import_batches');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.person_contacts FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('person_id','people','import_batch_id','import_batches');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.person_links FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('from_person_id','people','to_person_id','people');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.conversation_links FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('conversation_id','conversations','person_id','people','organization_id','organizations','introduction_id','introductions','project_id','projects');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('person_id','people','waiting_on_person_id','people','organization_id','organizations','introduction_id','introductions','conversation_id','conversations','project_id','projects','opportunity_id','opportunities');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.needs FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('person_id','people','organization_id','organizations','conversation_id','conversations','source_document_id','source_documents');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.introductions FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('introducer_person_id','people','introduced_person_id','people','target_person_id','people','target_org_id','organizations');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.project_organizations FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('project_id','projects','organization_id','organizations');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.project_participants FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('project_id','projects','person_id','people','organization_id','organizations');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('project_id','projects');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.opportunity_stage_events FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('opportunity_id','opportunities');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.meeting_participants FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('meeting_id','meetings','person_id','people','import_batch_id','import_batches');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.commission_interest FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('person_id','people','conversation_id','conversations');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.source_documents FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('conversation_id','conversations','organization_id','organizations');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.research_runs FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('organization_id','organizations','source_document_id','source_documents','extraction_id','brain_extractions');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.brain_extractions FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('source_document_id','source_documents');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.brain_proposals FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('extraction_id','brain_extractions');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.brain_messages FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('thread_id','brain_threads');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.brain_actions FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('thread_id','brain_threads');
CREATE TRIGGER ws_refs BEFORE INSERT OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.check_ws_refs('person_id','people');

-- Import revert: compare real state (row edited after its own import transaction) and full dependencies.
CREATE OR REPLACE FUNCTION public.revert_import_batch(_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare b record; p record; o record; m record; x record; kept jsonb := '[]'; a_people int := 0; a_orgs int := 0; a_aff int := 0; a_meet int := 0; a_part int := 0; a_contacts int := 0; reason text; reverted jsonb := '[]';
begin
  select * into b from public.import_batches where id = _batch for update;
  if b is null or not public.is_workspace_member(b.workspace_id) then raise exception 'Lote no encontrado'; end if;
  if b.status <> 'applied' then raise exception 'El lote ya fue revertido'; end if;

  -- Child rows first: archive only those untouched since their import (updated_at equals created_at, same transaction).
  for x in select * from public.affiliations where import_batch_id = _batch and archived_at is null loop
    if x.updated_at > x.created_at then kept := kept || jsonb_build_object('type','afiliación','name',coalesce(x.title,'afiliación'),'reason','editada después de importar'); continue; end if;
    update public.affiliations set archived_at = now() where id = x.id; a_aff := a_aff + 1;
  end loop;
  for x in select * from public.meeting_participants where import_batch_id = _batch and archived_at is null loop
    if x.updated_at > x.created_at then kept := kept || jsonb_build_object('type','participante','name','participante de reunión','reason','editado después de importar'); continue; end if;
    update public.meeting_participants set archived_at = now() where id = x.id; a_part := a_part + 1;
  end loop;
  for x in select * from public.person_contacts where import_batch_id = _batch loop
    if x.updated_at > x.created_at then kept := kept || jsonb_build_object('type','contacto','name',x.value,'reason','editado después de importar'); continue; end if;
    if exists (select 1 from public.people pp where pp.id = x.person_id and (pp.import_batch_id is distinct from _batch)) then
      kept := kept || jsonb_build_object('type','contacto','name',x.value,'reason','pertenece a una persona que ya existía'); continue; end if;
    delete from public.person_contacts where id = x.id; a_contacts := a_contacts + 1;
  end loop;

  for p in select * from public.people where import_batch_id = _batch and archived_at is null loop
    reason := case
      when p.updated_at > p.created_at then 'editada después de importar'
      when exists (select 1 from public.person_links where (from_person_id = p.id or to_person_id = p.id) and archived_at is null) then 'tiene vínculos'
      when exists (select 1 from public.introductions where p.id in (introducer_person_id, introduced_person_id, target_person_id) and archived_at is null) then 'tiene introducciones'
      when exists (select 1 from public.conversation_links where person_id = p.id) then 'tiene conversaciones'
      when exists (select 1 from public.tasks where (person_id = p.id or waiting_on_person_id = p.id) and archived_at is null) then 'tiene tareas o esperamos su respuesta'
      when exists (select 1 from public.needs where person_id = p.id and archived_at is null) then 'tiene necesidades'
      when exists (select 1 from public.project_participants where person_id = p.id and archived_at is null) then 'participa en proyectos'
      when exists (select 1 from public.commission_interest where person_id = p.id) then 'tiene interés por comisión'
      when exists (select 1 from public.workspace_members where person_id = p.id) then 'es la ficha de un miembro'
      when exists (select 1 from public.affiliations where person_id = p.id and archived_at is null) then 'tiene afiliaciones conservadas'
      when exists (select 1 from public.meeting_participants where person_id = p.id and archived_at is null) then 'tiene reuniones conservadas'
      when exists (select 1 from public.person_contacts where person_id = p.id) then 'tiene contactos conservados'
      else null end;
    if reason is not null then kept := kept || jsonb_build_object('type','persona','name',p.full_name,'reason',reason); continue; end if;
    update public.people set archived_at = now() where id = p.id; a_people := a_people + 1;
    reverted := reverted || jsonb_build_object('type','persona','name',p.full_name);
  end loop;

  for m in select * from public.meetings where import_batch_id = _batch and archived_at is null loop
    if m.updated_at > m.created_at or exists (select 1 from public.meeting_participants where meeting_id = m.id and archived_at is null) then
      kept := kept || jsonb_build_object('type','reunión','name',m.title,'reason', case when m.updated_at > m.created_at then 'editada después de importar' else 'tiene participantes conservados' end); continue;
    end if;
    update public.meetings set archived_at = now() where id = m.id; a_meet := a_meet + 1;
  end loop;

  for o in select * from public.organizations where import_batch_id = _batch and archived_at is null loop
    reason := case
      when o.updated_at > o.created_at then 'editada después de importar'
      when exists (select 1 from public.affiliations where organization_id = o.id and archived_at is null) then 'tiene afiliaciones activas'
      when exists (select 1 from public.project_organizations where organization_id = o.id) then 'participa en proyectos'
      when exists (select 1 from public.project_participants where organization_id = o.id and archived_at is null) then 'participa en proyectos'
      when exists (select 1 from public.introductions where target_org_id = o.id and archived_at is null) then 'tiene introducciones'
      when exists (select 1 from public.conversation_links where organization_id = o.id) then 'tiene conversaciones'
      when exists (select 1 from public.tasks where organization_id = o.id and archived_at is null) then 'tiene tareas'
      when exists (select 1 from public.needs where organization_id = o.id and archived_at is null) then 'tiene necesidades'
      when exists (select 1 from public.source_documents where organization_id = o.id and archived_at is null) then 'tiene documentos'
      when exists (select 1 from public.research_runs where organization_id = o.id) then 'tiene investigaciones'
      else null end;
    if reason is not null then kept := kept || jsonb_build_object('type','organización','name',o.name,'reason',reason); continue; end if;
    update public.organizations set archived_at = now() where id = o.id; a_orgs := a_orgs + 1;
    reverted := reverted || jsonb_build_object('type','organización','name',o.name);
  end loop;

  update public.import_batches set status = 'reverted', reverted_at = now(), reverted_by = auth.uid(),
    revert_summary = jsonb_build_object('people', a_people, 'orgs', a_orgs, 'affiliations', a_aff, 'meetings', a_meet, 'participants', a_part, 'contacts', a_contacts, 'kept', kept, 'reverted', reverted)
    where id = _batch returning * into b;
  return b.revert_summary;
end $$;

-- Invitation redemption: membership and acceptance together, idempotent; called by the server with the verified user.
CREATE OR REPLACE FUNCTION public.redeem_invitation(_token_hash text, _user uuid, _email text, _display text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare inv record;
begin
  select * into inv from public.invitations where token_hash = _token_hash for update;
  if inv is null or inv.revoked_at is not null then raise exception 'La invitación no es válida o fue revocada.'; end if;
  if lower(inv.email) <> lower(_email) then raise exception 'Esta invitación es para otro email.'; end if;
  if inv.accepted_at is not null then
    if exists (select 1 from public.workspace_members where workspace_id = inv.workspace_id and user_id = _user) then
      return jsonb_build_object('already', true, 'email', inv.email);
    end if;
    raise exception 'La invitación ya fue utilizada.';
  end if;
  if inv.expires_at < now() then raise exception 'La invitación venció.'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, email, display_name)
    values (inv.workspace_id, _user, inv.role, inv.email, nullif(_display,''))
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  insert into public.workspace_members(workspace_id, user_id, role, email, display_name)
    select w.id, _user, 'collaborator', inv.email, nullif(_display,'') from public.workspaces w where w.is_demo and w.id <> inv.workspace_id
    on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  return jsonb_build_object('already', false, 'email', inv.email);
end $$;
REVOKE EXECUTE ON FUNCTION public.redeem_invitation(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(text, uuid, text, text) TO service_role;
