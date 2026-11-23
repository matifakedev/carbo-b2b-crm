alter table public.tasks add column if not exists confirmed boolean not null default true;

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  kind text not null default 'notes' check (kind in ('email','notes','transcript')),
  title text not null check (length(trim(title)) > 0),
  original_text text not null check (length(trim(original_text)) > 0),
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brain_extractions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','partial','confirmed','failed')),
  model text,
  error text,
  confirmed_by uuid, confirmed_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brain_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  extraction_id uuid not null references public.brain_extractions(id) on delete cascade,
  kind text not null check (kind in ('person','affiliation','introduction','need','task')),
  proposed jsonb not null,
  evidence text,
  ambiguity text,
  status text not null default 'pending' check (status in ('pending','accepted','corrected','rejected')),
  final jsonb,
  decided_by uuid, decided_at timestamptz,
  created_record_type text, created_record_id uuid,
  position int not null default 0,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.needs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  source_document_id uuid references public.source_documents(id) on delete set null,
  evidence text,
  confirmed boolean not null default true,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brain_queries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  focus_type text not null,
  focus_id uuid not null,
  question text not null,
  answer jsonb,
  cited jsonb not null default '[]',
  model text,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['source_documents','brain_extractions','brain_proposals','needs','brain_queries'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "members insert %1$s" on public.%1$I for insert to authenticated with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "members update %1$s" on public.%1$I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
    execute format('create trigger %1$s_audit before insert or update on public.%1$I for each row execute function public.set_audit_fields()', t);
  end loop;
end $$;
create index brain_proposals_extraction_idx on public.brain_proposals(extraction_id);
create index needs_person_idx on public.needs(person_id);
create index needs_org_idx on public.needs(organization_id);

-- Confirms reviewed proposals atomically. Idempotent: proposals already decided are skipped,
-- and the extraction row is locked so concurrent calls serialize.
create or replace function public.confirm_extraction(_extraction uuid, _decisions jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  ex record; src record; d jsonb; pr record; f jsonb; act text;
  refs jsonb := '{}'::jsonb; conv uuid; new_id uuid; org uuid; pid uuid; pid2 uuid; pid3 uuid;
  created int := 0; rejected int := 0; remaining int;
  detail text;
begin
  select * into ex from public.brain_extractions where id = _extraction for update;
  if ex is null or not public.is_workspace_member(ex.workspace_id) then raise exception 'not found'; end if;
  if ex.status = 'failed' then raise exception 'extraction failed'; end if;
  select * into src from public.source_documents where id = ex.source_document_id;
  detail := 'Brain · ' || src.title;

  -- refs of persons decided earlier
  select coalesce(jsonb_object_agg(proposed->>'ref', created_record_id), '{}'::jsonb) into refs
    from public.brain_proposals where extraction_id = _extraction and kind = 'person' and created_record_id is not null and proposed->>'ref' is not null;

  conv := src.conversation_id;
  if conv is null and exists (select 1 from jsonb_array_elements(_decisions) x where x->>'action' in ('accept','correct')) then
    insert into public.conversations(workspace_id, title, body) values (ex.workspace_id, src.title, src.original_text) returning id into conv;
    update public.source_documents set conversation_id = conv where id = src.id;
  end if;

  -- persons first, then the rest (so refs resolve)
  for d in select x from jsonb_array_elements(_decisions) x
      join public.brain_proposals p on p.id = (x->>'proposal_id')::uuid
      order by (p.kind <> 'person'), p.position loop
    select * into pr from public.brain_proposals where id = (d->>'proposal_id')::uuid and extraction_id = _extraction for update;
    if pr is null or pr.status <> 'pending' then continue; end if;
    act := d->>'action';
    if act = 'reject' then
      update public.brain_proposals set status='rejected', decided_by=auth.uid(), decided_at=now() where id = pr.id;
      rejected := rejected + 1; continue;
    elsif act not in ('accept','correct') then continue; end if;
    f := coalesce(d->'final', pr.proposed);
    new_id := null;

    if pr.kind = 'person' then
      if nullif(f->>'person_id','') is not null then
        new_id := (f->>'person_id')::uuid;
        if not exists (select 1 from public.people where id = new_id and workspace_id = ex.workspace_id) then raise exception 'person outside workspace'; end if;
      else
        insert into public.people(workspace_id, full_name, relationship_context, source_type, source_detail)
          values (ex.workspace_id, f->>'full_name', nullif(f->>'description',''), 'personal', detail) returning id into new_id;
      end if;
      if pr.proposed->>'ref' is not null then refs := refs || jsonb_build_object(pr.proposed->>'ref', new_id); end if;
      insert into public.conversation_links(workspace_id, conversation_id, person_id)
        select ex.workspace_id, conv, new_id where not exists (select 1 from public.conversation_links where conversation_id = conv and person_id = new_id);
      update public.brain_proposals set created_record_type='person', created_record_id=new_id where id = pr.id;

    elsif pr.kind = 'affiliation' then
      pid := (refs->>(f->>'person_ref'))::uuid;
      if pid is null then raise exception 'Afiliación sin persona confirmada: %', coalesce(f->>'org_name',''); end if;
      org := nullif(f->>'org_id','')::uuid;
      if org is null then
        select id into org from public.organizations where workspace_id = ex.workspace_id and normalized_name = public.normalize_text(f->>'org_name') and archived_at is null limit 1;
        if org is null then
          insert into public.organizations(workspace_id, name, source_type, source_detail) values (ex.workspace_id, f->>'org_name', 'personal', detail) returning id into org;
        end if;
      elsif not exists (select 1 from public.organizations where id = org and workspace_id = ex.workspace_id) then raise exception 'org outside workspace';
      end if;
      insert into public.affiliations(workspace_id, person_id, organization_id, title, source_type, source_detail)
        values (ex.workspace_id, pid, org, nullif(f->>'title',''), 'personal', detail) returning id into new_id;
      update public.brain_proposals set created_record_type='affiliation', created_record_id=new_id where id = pr.id;

    elsif pr.kind = 'introduction' then
      pid := (refs->>(f->>'introducer_ref'))::uuid;
      pid2 := (refs->>(f->>'introduced_ref'))::uuid;
      pid3 := (refs->>(f->>'target_ref'))::uuid;
      insert into public.introductions(workspace_id, introducer_person_id, introduced_person_id, target_person_id, target_description, purpose, context, kind, status, source_type, source_detail)
        values (ex.workspace_id, pid, pid2, pid3,
          case when pid3 is null then coalesce(nullif(f->>'target_description',''), 'Destino sin identificar') end,
          nullif(f->>'purpose',''), pr.evidence,
          coalesce(nullif(f->>'intro_kind',''), 'hypothetical')::public.intro_kind,
          (case when f->>'intro_kind' = 'done' then 'done' else 'requested' end)::public.intro_status,
          'personal', detail) returning id into new_id;
      insert into public.conversation_links(workspace_id, conversation_id, introduction_id) values (ex.workspace_id, conv, new_id);
      update public.brain_proposals set created_record_type='introduction', created_record_id=new_id where id = pr.id;

    elsif pr.kind = 'task' then
      insert into public.tasks(workspace_id, title, context, person_id, conversation_id, confirmed)
        values (ex.workspace_id, f->>'title', pr.evidence, (refs->>(f->>'person_ref'))::uuid, conv, coalesce(f->>'certainty','possible') = 'stated') returning id into new_id;
      update public.brain_proposals set created_record_type='task', created_record_id=new_id where id = pr.id;

    elsif pr.kind = 'need' then
      insert into public.needs(workspace_id, description, person_id, conversation_id, source_document_id, evidence, confirmed)
        values (ex.workspace_id, f->>'description', (refs->>(f->>'person_ref'))::uuid, conv, src.id, pr.evidence, coalesce(f->>'certainty','possible') = 'stated') returning id into new_id;
      update public.brain_proposals set created_record_type='need', created_record_id=new_id where id = pr.id;
    end if;

    update public.brain_proposals set status = case when act='correct' then 'corrected' else 'accepted' end,
      final = f, decided_by = auth.uid(), decided_at = now() where id = pr.id;
    created := created + 1;
  end loop;

  select count(*) into remaining from public.brain_proposals where extraction_id = _extraction and status = 'pending';
  update public.brain_extractions set status = case when remaining = 0 then 'confirmed' else 'partial' end,
    confirmed_by = auth.uid(), confirmed_at = now() where id = _extraction;
  return jsonb_build_object('created', created, 'rejected', rejected, 'pending', remaining, 'conversation_id', conv);
end $$;
grant execute on function public.confirm_extraction(uuid, jsonb) to authenticated;