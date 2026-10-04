-- supabase/migrations/20261009000000_lexicon_pronunciations.sql
-- Pronunciation recordings of lexicon entries: several per entry, open to any signed-in user, credited to
-- their author; reported through the corrections system. Only adds (table, bucket, functions, one check
-- constraint change, one trigger). Re-runnable.
-- Spec: docs/superpowers/specs/2026-10-04-lexicon-pronunciation-audio-design.md

-- ── 1. storage bucket (public: anyone can play a recording) ─────────────────────────────────────
-- Path convention: "{author_id}/{lexicon_id}/{timestamp}.{ext}"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lexicon-pronunciations',
  'lexicon-pronunciations',
  true,
  1048576, -- 1 MB cap: a recording is one word
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

drop policy if exists "lexicon_pron_insert_own" on storage.objects;
create policy "lexicon_pron_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lexicon-pronunciations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "lexicon_pron_delete" on storage.objects;
create policy "lexicon_pron_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lexicon-pronunciations'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select is_admin()))
  );

-- Storage API requires a select policy matching delete permissions so that remove() can locate objects.
drop policy if exists "lexicon_pron_select" on storage.objects;
create policy "lexicon_pron_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lexicon-pronunciations'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select is_admin()))
  );
-- Public reads bypass RLS via the public bucket URL.

-- ── 2. table ────────────────────────────────────────────────────────────────────────────────────
create table if not exists lexicon_pronunciations (
  id         uuid primary key default gen_random_uuid(),
  lexicon_id uuid not null references lexicon(id) on delete cascade,
  audio_path text not null unique check (char_length(audio_path) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lexicon_pronunciations_entry_idx on lexicon_pronunciations (lexicon_id, created_at desc);

alter table lexicon_pronunciations enable row level security;
drop policy if exists lexicon_pronunciations_select on lexicon_pronunciations;
create policy lexicon_pronunciations_select on lexicon_pronunciations for select using (true);
-- No insert/update/delete policy: only the functions below write.

-- ── 3. functions ────────────────────────────────────────────────────────────────────────────────
create or replace function add_lexicon_pronunciation(p_lexicon_id uuid, p_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from lexicon where id = p_lexicon_id) then
    raise exception 'entry_not_found';
  end if;
  if p_path is null
     or p_path !~ ('^' || v_uid::text || '/' || p_lexicon_id::text || '/[0-9]+\.(webm|ogg|mp4)$') then
    raise exception 'bad_path';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'lexicon-pronunciations' and o.name = p_path) then
    raise exception 'file_not_found';
  end if;
  if (select count(*) from lexicon_pronunciations p where p.lexicon_id = p_lexicon_id and p.created_by = v_uid) >= 3 then
    raise exception 'too_many';
  end if;
  insert into lexicon_pronunciations (lexicon_id, audio_path, created_by)
  values (p_lexicon_id, p_path, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function add_lexicon_pronunciation(uuid, text) from public, anon;
grant execute on function add_lexicon_pronunciation(uuid, text) to authenticated;

-- Deletes the row (its reports go with it) and hands the storage path back so the app removes the file.
create or replace function delete_lexicon_pronunciation(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_path   text;
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select p.audio_path, p.created_by into v_path, v_author
  from lexicon_pronunciations p where p.id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_author <> v_uid and not is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from lexicon_pronunciations where id = p_id;
  return v_path;
end;
$$;
revoke execute on function delete_lexicon_pronunciation(uuid) from public, anon;
grant execute on function delete_lexicon_pronunciation(uuid) to authenticated;

-- All recordings of an entry, newest first, with the author's name (the profile table is not public).
create or replace function get_lexicon_pronunciations(p_lexicon_id uuid)
returns table (id uuid, path text, author text, created_by uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.audio_path, coalesce(nullif(pr.name, ''), 'Contributeur'), p.created_by, p.created_at
  from lexicon_pronunciations p
  left join profiles pr on pr.id = p.created_by
  where p.lexicon_id = p_lexicon_id
  order by p.created_at desc
$$;
revoke execute on function get_lexicon_pronunciations(uuid) from public;
grant execute on function get_lexicon_pronunciations(uuid) to anon, authenticated;
