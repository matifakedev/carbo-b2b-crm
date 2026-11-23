
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create type public.workspace_role as enum ('admin','collaborator');
create type public.source_type as enum ('personal','ivlp','public_research','hypothesis');
create type public.verification_status as enum ('unverified','verified','doubtful');
create type public.contact_kind as enum ('email','phone','linkedin','other');

create or replace function public.normalize_text(t text)
returns text language sql immutable set search_path = public, extensions as $$
  select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t,''))), '\s+', ' ', 'g')
$$;

-- Workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'collaborator',
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
grant select on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = _ws and user_id = auth.uid())
$$;
create or replace function public.is_workspace_admin(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = _ws and user_id = auth.uid() and role = 'admin')
$$;

create policy "members read workspace" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members read members" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));

-- Bootstrap admin emails (no client access)
create table public.admin_bootstrap (email text primary key);
grant all on public.admin_bootstrap to service_role;
alter table public.admin_bootstrap enable row level security;

-- Invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'collaborator',
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;
create policy "admins read invitations" on public.invitations for select to authenticated using (public.is_workspace_admin(workspace_id));
create policy "admins create invitations" on public.invitations for insert to authenticated with check (public.is_workspace_admin(workspace_id));
create policy "admins update invitations" on public.invitations for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- Audit trigger
create or replace function public.set_audit_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.workspace_id := old.workspace_id;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

-- People
create table public.people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  normalized_name text generated always as (public.normalize_text(full_name)) stored,
  location text,
  relationship_context text,
  notes text,
  person_roles text[] not null default '{}',
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_ws_idx on public.people(workspace_id);
create index people_name_trgm on public.people using gin (normalized_name extensions.gin_trgm_ops);
grant select, insert, update on public.people to authenticated;
grant all on public.people to service_role;
alter table public.people enable row level security;
create policy "members read people" on public.people for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert people" on public.people for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "members update people" on public.people for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create trigger people_audit before insert or update on public.people for each row execute function public.set_audit_fields();

create table public.person_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  kind public.contact_kind not null,
  value text not null check (length(trim(value)) > 0),
  normalized_value text generated always as (case when kind = 'phone' then regexp_replace(value, '[^0-9+]', '', 'g') else lower(trim(value)) end) stored,
  label text,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index person_contacts_person_idx on public.person_contacts(person_id);
create index person_contacts_norm_idx on public.person_contacts(workspace_id, normalized_value);
grant select, insert, update, delete on public.person_contacts to authenticated;
grant all on public.person_contacts to service_role;
alter table public.person_contacts enable row level security;
create policy "members read contacts" on public.person_contacts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert contacts" on public.person_contacts for insert to authenticated with check (public.is_workspace_member(workspace_id) and exists (select 1 from public.people p where p.id = person_id and p.workspace_id = person_contacts.workspace_id));
create policy "members update contacts" on public.person_contacts for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members delete contacts" on public.person_contacts for delete to authenticated using (public.is_workspace_member(workspace_id));
create trigger person_contacts_audit before insert or update on public.person_contacts for each row execute function public.set_audit_fields();

-- Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  normalized_name text generated always as (public.normalize_text(name)) stored,
  location text,
  website text,
  description text,
  org_roles text[] not null default '{}',
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orgs_ws_idx on public.organizations(workspace_id);
create index orgs_name_trgm on public.organizations using gin (normalized_name extensions.gin_trgm_ops);
grant select, insert, update on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;
create policy "members read orgs" on public.organizations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert orgs" on public.organizations for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "members update orgs" on public.organizations for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create trigger orgs_audit before insert or update on public.organizations for each row execute function public.set_audit_fields();

-- Affiliations (N:N)
create table public.affiliations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text,
  start_date date,
  end_date date,
  tenure_known boolean not null default false,
  is_current boolean,
  source_type public.source_type not null default 'personal',
  source_detail text,
  verification_status public.verification_status not null default 'unverified',
  notes text,
  archived_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index aff_person_idx on public.affiliations(person_id);
create index aff_org_idx on public.affiliations(organization_id);
grant select, insert, update on public.affiliations to authenticated;
grant all on public.affiliations to service_role;
alter table public.affiliations enable row level security;
create policy "members read aff" on public.affiliations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members insert aff" on public.affiliations for insert to authenticated with check (
  public.is_workspace_member(workspace_id)
  and exists (select 1 from public.people p where p.id = person_id and p.workspace_id = affiliations.workspace_id)
  and exists (select 1 from public.organizations o where o.id = organization_id and o.workspace_id = affiliations.workspace_id));
create policy "members update aff" on public.affiliations for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create trigger aff_audit before insert or update on public.affiliations for each row execute function public.set_audit_fields();

-- Duplicate detection (security invoker: RLS applies)
create or replace function public.find_person_duplicates(_ws uuid, _name text, _contacts text[] default '{}', _exclude uuid default null)
returns table (id uuid, full_name text, archived boolean, reason text, score real)
language sql stable set search_path = public, extensions as $$
  with n as (select public.normalize_text(_name) as v),
  c as (select distinct case when x ~ '^[0-9+ ()\-.]+$' then regexp_replace(x, '[^0-9+]', '', 'g') else lower(trim(x)) end as v from unnest(_contacts) x where length(trim(x)) > 0)
  select p.id, p.full_name, p.archived_at is not null,
    case when exists (select 1 from public.person_contacts pc join c on pc.normalized_value = c.v where pc.person_id = p.id) then 'contacto coincidente' else 'nombre similar' end,
    extensions.similarity(p.normalized_name, n.v)
  from public.people p, n
  where p.workspace_id = _ws and (_exclude is null or p.id <> _exclude)
    and (extensions.similarity(p.normalized_name, n.v) > 0.4
      or exists (select 1 from public.person_contacts pc join c on pc.normalized_value = c.v where pc.person_id = p.id))
  order by 5 desc limit 8
$$;
grant execute on function public.find_person_duplicates(uuid, text, text[], uuid) to authenticated;

create or replace function public.find_org_duplicates(_ws uuid, _name text, _exclude uuid default null)
returns table (id uuid, name text, archived boolean, reason text, score real)
language sql stable set search_path = public, extensions as $$
  select o.id, o.name, o.archived_at is not null, 'nombre similar', extensions.similarity(o.normalized_name, public.normalize_text(_name))
  from public.organizations o
  where o.workspace_id = _ws and (_exclude is null or o.id <> _exclude)
    and extensions.similarity(o.normalized_name, public.normalize_text(_name)) > 0.4
  order by 5 desc limit 8
$$;
grant execute on function public.find_org_duplicates(uuid, text, uuid) to authenticated;

-- Fixed workspaces
insert into public.workspaces (id, name, is_demo) values
  ('00000000-0000-0000-0000-0000000ca7b0', 'Carbo', false),
  ('00000000-0000-0000-0000-00000000de30', 'Demostración', true);

-- Bootstrap: when an admin email signs up via Add user, make them admin of every workspace
create or replace function public.handle_bootstrap_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admin_bootstrap where lower(email) = lower(new.email)) then
    insert into public.workspace_members (workspace_id, user_id, role, email)
    select w.id, new.id, 'admin', new.email from public.workspaces w
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_bootstrap_admin after insert on auth.users for each row execute function public.handle_bootstrap_admin();

-- Demo data (fictional, labeled)
insert into public.organizations (id, workspace_id, name, location, description, org_roles, source_type, source_detail, verification_status) values
 ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000de30','[DEMO] Minera Ficticia del Sur','Ejemplo — Ficticia','Organización ficticia para demostrar funcionamiento.','{potential_buyer}','hypothesis','Ejemplo de demostración','unverified'),
 ('d0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000de30','[DEMO] Instituto de Ejemplo','Ejemplo — Ficticia','Institución ficticia.','{institution,validator}','hypothesis','Ejemplo de demostración','unverified');
insert into public.people (id, workspace_id, full_name, location, relationship_context, person_roles, source_type, source_detail) values
 ('d1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000de30','[DEMO] Ana Ejemplo','Ejemplo — Ficticia','Persona ficticia de demostración.','{connector}','hypothesis','Ejemplo de demostración'),
 ('d1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000de30','[DEMO] Bruno Prueba','Ejemplo — Ficticia','Persona ficticia sin email.','{technical_referent}','hypothesis','Ejemplo de demostración');
insert into public.affiliations (workspace_id, person_id, organization_id, title, tenure_known, is_current, source_type, source_detail) values
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Cargo ficticio A',false,true,'hypothesis','Ejemplo de demostración'),
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','Cargo ficticio B',false,null,'hypothesis','Ejemplo de demostración');
insert into public.person_contacts (workspace_id, person_id, kind, value) values
 ('00000000-0000-0000-0000-00000000de30','d1000000-0000-0000-0000-000000000001','email','ana@ejemplo.invalid');
