create table public.brain_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null default auth.uid(),
  title text not null default 'Nuevo chat',
  focus_type text, focus_id uuid,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brain_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.brain_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  parts jsonb not null default '{}',
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brain_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid references public.brain_threads(id) on delete set null,
  table_name text not null,
  record_id uuid not null,
  op text not null check (op in ('create','update')),
  before jsonb, after jsonb,
  summary text not null,
  undone_at timestamptz, undone_by uuid,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index brain_messages_thread_idx on public.brain_messages(thread_id, created_at);
create index brain_threads_owner_idx on public.brain_threads(owner_user_id, updated_at desc);
create index brain_actions_ws_idx on public.brain_actions(workspace_id, created_at desc);

grant select, insert, update on public.brain_threads to authenticated;
grant select, insert, update on public.brain_messages to authenticated;
grant select, insert, update on public.brain_actions to authenticated;
grant all on public.brain_threads to service_role;
grant all on public.brain_messages to service_role;
grant all on public.brain_actions to service_role;
alter table public.brain_threads enable row level security;
alter table public.brain_messages enable row level security;
alter table public.brain_actions enable row level security;

create policy "owner reads threads" on public.brain_threads for select to authenticated using (owner_user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy "owner creates threads" on public.brain_threads for insert to authenticated with check (owner_user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy "owner updates threads" on public.brain_threads for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid() and public.is_workspace_member(workspace_id));

create or replace function public.owns_brain_thread(_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brain_threads where id = _id and owner_user_id = auth.uid() and public.is_workspace_member(workspace_id))
$$;
grant execute on function public.owns_brain_thread(uuid) to authenticated;
create policy "owner reads messages" on public.brain_messages for select to authenticated using (public.owns_brain_thread(thread_id));
create policy "owner writes messages" on public.brain_messages for insert to authenticated with check (public.owns_brain_thread(thread_id) and public.is_workspace_member(workspace_id));
create policy "owner updates messages" on public.brain_messages for update to authenticated using (public.owns_brain_thread(thread_id)) with check (public.owns_brain_thread(thread_id));

create policy "members read actions" on public.brain_actions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members log actions" on public.brain_actions for insert to authenticated with check (public.is_workspace_member(workspace_id) and (thread_id is null or public.owns_brain_thread(thread_id)));
create policy "members update actions" on public.brain_actions for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create trigger brain_threads_audit before insert or update on public.brain_threads for each row execute function public.set_audit_fields();
create trigger brain_messages_audit before insert or update on public.brain_messages for each row execute function public.set_audit_fields();
create trigger brain_actions_audit before insert or update on public.brain_actions for each row execute function public.set_audit_fields();

-- Undo: archive what was created, restore previous values of what was updated. Runs as the caller (RLS applies).
create or replace function public.brain_undo_action(_id uuid) returns jsonb language plpgsql set search_path = public as $$
declare a record; cols text;
begin
  select * into a from public.brain_actions where id = _id for update;
  if a is null or not public.is_workspace_member(a.workspace_id) then raise exception 'Acción no encontrada'; end if;
  if a.undone_at is not null then return jsonb_build_object('already', true); end if;
  if a.table_name not in ('people','organizations','affiliations','tasks','projects','project_participants','needs','conversations','person_contacts') then raise exception 'Tabla no permitida'; end if;
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
end $$;
grant execute on function public.brain_undo_action(uuid) to authenticated;