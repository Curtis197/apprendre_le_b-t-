-- Remove the greatest(0, ...) floor from the vote() RPC.
-- The upvotes column now stores a net score (upvotes - downvotes).
-- A score can go negative. The floor was causing inflation when flipping
-- direction after the score was already at 0.
create or replace function vote(
  p_table_name text,
  p_row_id     uuid,
  p_direction  text
)
returns jsonb language plpgsql security definer as $$
declare
  v_old_direction text;
  v_delta         int;
  v_new_count     int;
  v_out_direction text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception 'Invalid direction: %', p_direction;
  end if;

  select direction into v_old_direction
  from user_votes
  where user_id = auth.uid()
    and table_name = p_table_name
    and row_id = p_row_id;

  if v_old_direction is null then
    insert into user_votes (user_id, table_name, row_id, direction)
    values (auth.uid(), p_table_name, p_row_id, p_direction);
    v_delta         := case p_direction when 'up' then 1 else -1 end;
    v_out_direction := p_direction;

  elsif v_old_direction = p_direction then
    delete from user_votes
    where user_id = auth.uid()
      and table_name = p_table_name
      and row_id = p_row_id;
    v_delta         := case p_direction when 'up' then -1 else 1 end;
    v_out_direction := null;

  else
    update user_votes
      set direction = p_direction
    where user_id = auth.uid()
      and table_name = p_table_name
      and row_id = p_row_id;
    v_delta         := case p_direction when 'up' then 2 else -2 end;
    v_out_direction := p_direction;
  end if;

  case p_table_name
    when 'grammar_rules' then
      update grammar_rules set upvotes = upvotes + v_delta
        where id = p_row_id returning upvotes into v_new_count;
    when 'expressions' then
      update expressions set upvotes = upvotes + v_delta
        where id = p_row_id returning upvotes into v_new_count;
    when 'lexicon' then
      update lexicon set upvotes = upvotes + v_delta
        where id = p_row_id returning upvotes into v_new_count;
    when 'forum_threads' then
      update forum_threads set upvotes = upvotes + v_delta
        where id = p_row_id returning upvotes into v_new_count;
    when 'forum_posts' then
      update forum_posts set upvotes = upvotes + v_delta
        where id = p_row_id returning upvotes into v_new_count;
    when 'community_texts' then
      update community_texts set upvotes = upvotes + v_delta
        where id = p_row_id returning upvotes into v_new_count;
    else
      raise exception 'Unknown table: %', p_table_name;
  end case;

  return jsonb_build_object('upvotes', v_new_count, 'direction', v_out_direction);
end;
$$;
