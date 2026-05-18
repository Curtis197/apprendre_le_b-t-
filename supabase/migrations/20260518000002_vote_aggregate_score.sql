-- Replace delta-based vote() with aggregate recompute.
-- After each vote, upvotes = SUM(up votes) - SUM(down votes) from user_votes.
-- No delta logic, no floor, no drift possible.
create or replace function vote(
  p_table_name text,
  p_row_id     uuid,
  p_direction  text
)
returns jsonb language plpgsql security definer as $$
declare
  v_old_direction text;
  v_new_score     int;
  v_out_direction text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception 'Invalid direction: %', p_direction;
  end if;

  -- Read existing vote for this user
  select direction into v_old_direction
  from user_votes
  where user_id = auth.uid()
    and table_name = p_table_name
    and row_id = p_row_id;

  if v_old_direction is null then
    -- No prior vote: insert
    insert into user_votes (user_id, table_name, row_id, direction)
    values (auth.uid(), p_table_name, p_row_id, p_direction);
    v_out_direction := p_direction;

  elsif v_old_direction = p_direction then
    -- Same direction: toggle off
    delete from user_votes
    where user_id = auth.uid()
      and table_name = p_table_name
      and row_id = p_row_id;
    v_out_direction := null;

  else
    -- Opposite direction: flip
    update user_votes
      set direction = p_direction
    where user_id = auth.uid()
      and table_name = p_table_name
      and row_id = p_row_id;
    v_out_direction := p_direction;
  end if;

  -- Recompute score from source of truth
  select coalesce(sum(case when direction = 'up' then 1 else -1 end), 0)
  into v_new_score
  from user_votes
  where table_name = p_table_name
    and row_id = p_row_id;

  -- Write score back to target table
  case p_table_name
    when 'grammar_rules' then
      update grammar_rules set upvotes = v_new_score where id = p_row_id;
    when 'expressions' then
      update expressions set upvotes = v_new_score where id = p_row_id;
    when 'lexicon' then
      update lexicon set upvotes = v_new_score where id = p_row_id;
    when 'forum_threads' then
      update forum_threads set upvotes = v_new_score where id = p_row_id;
    when 'forum_posts' then
      update forum_posts set upvotes = v_new_score where id = p_row_id;
    when 'community_texts' then
      update community_texts set upvotes = v_new_score where id = p_row_id;
    else
      raise exception 'Unknown table: %', p_table_name;
  end case;

  return jsonb_build_object('upvotes', v_new_score, 'direction', v_out_direction);
end;
$$;
