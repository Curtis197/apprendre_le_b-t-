-- Add server-side auth guard to increment_upvotes.
-- The function is SECURITY DEFINER so it bypasses RLS; without this check
-- any caller holding the anon key could vote without being logged in.
create or replace function increment_upvotes(
  table_name text,
  row_id     uuid,
  delta      int default 1
)
returns int language plpgsql security definer as $$
declare
  new_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

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
