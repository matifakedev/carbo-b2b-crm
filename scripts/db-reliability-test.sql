-- Integration checks for Brain writes, undo, workspace guards and invitations.
-- Runs inside a transaction that is always rolled back: no real data changes.
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/db-reliability-test.sql
begin;
\set ws '00000000-0000-0000-0000-00000000de30'
\set other '00000000-0000-0000-0000-0000000ca7b0'
select set_config('test.u1', (select user_id::text from workspace_members where workspace_id = :'ws' order by role limit 1), true);
select set_config('test.u2', (select user_id::text from workspace_members where workspace_id = :'ws' and user_id::text <> current_setting('test.u1') limit 1), true);
create temp table t_out(name text, ok boolean, detail text);


-- RLS is not exercised here (sandbox role cannot switch); auth.uid() comes from the claims below.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'), 'role', 'authenticated')::text, true);

do $$
declare ws uuid := '00000000-0000-0000-0000-00000000de30'; r1 jsonb; r2 jsonb; pid uuid; aid uuid; n int; u jsonb;
begin
  -- 1. Idempotency: same op key twice -> one record.
  r1 := brain_apply(ws, null, 'test-key-1', '[{"ref":"p","table":"people","op":"insert","values":{"full_name":"ZZ Prueba Idem","source_type":"personal"},"summary":"t"}]');
  r2 := brain_apply(ws, null, 'test-key-1', '[{"ref":"p","table":"people","op":"insert","values":{"full_name":"ZZ Prueba Idem","source_type":"personal"},"summary":"t"}]');
  select count(*) into n from people where full_name = 'ZZ Prueba Idem';
  insert into t_out values ('doble envío sin duplicados', n = 1 and (r2->>'replayed')::boolean, n::text);

  -- 2. Failure mid-operation -> nothing applied.
  begin
    perform brain_apply(ws, null, 'test-key-2', '[{"ref":"p","table":"people","op":"insert","values":{"full_name":"ZZ Prueba Fallo","source_type":"personal"},"summary":"t"},{"table":"person_contacts","op":"insert","values":{"person_id":"$ref:p","kind":"no_existe","value":"x"},"summary":"t"}]');
    insert into t_out values ('fallo parcial revierte todo', false, 'no falló');
  exception when others then
    select count(*) into n from people where full_name = 'ZZ Prueba Fallo';
    insert into t_out values ('fallo parcial revierte todo', n = 0, sqlerrm);
  end;

  -- 3. Cross-workspace reference rejected even when calling the backend directly.
  pid := (r1->'refs'->>'p')::uuid;
  begin
    insert into affiliations(workspace_id, person_id, organization_id, source_type) select ws, pid, o.id, 'personal' from organizations o where o.workspace_id <> ws limit 1;
    insert into t_out values ('referencia de otro espacio rechazada', not found, 'sin org en otro espacio visible');
  exception when others then insert into t_out values ('referencia de otro espacio rechazada', sqlerrm like '%otro espacio%', sqlerrm); end;
  begin
    perform brain_apply(ws, null, null, jsonb_build_array(jsonb_build_object('table','tasks','op','insert','summary','t','values', jsonb_build_object('title','x','person_id', gen_random_uuid()))));
    insert into t_out values ('referencia inexistente rechazada', false, 'aceptó');
  exception when others then insert into t_out values ('referencia inexistente rechazada', true, sqlerrm); end;

  -- 4. Undo create of a record used later is kept with a reason.
  r2 := brain_apply(ws, null, 'test-key-3', jsonb_build_array(jsonb_build_object('table','tasks','op','insert','summary','tarea','values', jsonb_build_object('title','ZZ tarea','waiting_on_person_id', pid))));
  aid := (r1->'results'->0->>'action_id')::uuid;
  u := brain_undo_action(aid);
  insert into t_out values ('deshacer conserva persona usada después', jsonb_array_length(u->'kept') = 1 and exists (select 1 from people where id = pid and archived_at is null), u::text);
end $$;

-- 5. Matías A->B, David B->C, undo Matías keeps C.
do $$
declare ws uuid := '00000000-0000-0000-0000-00000000de30'; pid uuid; r jsonb; u jsonb;
begin
  r := brain_apply(ws, null, 'test-key-5a', '[{"ref":"p","table":"people","op":"insert","values":{"full_name":"ZZ Persona ABC","location":"A","source_type":"personal"},"summary":"t"}]');
  pid := (r->'refs'->>'p')::uuid;
  r := brain_apply(ws, null, 'test-key-5b', jsonb_build_array(jsonb_build_object('table','people','op','update','id',pid,'values', jsonb_build_object('location','B'),'summary','A→B')));
  perform set_config('test.pid', pid::text, true);
  perform set_config('test.ab', r->'results'->0->>'action_id', true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u2'), 'role', 'authenticated')::text, true);
update people set location = 'C' where id = current_setting('test.pid')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'), 'role', 'authenticated')::text, true);
do $$
declare u jsonb; loc text;
begin
  u := brain_undo_action(current_setting('test.ab')::uuid);
  select location into loc from people where id = current_setting('test.pid')::uuid;
  insert into t_out values ('A→B, B→C, deshacer conserva C', loc = 'C' and jsonb_array_length(u->'kept') = 1, loc || ' ' || u::text);
end $$;

-- 6. Undo with no later edits restores the previous value.
do $$
declare ws uuid := '00000000-0000-0000-0000-00000000de30'; r jsonb; loc text;
begin
  r := brain_apply(ws, null, 'test-key-6', jsonb_build_array(jsonb_build_object('table','people','op','update','id',current_setting('test.pid')::uuid,'values', jsonb_build_object('location','D'),'summary','C→D')));
  perform brain_undo_action((r->'results'->0->>'action_id')::uuid);
  select location into loc from people where id = current_setting('test.pid')::uuid;
  insert into t_out values ('deshacer sin conflicto restaura', loc = 'C', loc);
end $$;


-- 7. Invitations: wrong email, expired, revoked, idempotent retry.
do $$
declare ws uuid := '00000000-0000-0000-0000-0000000ca7b0'; uid uuid := current_setting('test.u2')::uuid; r jsonb;
begin
  insert into invitations(workspace_id, email, role, token_hash, expires_at) values (ws, 'zz-invite@example.com', 'collaborator', 'zz-hash-ok', now() + interval '1 day'),
    (ws, 'zz-old@example.com', 'collaborator', 'zz-hash-old', now() - interval '1 day');
  insert into invitations(workspace_id, email, role, token_hash, expires_at, revoked_at) values (ws, 'zz-rev@example.com', 'collaborator', 'zz-hash-rev', now() + interval '1 day', now());
  begin perform redeem_invitation('zz-hash-ok', uid, 'otro@example.com', ''); insert into t_out values ('invitación con email distinto rechazada', false, ''); exception when others then insert into t_out values ('invitación con email distinto rechazada', true, sqlerrm); end;
  begin perform redeem_invitation('zz-hash-old', uid, 'zz-old@example.com', ''); insert into t_out values ('invitación vencida rechazada', false, ''); exception when others then insert into t_out values ('invitación vencida rechazada', true, sqlerrm); end;
  begin perform redeem_invitation('zz-hash-rev', uid, 'zz-rev@example.com', ''); insert into t_out values ('invitación revocada rechazada', false, ''); exception when others then insert into t_out values ('invitación revocada rechazada', true, sqlerrm); end;
  r := redeem_invitation('zz-hash-ok', uid, 'ZZ-invite@example.com', '');
  r := redeem_invitation('zz-hash-ok', uid, 'zz-invite@example.com', '');
  insert into t_out values ('invitación con cuenta existente e idempotente', (r->>'already')::boolean and exists (select 1 from workspace_members where workspace_id = ws and user_id = uid), r::text);
end $$;

select case when ok then 'PASS' else 'FAIL' end, name, left(coalesce(detail,''), 160) from t_out;
select count(*) filter (where not ok) as failures from t_out;
rollback;
