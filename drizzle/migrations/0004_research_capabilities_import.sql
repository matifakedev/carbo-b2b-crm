create table public.carbo_capabilities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  applications text, limits text, evidence text, references_text text,
  communicable text,
  is_commercial_sensitive boolean not null default false,
  status text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  approved_by uuid, approved_at timestamptz,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update on public.carbo_capabilities to authenticated;
grant all on public.carbo_capabilities to service_role;
alter table public.carbo_capabilities enable row level security;
create policy "members read caps" on public.carbo_capabilities for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert caps" on public.carbo_capabilities for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "members update caps" on public.carbo_capabilities for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create trigger caps_audit before insert or update on public.carbo_capabilities for each row execute function public.set_audit_fields();

create or replace function public.capability_review() returns trigger language plpgsql set search_path = public as $$
declare content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and not public.is_workspace_admin(new.workspace_id) then raise exception 'Solo un administrador puede aprobar capacidades'; end if;
    if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); else new.approved_by := null; new.approved_at := null; end if;
    return new;
  end if;
  content_changed := (new.title, new.applications, new.limits, new.evidence, new.references_text, new.communicable, new.is_commercial_sensitive)
    is distinct from (old.title, old.applications, old.limits, old.evidence, old.references_text, old.communicable, old.is_commercial_sensitive);
  if new.status = 'approved' and old.status <> 'approved' then
    if not public.is_workspace_admin(new.workspace_id) then raise exception 'Solo un administrador puede aprobar capacidades'; end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  elsif new.status = 'approved' and content_changed then
    if public.is_workspace_admin(new.workspace_id) then new.approved_by := auth.uid(); new.approved_at := now();
    else new.status := 'in_review'; new.approved_by := null; new.approved_at := null; end if;
  elsif new.status <> 'approved' then
    new.approved_by := null; new.approved_at := null;
  else
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  end if;
  return new;
end $$;
create trigger caps_review before insert or update on public.carbo_capabilities for each row execute function public.capability_review();

alter table public.source_documents drop constraint if exists source_documents_kind_check;
alter table public.source_documents add constraint source_documents_kind_check check (kind in ('email','notes','transcript','research'));
alter table public.source_documents add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  focus text,
  query text,
  status text not null default 'running' check (status in ('running','done','partial','not_configured','failed')),
  search_error text,
  source_document_id uuid references public.source_documents(id) on delete set null,
  extraction_id uuid references public.brain_extractions(id) on delete set null,
  fit jsonb,
  intro_draft text,
  model text,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.research_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  url text not null,
  source_title text,
  fetched_at timestamptz not null,
  published_at text,
  provided_by_user boolean not null default false,
  category text not null default 'other' check (category in ('member','project','need','association','other')),
  statement text not null,
  quote text,
  condition text not null check (condition in ('fact','hypothesis','insufficient')),
  note text,
  position int not null default 0,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index research_runs_org_idx on public.research_runs(organization_id);
create index research_findings_run_idx on public.research_findings(run_id);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_hash text not null,
  file_name text not null,
  status text not null default 'applied' check (status in ('applied','reverted')),
  summary jsonb,
  applied_at timestamptz, applied_by uuid,
  reverted_at timestamptz, reverted_by uuid, revert_summary jsonb,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, file_hash)
);
create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  decision text not null,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  meeting_date date,
  city text,
  notes text,
  source_type public.source_type not null default 'ivlp',
  source_detail text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role_note text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (meeting_id, person_id)
);
alter table public.people add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.organizations add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.affiliations add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.person_contacts add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.person_contacts add column if not exists source_detail text;

do $$ declare t text; begin
  foreach t in array array['research_runs','research_findings','import_batches','import_rows','meetings','meeting_participants'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "members insert %1$s" on public.%1$I for insert to authenticated with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "members update %1$s" on public.%1$I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
    execute format('create trigger %1$s_audit before insert or update on public.%1$I for each row execute function public.set_audit_fields()', t);
  end loop;
end $$;
create index meeting_participants_person_idx on public.meeting_participants(person_id);
create index import_rows_batch_idx on public.import_rows(batch_id);

create or replace function public.apply_import_batch(_ws uuid, _hash text, _file text, _rows jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  b record; r jsonb; d text; pid uuid; oid uuid; mid uuid; detail text; contact_detail text;
  rowmap jsonb := '{}'; orgmap jsonb := '{}'; meetmap jsonb := '{}';
  n_people int := 0; n_linked int := 0; n_skipped int := 0; n_orgs int := 0; n_orgs_existing int := 0; n_aff int := 0; n_meet int := 0; n_part int := 0; n_contacts int := 0;
  okey text; mkey text;
begin
  if not public.is_workspace_member(_ws) then raise exception 'Sin acceso a este espacio'; end if;
  insert into public.import_batches(workspace_id, file_hash, file_name, status) values (_ws, _hash, _file, 'reverted')
    on conflict (workspace_id, file_hash) do nothing;
  select * into b from public.import_batches where workspace_id = _ws and file_hash = _hash for update;
  if b.status = 'applied' and b.applied_at is not null then
    return jsonb_build_object('already_applied', true, 'batch_id', b.id, 'summary', b.summary);
  end if;
  detail := 'Agenda IVLP · ' || _file;
  contact_detail := 'Dato de contacto tomado del archivo ' || _file;

  for r in select x from jsonb_array_elements(_rows) x order by (x->>'row_number')::int loop
    d := r->>'decision';
    insert into public.import_rows(workspace_id, batch_id, row_number, raw, decision) values (_ws, b.id, (r->>'row_number')::int, coalesce(r->'raw','{}'), d);
    if d = 'skip' then n_skipped := n_skipped + 1; continue; end if;
    if nullif(trim(r->>'full_name'),'') is null then raise exception 'Fila % sin nombre', r->>'row_number'; end if;

    oid := null;
    if nullif(trim(r->>'org_name'),'') is not null then
      okey := public.normalize_text(r->>'org_name');
      oid := nullif(r->>'org_id','')::uuid;
      if oid is not null then
        if not exists (select 1 from public.organizations where id = oid and workspace_id = _ws) then raise exception 'Organización fuera del espacio'; end if;
      else oid := (orgmap->>okey)::uuid; end if;
      if oid is null then
        select id into oid from public.organizations where workspace_id = _ws and normalized_name = okey and archived_at is null limit 1;
        if oid is not null then n_orgs_existing := n_orgs_existing + 1;
        else
          insert into public.organizations(workspace_id, name, source_type, source_detail, import_batch_id) values (_ws, trim(r->>'org_name'), 'ivlp', detail, b.id) returning id into oid;
          n_orgs := n_orgs + 1;
        end if;
      end if;
      orgmap := orgmap || jsonb_build_object(okey, oid);
    end if;

    if d like 'existing:%' then
      pid := substr(d, 10)::uuid;
      if not exists (select 1 from public.people where id = pid and workspace_id = _ws) then raise exception 'Persona fuera del espacio'; end if;
      n_linked := n_linked + 1;
    elsif d like 'row:%' then
      pid := (rowmap->>substr(d, 5))::uuid;
      if pid is null then raise exception 'Fila % apunta a una fila sin persona', r->>'row_number'; end if;
      n_linked := n_linked + 1;
    elsif d = 'new' then
      insert into public.people(workspace_id, full_name, location, source_type, source_detail, import_batch_id)
        values (_ws, trim(r->>'full_name'), nullif(trim(r->>'city'),''), 'ivlp', detail, b.id) returning id into pid;
      n_people := n_people + 1;
    else raise exception 'Decisión inválida en fila %', r->>'row_number'; end if;
    rowmap := rowmap || jsonb_build_object(r->>'row_number', pid);

    if nullif(trim(r->>'email'),'') is not null and not exists (select 1 from public.person_contacts where person_id = pid and normalized_value = lower(trim(r->>'email'))) then
      insert into public.person_contacts(workspace_id, person_id, kind, value, label, source_detail, import_batch_id) values (_ws, pid, 'email', trim(r->>'email'), 'IVLP', contact_detail, b.id);
      n_contacts := n_contacts + 1;
    end if;
    if nullif(trim(r->>'phone'),'') is not null and not exists (select 1 from public.person_contacts where person_id = pid and normalized_value = regexp_replace(r->>'phone', '[^0-9+]', '', 'g')) then
      insert into public.person_contacts(workspace_id, person_id, kind, value, label, source_detail, import_batch_id) values (_ws, pid, 'phone', trim(r->>'phone'), 'IVLP', contact_detail, b.id);
      n_contacts := n_contacts + 1;
    end if;

    if oid is not null and not exists (select 1 from public.affiliations where person_id = pid and organization_id = oid and archived_at is null) then
      insert into public.affiliations(workspace_id, person_id, organization_id, title, source_type, source_detail, import_batch_id)
        values (_ws, pid, oid, nullif(trim(r->>'title'),''), 'ivlp', detail, b.id);
      n_aff := n_aff + 1;
    end if;

    if nullif(trim(r->>'meeting'),'') is not null or nullif(r->>'date','') is not null then
      mkey := public.normalize_text(coalesce(r->>'meeting','')) || '|' || coalesce(r->>'date','') || '|' || public.normalize_text(coalesce(r->>'city',''));
      mid := (meetmap->>mkey)::uuid;
      if mid is null then
        insert into public.meetings(workspace_id, title, meeting_date, city, source_detail, import_batch_id)
          values (_ws, coalesce(nullif(trim(r->>'meeting'),''), 'Reunión IVLP'), nullif(r->>'date','')::date, nullif(trim(r->>'city'),''), detail, b.id) returning id into mid;
        meetmap := meetmap || jsonb_build_object(mkey, mid); n_meet := n_meet + 1;
      end if;
      insert into public.meeting_participants(workspace_id, meeting_id, person_id, role_note, import_batch_id)
        values (_ws, mid, pid, nullif(trim(r->>'notes'),''), b.id) on conflict (meeting_id, person_id) do nothing;
      if found then n_part := n_part + 1; end if;
    end if;
    update public.import_rows set person_id = pid, organization_id = oid where batch_id = b.id and row_number = (r->>'row_number')::int;
  end loop;

  update public.import_batches set status = 'applied', applied_at = now(), applied_by = auth.uid(), reverted_at = null, reverted_by = null, revert_summary = null,
    summary = jsonb_build_object('people_new', n_people, 'people_linked', n_linked, 'skipped', n_skipped, 'orgs_new', n_orgs, 'orgs_existing', n_orgs_existing,
      'affiliations', n_aff, 'meetings', n_meet, 'participants', n_part, 'contacts', n_contacts)
    where id = b.id returning * into b;
  return jsonb_build_object('already_applied', false, 'batch_id', b.id, 'summary', b.summary);
end $$;
grant execute on function public.apply_import_batch(uuid, text, text, jsonb) to authenticated;

create or replace function public.revert_import_batch(_batch uuid)
returns jsonb language plpgsql set search_path = public as $$
declare b record; p record; o record; m record; kept jsonb := '[]'; a_people int := 0; a_orgs int := 0; a_aff int := 0; a_meet int := 0; a_part int := 0; a_contacts int := 0; reason text; since timestamptz;
begin
  select * into b from public.import_batches where id = _batch for update;
  if b is null or not public.is_workspace_member(b.workspace_id) then raise exception 'Lote no encontrado'; end if;
  if b.status <> 'applied' then raise exception 'El lote ya fue revertido'; end if;
  since := b.applied_at + interval '5 seconds';

  for p in select * from public.people where import_batch_id = _batch and archived_at is null loop
    reason := case
      when p.updated_at > since then 'editada después de importar'
      when exists (select 1 from public.person_links where (from_person_id = p.id or to_person_id = p.id)) then 'tiene vínculos'
      when exists (select 1 from public.introductions where p.id in (introducer_person_id, introduced_person_id, target_person_id)) then 'tiene introducciones'
      when exists (select 1 from public.conversation_links where person_id = p.id) then 'tiene conversaciones'
      when exists (select 1 from public.tasks where person_id = p.id) then 'tiene tareas'
      when exists (select 1 from public.needs where person_id = p.id) then 'tiene necesidades'
      when exists (select 1 from public.project_participants where person_id = p.id) then 'participa en proyectos'
      when exists (select 1 from public.affiliations where person_id = p.id and import_batch_id is distinct from _batch) then 'tiene afiliaciones agregadas después'
      when exists (select 1 from public.meeting_participants where person_id = p.id and import_batch_id is distinct from _batch) then 'tiene otras reuniones'
      when exists (select 1 from public.person_contacts where person_id = p.id and import_batch_id is distinct from _batch) then 'tiene contactos agregados después'
      else null end;
    if reason is not null then kept := kept || jsonb_build_object('type','persona','name',p.full_name,'reason',reason); continue; end if;
    update public.people set archived_at = now() where id = p.id; a_people := a_people + 1;
  end loop;

  update public.affiliations a set archived_at = now() where a.import_batch_id = _batch and a.archived_at is null and a.updated_at <= since
    and not exists (select 1 from public.people x where x.id = a.person_id and x.archived_at is null and x.import_batch_id = _batch);
  get diagnostics a_aff = row_count;
  update public.meeting_participants mp set archived_at = now() where mp.import_batch_id = _batch and mp.archived_at is null and mp.updated_at <= since
    and not exists (select 1 from public.people x where x.id = mp.person_id and x.archived_at is null and x.import_batch_id = _batch);
  get diagnostics a_part = row_count;
  delete from public.person_contacts pc where pc.import_batch_id = _batch and pc.updated_at <= since
    and exists (select 1 from public.people x where x.id = pc.person_id and x.archived_at is not null);
  get diagnostics a_contacts = row_count;

  for m in select * from public.meetings where import_batch_id = _batch and archived_at is null loop
    if m.updated_at > since or exists (select 1 from public.meeting_participants where meeting_id = m.id and archived_at is null) then
      kept := kept || jsonb_build_object('type','reunión','name',m.title,'reason', case when m.updated_at > since then 'editada después de importar' else 'tiene participantes conservados' end); continue;
    end if;
    update public.meetings set archived_at = now() where id = m.id; a_meet := a_meet + 1;
  end loop;

  for o in select * from public.organizations where import_batch_id = _batch and archived_at is null loop
    reason := case
      when o.updated_at > since then 'editada después de importar'
      when exists (select 1 from public.affiliations where organization_id = o.id and archived_at is null) then 'tiene afiliaciones activas'
      when exists (select 1 from public.project_organizations where organization_id = o.id) then 'participa en proyectos'
      when exists (select 1 from public.project_participants where organization_id = o.id) then 'participa en proyectos'
      when exists (select 1 from public.introductions where target_org_id = o.id) then 'tiene introducciones'
      when exists (select 1 from public.conversation_links where organization_id = o.id) then 'tiene conversaciones'
      when exists (select 1 from public.tasks where organization_id = o.id) then 'tiene tareas'
      when exists (select 1 from public.research_runs where organization_id = o.id) then 'tiene investigaciones'
      else null end;
    if reason is not null then kept := kept || jsonb_build_object('type','organización','name',o.name,'reason',reason); continue; end if;
    update public.organizations set archived_at = now() where id = o.id; a_orgs := a_orgs + 1;
  end loop;

  update public.import_batches set status = 'reverted', reverted_at = now(), reverted_by = auth.uid(),
    revert_summary = jsonb_build_object('people', a_people, 'orgs', a_orgs, 'affiliations', a_aff, 'meetings', a_meet, 'participants', a_part, 'contacts', a_contacts, 'kept', kept)
    where id = _batch returning * into b;
  return b.revert_summary;
end $$;
grant execute on function public.revert_import_batch(uuid) to authenticated;

do $$ declare def text; begin
  def := pg_get_functiondef('public.confirm_extraction(uuid,jsonb)'::regprocedure);
  def := replace(def, 'detail text;', 'detail text; stype public.source_type;');
  def := replace(def, 'detail := ''Brain · '' || src.title;', 'detail := ''Brain · '' || src.title; stype := case when src.kind = ''research'' then ''public_research''::public.source_type else ''personal''::public.source_type end;');
  def := replace(def, 'if conv is null and exists', 'if conv is null and src.kind <> ''research'' and exists');
  def := replace(def, 'select ex.workspace_id, conv, new_id where not exists', 'select ex.workspace_id, conv, new_id where conv is not null and not exists');
  def := replace(def, 'insert into public.conversation_links(workspace_id, conversation_id, introduction_id) values (ex.workspace_id, conv, new_id);', 'if conv is not null then insert into public.conversation_links(workspace_id, conversation_id, introduction_id) values (ex.workspace_id, conv, new_id); end if;');
  def := replace(def, '''personal'', detail', 'stype, detail');
  def := replace(def, 'insert into public.needs(workspace_id, description, person_id, conversation_id,', 'insert into public.needs(workspace_id, description, person_id, organization_id, conversation_id,');
  def := replace(def, 'values (ex.workspace_id, f->>''description'', (refs->>(f->>''person_ref''))::uuid, conv,', 'values (ex.workspace_id, f->>''description'', (refs->>(f->>''person_ref''))::uuid, src.organization_id, conv,');
  if position('stype, detail' in def) = 0 or position('src.organization_id, conv' in def) = 0 or position('src.kind <> ''research''' in def) = 0 then raise exception 'confirm_extraction patch did not apply'; end if;
  execute def;
end $$;