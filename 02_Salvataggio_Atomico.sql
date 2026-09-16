-- Eseguire UNA VOLTA nel SQL Editor dopo lo script delle tabelle.
-- Non cancella né importa dati. Il frontend usa questa RPC per i salvataggi.
begin;
create or replace function public.k4b_apply_changes(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  change jsonb;
  target_table text;
  record_id text;
  expected bigint;
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Login richiesto' using errcode = '42501';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array' then
    raise exception 'Elenco modifiche non valido';
  end if;
  if jsonb_array_length(changes) > 2000 then
    raise exception 'Massimo 2000 modifiche per richiesta';
  end if;
  -- Same lock ordering across clients avoids multi-record deadlocks.
  for change in
    select value from jsonb_array_elements(changes)
    order by value->>'collection', value->>'id'
  loop
    if change->>'collection' not in ('projects','opportunities')
      or change->>'collection' is null then
      raise exception 'Archivio non valido';
    end if;
    target_table := 'k4b_' || (change->>'collection');
    record_id := change->>'id';
    if record_id is null or record_id !~ '^[A-Za-z0-9_-]{1,120}$' then
      raise exception 'ID non valido';
    end if;
    if not (change ? 'data') or not (change ? 'expected_version') then
      raise exception 'Campi obbligatori mancanti';
    end if;
    expected := (change->>'expected_version')::bigint;
    if change->'data' <> 'null'::jsonb then
      if jsonb_typeof(change->'data') <> 'object'
        or (change->'data'->>'id') is distinct from record_id
        or coalesce(trim(change->'data'->>'name'), '') = '' then
        raise exception 'Dati record non validi';
      end if;
      if expected is null then
        execute format('insert into public.%I (id, data) values ($1, $2)', target_table)
          using record_id, change->'data';
      else
        execute format('update public.%I set data = $1 where id = $2 and version = $3', target_table)
          using change->'data', record_id, expected;
        get diagnostics affected = row_count;
        if affected <> 1 then
          raise exception 'Record modificato da altro utente: %', record_id using errcode = '40001';
        end if;
      end if;
    else
      if expected is null then raise exception 'Versione richiesta per eliminare'; end if;
      execute format('delete from public.%I where id = $1 and version = $2', target_table)
        using record_id, expected;
      get diagnostics affected = row_count;
      if affected <> 1 then
        raise exception 'Record modificato da altro utente: %', record_id using errcode = '40001';
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.k4b_apply_changes(jsonb) from public, anon;
grant execute on function public.k4b_apply_changes(jsonb) to authenticated;
commit;
