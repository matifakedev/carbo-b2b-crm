
CREATE OR REPLACE FUNCTION public.link_my_person(_ws uuid, _person uuid, _expected uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare cur uuid;
begin
  if not public.is_workspace_member(_ws) then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext(_ws::text || auth.uid()::text));
  select person_id into cur from public.workspace_members where workspace_id = _ws and user_id = auth.uid() for update;
  if cur is distinct from _expected then raise exception 'Tu usuario ya está asociado a otra ficha'; end if;
  if _person is not null then
    if public.person_ws(_person) is distinct from _ws then raise exception 'Ficha fuera del espacio'; end if;
    if exists (select 1 from public.people where id = _person and archived_at is not null) then raise exception 'La ficha está archivada'; end if;
  end if;
  update public.workspace_members set person_id = _person where workspace_id = _ws and user_id = auth.uid();
  return cur;
end $$;
GRANT EXECUTE ON FUNCTION public.link_my_person(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.brain_apply(_ws uuid, _thread uuid, _op_key text, _steps jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  prev jsonb; s jsonb; t text; vals jsonb; k text; v jsonb; cols text; refs jsonb := '{}'; row_before jsonb; row_after jsonb;
  rid uuid; aid uuid; op uuid := gen_random_uuid(); results jsonb := '[]'; i int := 0;
  allowed text[] := array['people','organizations','affiliations','tasks','projects','project_participants','project_organizations','needs','conversations','conversation_links','person_contacts','person_links','introductions'];
begin
  if not public.is_workspace_member(_ws) then raise exception 'Sin acceso a este espacio'; end if;
  if _op_key is not null then
    perform pg_advisory_xact_lock(hashtext(_ws::text || _op_key));
    select result into prev from public.brain_operations where workspace_id = _ws and op_key = _op_key;
    if prev is not null then return prev || jsonb_build_object('replayed', true); end if;
  end if;
  for s in select x from jsonb_array_elements(_steps) x loop
    i := i + 1; t := s->>'table';
    if s->>'op' = 'set_my_person' then
      rid := coalesce((refs->>(s->>'person_ref'))::uuid, nullif(s->>'person_id','')::uuid);
      perform public.link_my_person(_ws, rid, null);
      insert into public.brain_actions(workspace_id, thread_id, table_name, record_id, op, summary, before, after, operation_id, seq)
        values (_ws, _thread, 'workspace_members', rid, 'update', coalesce(s->>'summary','Asocié tu usuario a tu ficha'), jsonb_build_object('person_id', null), jsonb_build_object('person_id', rid), op, i) returning id into aid;
      results := results || jsonb_build_object('ref', s->>'ref', 'id', rid, 'action_id', aid, 'table', 'workspace_members', 'op', 'update', 'summary', s->>'summary', 'link_type', 'person', 'link_id', rid);
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
      if a.created_by is distinct from auth.uid() then kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'solo quien la hizo puede deshacer la asociación'); continue; end if;
      select person_id into cur_person from public.workspace_members where workspace_id = a.workspace_id and user_id = auth.uid();
      if cur_person is distinct from (a.after->>'person_id')::uuid then
        kept := kept || jsonb_build_object('summary', a.summary, 'reason', 'la asociación cambió después'); continue;
      end if;
      perform public.link_my_person(a.workspace_id, nullif(a.before->>'person_id','')::uuid, cur_person);
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
