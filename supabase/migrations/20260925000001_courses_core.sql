-- Course platform, phase 1: authoring, catalog and access model.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── Roles ───────────────────────────────────────────────────────────────────
-- RLS is enabled with NO policies on purpose: clients can neither read nor
-- write this table. Admin checks go through is_admin() (SECURITY DEFINER).
create table if not exists user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);
alter table user_roles enable row level security;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles where user_id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

-- ── Shared trigger: keep updated_at fresh ───────────────────────────────────
create or replace function course_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Courses ─────────────────────────────────────────────────────────────────
create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 120),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  summary     text not null default '' check (char_length(summary) <= 500),
  cover_url   text,
  dialect     text not null default 'western'
              check (dialect in ('western', 'northern', 'eastern')),
  level       text not null default 'beginner'
              check (level in ('beginner', 'intermediate', 'advanced')),
  status      text not null default 'draft'
              check (status in ('draft', 'published', 'archived', 'suspended')),
  access      text not null default 'free' check (access in ('free', 'paid')),
  price_cents int check (price_cents is null or price_cents >= 0),
  currency    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists courses_status_idx on courses (status);
create index if not exists courses_owner_idx  on courses (owner_id);

drop trigger if exists courses_touch_updated_at on courses;
create trigger courses_touch_updated_at
  before update on courses
  for each row execute function course_touch_updated_at();

-- ── Sections and lessons ────────────────────────────────────────────────────
create table if not exists course_sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  unique (id, course_id)
);
create index if not exists course_sections_course_idx on course_sections (course_id, position);

create table if not exists lessons (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  course_id  uuid not null references courses(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  position   int  not null default 0,
  kind       text not null default 'text'
             check (kind in ('text', 'audio', 'video', 'quiz', 'assignment')),
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  -- The composite FK keeps the denormalized course_id consistent with the section.
  foreign key (section_id, course_id)
    references course_sections (id, course_id) on delete cascade
);
create index if not exists lessons_section_idx on lessons (section_id, position);
create index if not exists lessons_course_idx  on lessons (course_id);

-- Lesson bodies live apart from lesson metadata: RLS is row-level, and titles
-- (the outline) must be public while bodies are gated.
create table if not exists lesson_contents (
  lesson_id  uuid primary key references lessons(id) on delete cascade,
  body_md    text not null default '' check (char_length(body_md) <= 50000),
  updated_at timestamptz not null default now()
);

drop trigger if exists lesson_contents_touch_updated_at on lesson_contents;
create trigger lesson_contents_touch_updated_at
  before update on lesson_contents
  for each row execute function course_touch_updated_at();

create or replace function lessons_create_content()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into lesson_contents (lesson_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists lessons_after_insert_content on lessons;
create trigger lessons_after_insert_content
  after insert on lessons
  for each row execute function lessons_create_content();

-- ── Enrollments ─────────────────────────────────────────────────────────────
-- Single source of truth for "may this user open this course".
create table if not exists enrollments (
  user_id    uuid not null references auth.users(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index if not exists enrollments_course_idx on enrollments (course_id);

-- ── Access helpers (SECURITY DEFINER so policies never recurse) ─────────────
create or replace function is_enrolled(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments
    where course_id = p_course_id and user_id = auth.uid()
  );
$$;

create or replace function can_access_lesson(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from lessons l
    join courses c on c.id = l.course_id
    where l.id = p_lesson_id
      and (
        is_admin()
        or c.owner_id = auth.uid()
        or (c.status = 'published' and l.is_preview)
        or (c.status in ('published', 'archived') and is_enrolled(c.id))
      )
  );
$$;

revoke all on function is_enrolled(uuid)      from public;
revoke all on function can_access_lesson(uuid) from public;
grant execute on function is_enrolled(uuid)      to anon, authenticated;
grant execute on function can_access_lesson(uuid) to anon, authenticated;

-- ── RLS: courses ────────────────────────────────────────────────────────────
alter table courses enable row level security;

create policy courses_select_published on courses
  for select using (status = 'published');

create policy courses_select_own on courses
  for select to authenticated using (owner_id = (select auth.uid()));

create policy courses_select_enrolled on courses
  for select to authenticated
  using (status in ('published', 'archived') and is_enrolled(id));

create policy courses_select_admin on courses
  for select to authenticated using ((select is_admin()));

create policy courses_insert_own on courses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'draft'
    and access = 'free'
  );

create policy courses_update_own on courses
  for update to authenticated
  using (owner_id = (select auth.uid()) and status <> 'suspended')
  with check (
    owner_id = (select auth.uid())
    and status in ('draft', 'published', 'archived')
    and access = 'free'
  );

create policy courses_update_admin on courses
  for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

create policy courses_delete_own on courses
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- ── RLS: sections, lessons, contents ────────────────────────────────────────
-- Read access mirrors course visibility: the subquery runs under the caller's
-- own RLS, so it only sees courses the caller may see.
alter table course_sections enable row level security;

create policy sections_select on course_sections
  for select using (
    exists (select 1 from courses c where c.id = course_sections.course_id)
  );

create policy sections_write_owner on course_sections
  for all to authenticated
  using (
    exists (
      select 1 from courses c
      where c.id = course_sections.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from courses c
      where c.id = course_sections.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

alter table lessons enable row level security;

create policy lessons_select on lessons
  for select using (
    exists (select 1 from courses c where c.id = lessons.course_id)
  );

create policy lessons_write_owner on lessons
  for all to authenticated
  using (
    exists (
      select 1 from courses c
      where c.id = lessons.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from courses c
      where c.id = lessons.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

alter table lesson_contents enable row level security;

create policy contents_select on lesson_contents
  for select using (can_access_lesson(lesson_id));

create policy contents_write_owner on lesson_contents
  for all to authenticated
  using (
    exists (
      select 1
      from lessons l join courses c on c.id = l.course_id
      where l.id = lesson_contents.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1
      from lessons l join courses c on c.id = l.course_id
      where l.id = lesson_contents.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

-- ── RLS: enrollments ────────────────────────────────────────────────────────
alter table enrollments enable row level security;

create policy enrollments_select_own on enrollments
  for select to authenticated using (user_id = (select auth.uid()));

create policy enrollments_insert_own on enrollments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from courses c
      where c.id = enrollments.course_id
        and c.status = 'published'
        and c.access = 'free'
    )
  );

create policy enrollments_delete_own on enrollments
  for delete to authenticated using (user_id = (select auth.uid()));
