-- Resources become contributor-owned: no validation step, full CRUD for the creator,
-- and a comment section so the community can correct entries over time.
--
-- The `validated` and `upvotes` columns are kept (older deployments still select them and the
-- vote RPC writes to them) but resources no longer depend on them.

-- ── 1. No validation step ────────────────────────────────────────────────────
alter table community_texts alter column validated set default true;
update community_texts set validated = true where not validated;

-- ── 2. Track edits ───────────────────────────────────────────────────────────
alter table community_texts add column if not exists updated_at timestamptz not null default now();

drop trigger if exists community_texts_touch_updated_at on community_texts;
create trigger community_texts_touch_updated_at
  before update on community_texts
  for each row execute function course_touch_updated_at();

-- ── 3. Ownership: the creator can create, edit and delete their own resources ─
-- (select stays public: public_read_community_texts.) Admins can delete, as a safety valve.
drop policy if exists auth_insert_community_texts on community_texts;
drop policy if exists own_update_community_texts on community_texts;
drop policy if exists community_texts_insert_own on community_texts;
drop policy if exists community_texts_update_own on community_texts;
drop policy if exists community_texts_delete_own on community_texts;

create policy community_texts_insert_own on community_texts
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy community_texts_update_own on community_texts
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy community_texts_delete_own on community_texts
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select is_admin()));

-- Clients cannot hand a resource to someone else, backdate it, or set its score. The check is on
-- current_user (not auth.uid()) so the SECURITY DEFINER vote RPC and the service role still pass.
create or replace function community_texts_guard_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.upvotes := 0;
    new.validated := true;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.upvotes := old.upvotes;
    new.validated := old.validated;
  end if;
  return new;
end;
$$;

drop trigger if exists community_texts_guard_columns on community_texts;
create trigger community_texts_guard_columns
  before insert or update on community_texts
  for each row execute function community_texts_guard_columns();

-- ── 4. Comments ──────────────────────────────────────────────────────────────
create table if not exists resource_comments (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references community_texts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists resource_comments_resource_idx on resource_comments (resource_id, created_at);

alter table resource_comments enable row level security;

create policy resource_comments_select on resource_comments
  for select using (true);

create policy resource_comments_insert_own on resource_comments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy resource_comments_update_own on resource_comments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy resource_comments_delete_own on resource_comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select is_admin()));

-- The display name comes from the author's profile, never from the client, so nobody can
-- post under someone else's name; edits can only change the text.
create or replace function resource_comments_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.author_name := coalesce(nullif((select name from profiles where id = new.user_id), ''), 'Contributeur');
  else
    new.user_id := old.user_id;
    new.resource_id := old.resource_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists resource_comments_guard on resource_comments;
create trigger resource_comments_guard
  before insert or update on resource_comments
  for each row execute function resource_comments_guard();

drop trigger if exists resource_comments_touch_updated_at on resource_comments;
create trigger resource_comments_touch_updated_at
  before update on resource_comments
  for each row execute function course_touch_updated_at();
