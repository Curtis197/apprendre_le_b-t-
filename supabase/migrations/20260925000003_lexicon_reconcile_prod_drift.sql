-- Reconcile databases rebuilt from migrations with production's lexicon schema.
--
-- In production lexicon.pos is text[] with a GIN index. That change was made
-- outside the migration history, so a database rebuilt from migrations still has
-- pos as plain text. There the lexicon page's array filters (.contains / .not cs)
-- do not work, and the contribution form's `pos: [..]` is stored as the string
-- '["noun"]'.
--
-- Idempotent: a no-op wherever pos is already an array and the index exists.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lexicon'
      and column_name = 'pos'
      and data_type = 'text'
  ) then
    alter table lexicon
      alter column pos type text[]
      using case when pos is null or pos = '' then null else array[pos] end;
  end if;
end
$$;

create index if not exists lexicon_pos_gin_idx on lexicon using gin (pos);
