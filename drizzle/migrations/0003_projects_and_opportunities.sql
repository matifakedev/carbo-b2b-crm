create type public.participant_role as enum ('buyer','end_user','economic_decider','technical_evaluator','internal_champion','other');
create type public.opportunity_stage as enum ('discovery','validation','proposal','negotiation','won','lost');
create type public.opportunity_kind as enum ('commercial','institutional');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  need text, location text, project_stage text, evidence text, blockers text, next_milestone text,
  power_mw numeric check (power_mw is null or power_mw >= 0),
  energy_mwh numeric check (energy_mwh is null or energy_mwh >= 0),
  duration_h numeric check (duration_h is null or duration_h >= 0),
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.project_organizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notes text,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, organization_id)
);
create table public.project_participants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.participant_role not null,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  unidentified_description text,
  notes text,
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(person_id, organization_id, nullif(trim(unidentified_description), '')) = 1)
);
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  kind public.opportunity_kind not null default 'commercial',
  need text not null check (length(trim(need)) > 0),
  rationale text not null check (length(trim(rationale)) > 0),
  stage public.opportunity_stage not null default 'discovery',
  advance_criteria text,
  known_pending text,
  in_pipeline boolean,
  amount numeric check (amount is null or amount >= 0),
  currency text,
  owner_user_id uuid,
  source_type public.source_type not null default 'personal',
  source_detail text,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.opportunity_stage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage public.opportunity_stage,
  to_stage public.opportunity_stage not null,
  note text,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.project_ws(_id uuid) returns uuid language sql stable security definer set search_path = public as $$ select workspace_id from public.projects where id = _id $$;
create or replace function public.opp_ws(_id uuid) returns uuid language sql stable security definer set search_path = public as $$ select workspace_id from public.opportunities where id = _id $$;

do $$ declare t text; begin
  foreach t in array array['projects','project_organizations','project_participants','opportunities','opportunity_stage_events'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create trigger %1$s_audit before insert or update on public.%1$I for each row execute function public.set_audit_fields()', t);
  end loop;
end $$;
grant delete on public.project_organizations to authenticated;
create policy "members write projects" on public.projects for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "members update projects" on public.projects for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members write project orgs" on public.project_organizations for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.project_ws(project_id) = workspace_id and public.org_ws(organization_id) = workspace_id);
create policy "members update project orgs" on public.project_organizations for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members delete project orgs" on public.project_organizations for delete to authenticated using (public.is_workspace_member(workspace_id));
create policy "members write participants" on public.project_participants for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.project_ws(project_id) = workspace_id and (person_id is null or public.person_ws(person_id) = workspace_id) and (organization_id is null or public.org_ws(organization_id) = workspace_id));
create policy "members update participants" on public.project_participants for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and (person_id is null or public.person_ws(person_id) = workspace_id) and (organization_id is null or public.org_ws(organization_id) = workspace_id));
create policy "members write opportunities" on public.opportunities for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.project_ws(project_id) = workspace_id);
create policy "members update opportunities" on public.opportunities for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and public.project_ws(project_id) = workspace_id);
create policy "members write stage events" on public.opportunity_stage_events for insert to authenticated with check (public.is_workspace_member(workspace_id));

-- Pipeline default + stage history
create or replace function public.opportunity_defaults() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.in_pipeline is null then
    new.in_pipeline := not (new.kind = 'institutional' or new.source_type = 'hypothesis');
  end if;
  if new.in_pipeline is null then new.in_pipeline := false; end if;
  return new;
end $$;
create trigger opportunities_defaults before insert or update on public.opportunities for each row execute function public.opportunity_defaults();
create or replace function public.opportunity_stage_log() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    insert into public.opportunity_stage_events(workspace_id, opportunity_id, from_stage, to_stage)
      values (new.workspace_id, new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage);
  end if;
  return null;
end $$;
create trigger opportunities_stage_log after insert or update on public.opportunities for each row execute function public.opportunity_stage_log();

-- Tasks can point to a project or opportunity
alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.tasks add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
create or replace function public.task_refs_ok(t public.tasks) returns boolean language sql stable security definer set search_path = public as $$
  select (t.person_id is null or public.person_ws(t.person_id) = t.workspace_id)
    and (t.waiting_on_person_id is null or public.person_ws(t.waiting_on_person_id) = t.workspace_id)
    and (t.organization_id is null or public.org_ws(t.organization_id) = t.workspace_id)
    and (t.introduction_id is null or public.intro_ws(t.introduction_id) = t.workspace_id)
    and (t.conversation_id is null or public.conv_ws(t.conversation_id) = t.workspace_id)
    and (t.project_id is null or public.project_ws(t.project_id) = t.workspace_id)
    and (t.opportunity_id is null or public.opp_ws(t.opportunity_id) = t.workspace_id)
    and (t.owner_user_id is null or exists (select 1 from public.workspace_members m where m.workspace_id = t.workspace_id and m.user_id = t.owner_user_id))
$$;
create index tasks_project_idx on public.tasks(project_id);
create index tasks_opp_idx on public.tasks(opportunity_id);
create index participants_project_idx on public.project_participants(project_id);
create index participants_person_idx on public.project_participants(person_id);
create index project_orgs_org_idx on public.project_organizations(organization_id);
alter table public.conversation_links add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.conversation_links drop constraint if exists conversation_links_check;
alter table public.conversation_links add constraint conversation_links_one_target check (num_nonnulls(person_id, organization_id, introduction_id, project_id) = 1);

-- Brain proposal kinds
alter table public.brain_proposals drop constraint if exists brain_proposals_kind_check;
alter table public.brain_proposals add constraint brain_proposals_kind_check check (kind in ('person','affiliation','introduction','need','task','project','participant','project_update'));

create or replace function public.confirm_extraction(_extraction uuid, _decisions jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  ex record; src record; d jsonb; pr record; f jsonb; act text;
  refs jsonb := '{}'::jsonb; prefs jsonb := '{}'::jsonb; conv uuid; new_id uuid; org uuid; pid uuid; pid2 uuid; pid3 uuid; proj uuid;
  created int := 0; rejected int := 0; remaining int;
  detail text;
begin
  select * into ex from public.brain_extractions where id = _extraction for update;
  if ex is null or not public.is_workspace_member(ex.workspace_id) then raise exception 'not found'; end if;
  if ex.status = 'failed' then raise exception 'extraction failed'; end if;
  select * into src from public.source_documents where id = ex.source_document_id;
  detail := 'Brain · ' || src.title;

  select coalesce(jsonb_object_agg(proposed->>'ref', created_record_id), '{}'::jsonb) into refs
    from public.brain_proposals where extraction_id = _extraction and kind = 'person' and created_record_id is not null and proposed->>'ref' is not null;
  select coalesce(jsonb_object_agg(proposed->>'ref', created_record_id), '{}'::jsonb) into prefs
    from public.brain_proposals where extraction_id = _extraction and kind = 'project' and created_record_id is not null and proposed->>'ref' is not null;

  conv := src.conversation_id;
  if conv is null and exists (select 1 from jsonb_array_elements(_decisions) x where x->>'action' in ('accept','correct')) then
    insert into public.conversations(workspace_id, title, body) values (ex.workspace_id, src.title, src.original_text) returning id into conv;
    update public.source_documents set conversation_id = conv where id = src.id;
  end if;

  for d in select x from jsonb_array_elements(_decisions) x
      join public.brain_proposals p on p.id = (x->>'proposal_id')::uuid
      order by (case p.kind when 'person' then 0 when 'project' then 1 else 2 end), p.position loop
    select * into pr from public.brain_proposals where id = (d->>'proposal_id')::uuid and extraction_id = _extraction for update;
    if pr is null or pr.status <> 'pending' then continue; end if;
    act := d->>'action';
    if act = 'reject' then
      update public.brain_proposals set status='rejected', decided_by=auth.uid(), decided_at=now() where id = pr.id;
      rejected := rejected + 1; continue;
    elsif act not in ('accept','correct') then continue; end if;
    f := coalesce(d->'final', pr.proposed);
    new_id := null;
    proj := coalesce(nullif(f->>'project_id','')::uuid, (prefs->>(f->>'project_ref'))::uuid);
    if proj is not null and public.project_ws(proj) is distinct from ex.workspace_id then raise exception 'project outside workspace'; end if;

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

    elsif pr.kind = 'project' then
      if proj is not null and nullif(f->>'project_id','') is not null then
        new_id := proj;
      else
        insert into public.projects(workspace_id, name, need, location, power_mw, energy_mwh, duration_h, blockers, next_milestone, evidence, source_type, source_detail)
          values (ex.workspace_id, coalesce(nullif(f->>'name',''), nullif(f->>'title',''), 'Proyecto sin nombre'), nullif(f->>'description',''), nullif(f->>'location',''),
            nullif(f->>'power_mw','')::numeric, nullif(f->>'energy_mwh','')::numeric, nullif(f->>'duration_h','')::numeric,
            nullif(f->>'blockers',''), nullif(f->>'next_milestone',''), pr.evidence, 'personal', detail) returning id into new_id;
      end if;
      if pr.proposed->>'ref' is not null then prefs := prefs || jsonb_build_object(pr.proposed->>'ref', new_id); end if;
      insert into public.conversation_links(workspace_id, conversation_id, project_id)
        select ex.workspace_id, conv, new_id where not exists (select 1 from public.conversation_links where conversation_id = conv and project_id = new_id);
      update public.brain_proposals set created_record_type='project', created_record_id=new_id where id = pr.id;

    elsif pr.kind = 'participant' then
      if proj is null then raise exception 'Participante sin proyecto confirmado'; end if;
      pid := coalesce(nullif(f->>'person_id','')::uuid, (refs->>(f->>'person_ref'))::uuid);
      org := nullif(f->>'org_id','')::uuid;
      if pid is null and org is null and nullif(f->>'org_name','') is not null then
        select id into org from public.organizations where workspace_id = ex.workspace_id and normalized_name = public.normalize_text(f->>'org_name') and archived_at is null limit 1;
        if org is null then
          insert into public.organizations(workspace_id, name, source_type, source_detail) values (ex.workspace_id, f->>'org_name', 'personal', detail) returning id into org;
        end if;
      end if;
      insert into public.project_participants(workspace_id, project_id, role, person_id, organization_id, unidentified_description, notes, source_type, source_detail)
        values (ex.workspace_id, proj, coalesce(nullif(f->>'role',''), 'other')::public.participant_role,
          pid, case when pid is null then org end,
          case when pid is null and org is null then coalesce(nullif(f->>'target_description',''), nullif(f->>'description',''), 'Sin identificar') end,
          pr.evidence, 'personal', detail) returning id into new_id;
      update public.brain_proposals set created_record_type='participant', created_record_id=new_id where id = pr.id;

    elsif pr.kind = 'project_update' then
      if proj is null then raise exception 'Actualización sin proyecto elegido'; end if;
      -- Only descriptive fields; never stage, amount or probability.
      update public.projects set
        need = coalesce(nullif(f->>'description',''), need),
        location = coalesce(nullif(f->>'location',''), location),
        blockers = coalesce(nullif(f->>'blockers',''), blockers),
        next_milestone = coalesce(nullif(f->>'next_milestone',''), next_milestone),
        power_mw = coalesce(nullif(f->>'power_mw','')::numeric, power_mw),
        energy_mwh = coalesce(nullif(f->>'energy_mwh','')::numeric, energy_mwh),
        duration_h = coalesce(nullif(f->>'duration_h','')::numeric, duration_h)
        where id = proj;
      new_id := proj;
      update public.brain_proposals set created_record_type='project', created_record_id=new_id where id = pr.id;

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
      insert into public.tasks(workspace_id, title, context, person_id, conversation_id, project_id, confirmed)
        values (ex.workspace_id, f->>'title', pr.evidence, (refs->>(f->>'person_ref'))::uuid, conv, proj, coalesce(f->>'certainty','possible') = 'stated') returning id into new_id;
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

-- Demo scenario (Demostración workspace only, fictitious)
insert into public.projects(id, workspace_id, name, need, location, project_stage, evidence, blockers, next_milestone, power_mw, energy_mwh, duration_h, source_type, source_detail)
values ('d2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000de30','[DEMO] Respaldo planta Alfa',
  'Respaldo ante cortes y picos de demanda en la planta (ficticio).','Provincia ficticia','Factibilidad',
  'Carla lo mencionó en una reunión de demostración.','Falta identificar al evaluador técnico.','Visita técnica a la planta',
  2, null, null, 'personal','Escenario de demostración');
insert into public.project_organizations(workspace_id, project_id, organization_id) values
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000a2');
insert into public.project_participants(workspace_id, project_id, role, person_id, organization_id, unidentified_description, notes) values
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','buyer', null,'d0000000-0000-0000-0000-0000000000a2', null,'Compraría vía contrato (demo).'),
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','end_user', null,'d0000000-0000-0000-0000-0000000000a1', null,'Opera la planta (demo).'),
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','economic_decider','d1000000-0000-0000-0000-0000000000b4', null, null, null),
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','internal_champion','d1000000-0000-0000-0000-0000000000b2', null, null, null),
  ('00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001','technical_evaluator', null, null,'Jefe de mantenimiento de la planta (sin contacto identificado)', null);
insert into public.opportunities(id, workspace_id, project_id, title, need, rationale, stage, advance_criteria, known_pending, source_detail)
values ('d3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000de30','d2000000-0000-0000-0000-000000000001',
  '[DEMO] Sistema de respaldo planta Alfa','Respaldo ante cortes (ficticio).','Necesidad expresada por la interlocutora en reunión de demo.',
  'discovery','Pasar a validación cuando el evaluador técnico confirme datos de carga.','Identificar evaluador técnico; confirmar capacidad y duración.','Escenario de demostración');
insert into public.tasks(workspace_id, title, context, project_id, opportunity_id, person_id) values
  ('00000000-0000-0000-0000-00000000de30','[DEMO] Pedir a Carla el contacto del jefe de mantenimiento','Para identificar al evaluador técnico.','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-0000000000b2');