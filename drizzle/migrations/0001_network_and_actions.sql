
alter table public.workspace_members add column person_id uuid references public.people(id) on delete set null;

create type public.link_kind as enum ('knows','colleague','internal_referral','external_referral','other');
create type public.intro_kind as enum ('request','done','hypothetical');
create type public.intro_status as enum ('requested','in_progress','done','declined','no_response');
create type public.task_status as enum ('open','waiting','done','cancelled');
create type public.commission_status as enum ('not_discussed','interested','talking','agreed','discarded');

create or replace function public.person_ws(_id uuid) returns uuid language sql stable security definer set search_path = public as $$ select workspace_id from public.people where id = _id $$;
create or replace function public.org_ws(_id uuid) returns uuid language sql stable security definer set search_path = public as $$ select workspace_id from public.organizations where id = _id $$;

-- Link my user to my own person record
create or replace function public.set_my_person(_ws uuid, _person uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_member(_ws) then raise exception 'forbidden'; end if;
  if _person is not null and public.person_ws(_person) is distinct from _ws then raise exception 'person not in workspace'; end if;
  update public.workspace_members set person_id = _person where workspace_id = _ws and user_id = auth.uid();
end $$;
grant execute on function public.set_my_person(uuid, uuid) to authenticated;

-- Person links
create table public.person_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_person_id uuid not null references public.people(id) on delete cascade,
  to_person_id uuid not null references public.people(id) on delete cascade,
  kind public.link_kind not null default 'knows',
  context text,
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);
create index person_links_from on public.person_links(from_person_id);
create index person_links_to on public.person_links(to_person_id);
grant select, insert, update on public.person_links to authenticated;
grant all on public.person_links to service_role;
alter table public.person_links enable row level security;
create policy "members read links" on public.person_links for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert links" on public.person_links for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.person_ws(from_person_id) = workspace_id and public.person_ws(to_person_id) = workspace_id);
create policy "members update links" on public.person_links for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and public.person_ws(from_person_id) = workspace_id and public.person_ws(to_person_id) = workspace_id);
create trigger person_links_audit before insert or update on public.person_links for each row execute function public.set_audit_fields();

-- Introductions
create table public.introductions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  introducer_person_id uuid references public.people(id) on delete set null,
  introduced_person_id uuid references public.people(id) on delete set null,
  target_person_id uuid references public.people(id) on delete set null,
  target_org_id uuid references public.organizations(id) on delete set null,
  target_description text,
  purpose text,
  context text,
  kind public.intro_kind not null default 'request',
  status public.intro_status not null default 'requested',
  owner_user_id uuid,
  next_action text,
  follow_up_at date,
  requested_at date,
  occurred_at date,
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index intro_ws on public.introductions(workspace_id);
grant select, insert, update on public.introductions to authenticated;
grant all on public.introductions to service_role;
alter table public.introductions enable row level security;
create or replace function public.intro_refs_ok(i public.introductions) returns boolean language sql stable security definer set search_path = public as $$
  select (i.introducer_person_id is null or public.person_ws(i.introducer_person_id) = i.workspace_id)
     and (i.introduced_person_id is null or public.person_ws(i.introduced_person_id) = i.workspace_id)
     and (i.target_person_id is null or public.person_ws(i.target_person_id) = i.workspace_id)
     and (i.target_org_id is null or public.org_ws(i.target_org_id) = i.workspace_id)
     and (i.owner_user_id is null or exists (select 1 from public.workspace_members m where m.workspace_id = i.workspace_id and m.user_id = i.owner_user_id))
$$;
create policy "members read intros" on public.introductions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert intros" on public.introductions for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.intro_refs_ok(introductions));
create policy "members update intros" on public.introductions for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and public.intro_refs_ok(introductions));
create trigger intro_audit before insert or update on public.introductions for each row execute function public.set_audit_fields();
create or replace function public.intro_ws(_id uuid) returns uuid language sql stable security definer set search_path = public as $$ select workspace_id from public.introductions where id = _id $$;

-- Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  occurred_at date not null default current_date,
  title text not null check (length(trim(title)) > 0),
  body text,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "members read conv" on public.conversations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert conv" on public.conversations for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "members update conv" on public.conversations for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create trigger conv_audit before insert or update on public.conversations for each row execute function public.set_audit_fields();
create or replace function public.conv_ws(_id uuid) returns uuid language sql stable security definer set search_path = public as $$ select workspace_id from public.conversations where id = _id $$;

create table public.conversation_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  introduction_id uuid references public.introductions(id) on delete cascade,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(person_id, organization_id, introduction_id) = 1)
);
create index conv_links_conv on public.conversation_links(conversation_id);
create index conv_links_person on public.conversation_links(person_id);
create unique index conv_links_uniq on public.conversation_links(conversation_id, coalesce(person_id, organization_id, introduction_id));
grant select, insert, update, delete on public.conversation_links to authenticated;
grant all on public.conversation_links to service_role;
alter table public.conversation_links enable row level security;
create policy "members read clinks" on public.conversation_links for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert clinks" on public.conversation_links for insert to authenticated with check (
  public.is_workspace_member(workspace_id) and public.conv_ws(conversation_id) = workspace_id
  and (person_id is null or public.person_ws(person_id) = workspace_id)
  and (organization_id is null or public.org_ws(organization_id) = workspace_id)
  and (introduction_id is null or public.intro_ws(introduction_id) = workspace_id));
create policy "members delete clinks" on public.conversation_links for delete to authenticated using (public.is_workspace_member(workspace_id));
create trigger clinks_audit before insert or update on public.conversation_links for each row execute function public.set_audit_fields();

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  context text,
  owner_user_id uuid,
  status public.task_status not null default 'open',
  due_date date,
  waiting_on_person_id uuid references public.people(id) on delete set null,
  waiting_since date,
  review_at date,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  introduction_id uuid references public.introductions(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  completed_by uuid,
  completed_at timestamptz,
  completion_note text,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tasks_ws on public.tasks(workspace_id, status);
grant select, insert, update on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create or replace function public.task_refs_ok(t public.tasks) returns boolean language sql stable security definer set search_path = public as $$
  select (t.person_id is null or public.person_ws(t.person_id) = t.workspace_id)
    and (t.waiting_on_person_id is null or public.person_ws(t.waiting_on_person_id) = t.workspace_id)
    and (t.organization_id is null or public.org_ws(t.organization_id) = t.workspace_id)
    and (t.introduction_id is null or public.intro_ws(t.introduction_id) = t.workspace_id)
    and (t.conversation_id is null or public.conv_ws(t.conversation_id) = t.workspace_id)
    and (t.owner_user_id is null or exists (select 1 from public.workspace_members m where m.workspace_id = t.workspace_id and m.user_id = t.owner_user_id))
$$;
create policy "members read tasks" on public.tasks for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert tasks" on public.tasks for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.task_refs_ok(tasks));
create policy "members update tasks" on public.tasks for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and public.task_refs_ok(tasks));
create or replace function public.task_completion() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now(); new.completed_by := auth.uid();
  elsif new.status <> 'done' then
    new.completed_at := null; new.completed_by := null;
  end if;
  return new;
end $$;
create trigger tasks_audit before insert or update on public.tasks for each row execute function public.set_audit_fields();
create trigger tasks_completion before insert or update on public.tasks for each row execute function public.task_completion();

-- Commission interest
create table public.commission_interest (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  wants_refer boolean not null default false,
  wants_sell boolean not null default false,
  status public.commission_status not null default 'not_discussed',
  conditions text,
  notes text,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (person_id)
);
grant select, insert, update on public.commission_interest to authenticated;
grant all on public.commission_interest to service_role;
alter table public.commission_interest enable row level security;
create policy "members read ci" on public.commission_interest for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert ci" on public.commission_interest for insert to authenticated with check (public.is_workspace_member(workspace_id) and public.person_ws(person_id) = workspace_id and (conversation_id is null or public.conv_ws(conversation_id) = workspace_id));
create policy "members update ci" on public.commission_interest for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and public.person_ws(person_id) = workspace_id and (conversation_id is null or public.conv_ws(conversation_id) = workspace_id));
create trigger ci_audit before insert or update on public.commission_interest for each row execute function public.set_audit_fields();

-- Demo scenario (fictional, Demostración workspace only)
insert into public.organizations (id, workspace_id, name, location, description, org_roles, source_type, source_detail) values
 ('d0000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000de30','[DEMO] Empresa Alfa','Ficticia','Empresa ficticia 1','{potential_buyer}','hypothesis','Escenario demo'),
 ('d0000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000de30','[DEMO] Empresa Beta','Ficticia','Empresa ficticia 2','{potential_buyer}','hypothesis','Escenario demo'),
 ('d0000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-00000000de30','[DEMO] Empresa Gamma','Ficticia','Empresa ficticia 3','{partner}','hypothesis','Escenario demo');
insert into public.people (id, workspace_id, full_name, relationship_context, person_roles, source_type, source_detail) values
 ('d1000000-0000-0000-0000-0000000000b0','00000000-0000-0000-0000-00000000de30','[DEMO] Matías (equipo)','Representa al miembro del equipo en el escenario demo.','{}','ivlp','Escenario demo'),
 ('d1000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000de30','[DEMO] Laura Referente','Referente institucional conocida vía IVLP (ficticia).','{connector}','ivlp','Escenario demo'),
 ('d1000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-00000000de30','[DEMO] Carla Interlocutora','Interlocutora en Empresa Alfa (ficticia).','{}','hypothesis','Escenario demo'),
 ('d1000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-00000000de30','[DEMO] Esteban Contacto','Contacto en Empresa Beta (ficticio).','{connector}','hypothesis','Escenario demo'),
 ('d1000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-00000000de30','[DEMO] Diego Ingeniero','Ingeniero de Empresa Alfa (ficticio).','{technical_referent}','hypothesis','Escenario demo');
insert into public.affiliations (workspace_id, person_id, organization_id, title, is_current, source_type, source_detail) values
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-000000000002','Cargo ficticio',true,'hypothesis','Escenario demo'),
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b2','d0000000-0000-0000-0000-0000000000a1','Cargo ficticio',true,'hypothesis','Escenario demo'),
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b3','d0000000-0000-0000-0000-0000000000a2','Cargo ficticio',true,'hypothesis','Escenario demo'),
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b4','d0000000-0000-0000-0000-0000000000a1','Ingeniería (ficticio)',true,'hypothesis','Escenario demo');
insert into public.person_links (workspace_id, from_person_id, to_person_id, kind, context, source_type, source_detail) values
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b0','d1000000-0000-0000-0000-0000000000b1','knows','Se conocieron en el programa IVLP (ficticio).','ivlp','Escenario demo'),
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b2','d1000000-0000-0000-0000-0000000000b4','internal_referral','Carla deriva a ingeniería.','hypothesis','Escenario demo'),
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b3','d1000000-0000-0000-0000-0000000000b4','external_referral','Esteban conoce a Diego de otro proyecto.','hypothesis','Escenario demo');
insert into public.introductions (id, workspace_id, introducer_person_id, introduced_person_id, target_person_id, target_org_id, target_description, purpose, kind, status, next_action, follow_up_at, occurred_at, source_type, source_detail) values
 ('d2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b1','d1000000-0000-0000-0000-0000000000b0','d1000000-0000-0000-0000-0000000000b2','d0000000-0000-0000-0000-0000000000a1',null,'Explorar almacenamiento para planta (ficticio)','done','done','Enviar resumen técnico',current_date + 3,current_date - 10,'hypothesis','Escenario demo'),
 ('d2000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b1','d1000000-0000-0000-0000-0000000000b0','d1000000-0000-0000-0000-0000000000b3','d0000000-0000-0000-0000-0000000000a2',null,'Presentación comercial (ficticio)','done','done',null,null,current_date - 8,'hypothesis','Escenario demo'),
 ('d2000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b1','d1000000-0000-0000-0000-0000000000b0',null,'d0000000-0000-0000-0000-0000000000a3','Responsable de compras, todavía no identificado','Llegar a compras (ficticio)','request','requested','Pedir nombre a Laura',current_date - 1,null,'hypothesis','Escenario demo'),
 ('d2000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b2','d1000000-0000-0000-0000-0000000000b0','d1000000-0000-0000-0000-0000000000b4',null,null,'Validación técnica (ficticio)','done','done',null,null,current_date - 5,'hypothesis','Escenario demo'),
 ('d2000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b3','d1000000-0000-0000-0000-0000000000b0','d1000000-0000-0000-0000-0000000000b4',null,null,'Segunda vía hacia ingeniería (ficticio)','hypothetical','requested','Confirmar si Esteban puede presentar',current_date + 7,null,'hypothesis','Escenario demo');
insert into public.conversations (id, workspace_id, occurred_at, title, body) values
 ('d3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000de30',current_date - 5,'[DEMO] Llamada técnica con Diego y Carla','Conversación ficticia sobre requisitos de ingeniería.');
insert into public.conversation_links (workspace_id, conversation_id, person_id, organization_id, introduction_id) values
 ('00000000-0000-0000-0000-00000000de30','d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-0000000000b4',null,null),
 ('00000000-0000-0000-0000-00000000de30','d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-0000000000b2',null,null),
 ('00000000-0000-0000-0000-00000000de30','d3000000-0000-0000-0000-000000000001',null,'d0000000-0000-0000-0000-0000000000a1',null),
 ('00000000-0000-0000-0000-00000000de30','d3000000-0000-0000-0000-000000000001',null,null,'d2000000-0000-0000-0000-000000000004');
insert into public.tasks (workspace_id, title, context, status, due_date, person_id, waiting_on_person_id, waiting_since, review_at, introduction_id) values
 ('00000000-0000-0000-0000-00000000de30','[DEMO] Enviar ficha técnica a Diego','Tras la llamada técnica','open',current_date + 2,'d1000000-0000-0000-0000-0000000000b4',null,null,null,null),
 ('00000000-0000-0000-0000-00000000de30','[DEMO] Esperar respuesta de Esteban','Si puede presentar a Diego','waiting',null,'d1000000-0000-0000-0000-0000000000b3','d1000000-0000-0000-0000-0000000000b3',current_date - 3,current_date + 4,'d2000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-00000000de30','[DEMO] Pedir a Laura el contacto de compras de Gamma',null,'open',current_date - 1,'d1000000-0000-0000-0000-0000000000b1',null,null,null,'d2000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-00000000de30','[DEMO] Ordenar notas IVLP',null,'open',null,null,null,null,null,null);
insert into public.commission_interest (workspace_id, person_id, wants_refer, status, notes) values
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-0000000000b3',true,'interested','Mostró interés en referir (ficticio). Sin condiciones acordadas.');
