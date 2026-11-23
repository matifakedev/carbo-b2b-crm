CREATE OR REPLACE FUNCTION public.brain_undo_action(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare a record; cols text;
begin
  select * into a from public.brain_actions where id = _id for update;
  if a is null or not public.is_workspace_member(a.workspace_id) then raise exception 'Acción no encontrada'; end if;
  if a.undone_at is not null then return jsonb_build_object('already', true); end if;
  if a.table_name not in ('people','organizations','affiliations','tasks','projects','project_participants','needs','conversations','person_contacts','person_links') then raise exception 'Tabla no permitida'; end if;
  if a.op = 'create' then
    if a.table_name = 'person_contacts' then
      delete from public.person_contacts where id = a.record_id and workspace_id = a.workspace_id;
    else
      execute format('update public.%I set archived_at = now() where id = $1 and workspace_id = $2', a.table_name) using a.record_id, a.workspace_id;
    end if;
  else
    select string_agg(format('%I', k), ',') into cols from jsonb_object_keys(a.before) k
      where k not in ('id','workspace_id','created_at','created_by','updated_at','updated_by','normalized_name');
    if cols is not null then
      execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where t.id = $2 and t.workspace_id = $3', a.table_name, cols, cols, a.table_name)
        using a.before, a.record_id, a.workspace_id;
    end if;
  end if;
  update public.brain_actions set undone_at = now(), undone_by = auth.uid() where id = _id;
  return jsonb_build_object('already', false);
end $function$;