-- ── Auto-validation trigger ────────────────────────────────────────────────
-- Sets validated = true automatically when upvotes reaches 3.
create or replace function auto_validate_on_upvotes()
returns trigger language plpgsql as $$
begin
  if new.upvotes >= 3 and not new.validated then
    new.validated := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_validate_grammar_rules on grammar_rules;
create trigger trg_auto_validate_grammar_rules
  before update on grammar_rules
  for each row execute function auto_validate_on_upvotes();

drop trigger if exists trg_auto_validate_expressions on expressions;
create trigger trg_auto_validate_expressions
  before update on expressions
  for each row execute function auto_validate_on_upvotes();

drop trigger if exists trg_auto_validate_community_texts on community_texts;
create trigger trg_auto_validate_community_texts
  before update on community_texts
  for each row execute function auto_validate_on_upvotes();

-- ── Updated increment_upvotes RPC ─────────────────────────────────────────
-- Replaces the previous version:
--   • covers all six voteable tables
--   • accepts a delta (default +1, pass -1 for downvote)
--   • floors upvotes at 0 to prevent negative counts
--   • returns the new upvotes value so the client doesn't need a refetch
create or replace function increment_upvotes(
  table_name text,
  row_id     uuid,
  delta      int default 1
)
returns int language plpgsql security definer as $$
declare
  new_count int;
begin
  case table_name
    when 'grammar_rules' then
      update grammar_rules
        set upvotes = greatest(0, upvotes + delta)
        where id = row_id
        returning upvotes into new_count;
    when 'expressions' then
      update expressions
        set upvotes = greatest(0, upvotes + delta)
        where id = row_id
        returning upvotes into new_count;
    when 'lexicon' then
      update lexicon
        set upvotes = greatest(0, upvotes + delta)
        where id = row_id
        returning upvotes into new_count;
    when 'forum_threads' then
      update forum_threads
        set upvotes = greatest(0, upvotes + delta)
        where id = row_id
        returning upvotes into new_count;
    when 'forum_posts' then
      update forum_posts
        set upvotes = greatest(0, upvotes + delta)
        where id = row_id
        returning upvotes into new_count;
    when 'community_texts' then
      update community_texts
        set upvotes = greatest(0, upvotes + delta)
        where id = row_id
        returning upvotes into new_count;
    else
      raise exception 'Unknown table: %', table_name;
  end case;
  return new_count;
end;
$$;
