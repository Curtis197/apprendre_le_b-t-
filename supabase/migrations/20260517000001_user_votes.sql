-- ── user_votes table ─────────────────────────────────────────────────────────
-- Tracks one vote per user per item so duplicates are impossible at the DB level.
create table if not exists user_votes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  row_id     uuid not null,
  direction  text not null check (direction in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (user_id, table_name, row_id)
);

alter table user_votes enable row level security;

-- Each user can only read and manage their own votes.
create policy "own votes" on user_votes
  for all using (user_id = auth.uid());

-- ── vote RPC ──────────────────────────────────────────────────────────────────
-- Replaces increment_upvotes.
-- • Looks up the caller's existing vote for (table_name, row_id).
-- • No prior vote   → inserts, delta ±1.
-- • Same direction  → deletes (toggle off), delta ∓1, returns direction = null.
-- • Flip direction  → updates, delta ±2.
-- • Floors upvotes at 0.
-- • Returns {upvotes int, direction text|null}.
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

  -- Fetch existing vote
  select direction into v_old_direction
  from user_votes
  where user_id = auth.uid()
    and table_name = p_table_name
    and row_id = p_row_id;

  if v_old_direction is null then
    -- First vote
    insert into user_votes (user_id, table_name, row_id, direction)
    values (auth.uid(), p_table_name, p_row_id, p_direction);
    v_delta         := case p_direction when 'up' then 1 else -1 end;
    v_out_direction := p_direction;

  elsif v_old_direction = p_direction then
    -- Toggle off: remove the vote
    delete from user_votes
    where user_id = auth.uid()
      and table_name = p_table_name
      and row_id = p_row_id;
    v_delta         := case p_direction when 'up' then -1 else 1 end;
    v_out_direction := null;

  else
    -- Flip direction
    update user_votes
      set direction = p_direction
    where user_id = auth.uid()
      and table_name = p_table_name
      and row_id = p_row_id;
    v_delta         := case p_direction when 'up' then 2 else -2 end;
    v_out_direction := p_direction;
  end if;

  -- Apply delta to the target table
  case p_table_name
    when 'grammar_rules' then
      update grammar_rules
        set upvotes = greatest(0, upvotes + v_delta)
        where id = p_row_id
        returning upvotes into v_new_count;
    when 'expressions' then
      update expressions
        set upvotes = greatest(0, upvotes + v_delta)
        where id = p_row_id
        returning upvotes into v_new_count;
    when 'lexicon' then
      update lexicon
        set upvotes = greatest(0, upvotes + v_delta)
        where id = p_row_id
        returning upvotes into v_new_count;
    when 'forum_threads' then
      update forum_threads
        set upvotes = greatest(0, upvotes + v_delta)
        where id = p_row_id
        returning upvotes into v_new_count;
    when 'forum_posts' then
      update forum_posts
        set upvotes = greatest(0, upvotes + v_delta)
        where id = p_row_id
        returning upvotes into v_new_count;
    when 'community_texts' then
      update community_texts
        set upvotes = greatest(0, upvotes + v_delta)
        where id = p_row_id
        returning upvotes into v_new_count;
    else
      raise exception 'Unknown table: %', p_table_name;
  end case;

  return jsonb_build_object('upvotes', v_new_count, 'direction', v_out_direction);
end;
$$;

-- Drop the old RPC (replaced by vote above)
drop function if exists increment_upvotes(text, uuid, int);
drop function if exists increment_upvotes(text, uuid);
