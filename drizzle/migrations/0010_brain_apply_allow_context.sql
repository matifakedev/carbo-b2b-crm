
DO $$
declare d text;
begin
  d := pg_get_functiondef('public.brain_apply(uuid,uuid,text,jsonb)'::regprocedure);
  execute replace(d, '''person_links'',''introductions''];', '''person_links'',''introductions'',''carbo_context''];');
  d := pg_get_functiondef('public.brain_undo_action(uuid)'::regprocedure);
  execute replace(d, '''person_links'',''introductions'') then', '''person_links'',''introductions'',''carbo_context'') then');
end $$;
