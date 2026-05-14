-- Community enrichment tables: forum + user-submitted texts

-- ── Forum threads ──────────────────────────────────────────────────────────
create table if not exists forum_threads (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  category    text not null default 'general'
              check (category in ('general','grammar','lexicon','culture','translation')),
  author_name text,
  created_by  uuid references auth.users(id) on delete set null,
  upvotes     int  not null default 0 check (upvotes >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists forum_threads_category_idx on forum_threads (category);
create index if not exists forum_threads_created_idx  on forum_threads (created_at desc);

-- ── Forum posts (replies) ──────────────────────────────────────────────────
create table if not exists forum_posts (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references forum_threads(id) on delete cascade,
  content     text not null,
  author_name text,
  created_by  uuid references auth.users(id) on delete set null,
  upvotes     int  not null default 0 check (upvotes >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists forum_posts_thread_idx on forum_posts (thread_id);

-- ── Community texts (songs, stories, poems, proverbs …) ───────────────────
create table if not exists community_texts (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  type           text not null
                 check (type in ('song','story','poem','proverb','speech','riddle','other')),
  content_bete   text not null,
  content_french text,
  author_name    text,
  region         text,
  created_by     uuid references auth.users(id) on delete set null,
  validated      bool not null default false,
  upvotes        int  not null default 0 check (upvotes >= 0),
  created_at     timestamptz not null default now()
);
create index if not exists community_texts_type_idx    on community_texts (type);
create index if not exists community_texts_created_idx on community_texts (created_at desc);

-- ── Row-level security ─────────────────────────────────────────────────────
alter table forum_threads   enable row level security;
alter table forum_posts     enable row level security;
alter table community_texts enable row level security;

-- ── Generic upvote RPC ────────────────────────────────────────────────────
-- Safely increments the upvotes column on any of the three community tables.
-- Using a function avoids a read-modify-write race condition on the client.
create or replace function increment_upvotes(table_name text, row_id uuid)
returns void language plpgsql security definer as $$
begin
  if table_name = 'forum_threads' then
    update forum_threads   set upvotes = upvotes + 1 where id = row_id;
  elsif table_name = 'forum_posts' then
    update forum_posts     set upvotes = upvotes + 1 where id = row_id;
  elsif table_name = 'community_texts' then
    update community_texts set upvotes = upvotes + 1 where id = row_id;
  end if;
end;
$$;

do $$ begin
  -- forum_threads
  if not exists (
    select 1 from pg_policies
    where tablename = 'forum_threads' and policyname = 'public_read_forum_threads'
  ) then
    create policy public_read_forum_threads on forum_threads
      for select using (true);
    create policy auth_insert_forum_threads on forum_threads
      for insert with check (auth.uid() is not null);
    create policy own_update_forum_threads  on forum_threads
      for update using (created_by = auth.uid());
  end if;

  -- forum_posts
  if not exists (
    select 1 from pg_policies
    where tablename = 'forum_posts' and policyname = 'public_read_forum_posts'
  ) then
    create policy public_read_forum_posts on forum_posts
      for select using (true);
    create policy auth_insert_forum_posts on forum_posts
      for insert with check (auth.uid() is not null);
    create policy own_update_forum_posts  on forum_posts
      for update using (created_by = auth.uid());
  end if;

  -- community_texts
  if not exists (
    select 1 from pg_policies
    where tablename = 'community_texts' and policyname = 'public_read_community_texts'
  ) then
    create policy public_read_community_texts on community_texts
      for select using (true);
    create policy auth_insert_community_texts on community_texts
      for insert with check (auth.uid() is not null);
    create policy own_update_community_texts  on community_texts
      for update using (created_by = auth.uid());
  end if;
end $$;
