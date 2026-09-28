-- Course Platform, Phase 5: Paid courses, dual payment rails & admin payout approval.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Add paid_approved Flag to Courses ────────────────────────────────────
alter table courses
  add column if not exists paid_approved boolean not null default false;

-- ── 2. Course Orders Table ──────────────────────────────────────────────────
create table if not exists course_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    uuid not null references courses(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  currency     text not null default 'eur' check (currency in ('eur', 'xof', 'usd')),
  payment_rail text not null check (payment_rail in ('stripe', 'mobile_money')),
  gateway_ref  text unique check (gateway_ref is null or char_length(gateway_ref) <= 255),
  status       text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists course_orders_user_idx on course_orders (user_id);
create index if not exists course_orders_course_idx on course_orders (course_id);
create index if not exists course_orders_status_idx on course_orders (status);

alter table course_orders enable row level security;

-- Users can read their own orders; admins can read all orders.
create policy course_orders_select on course_orders
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select is_admin())
  );

-- Users can insert pending orders for themselves.
create policy course_orders_insert_own on course_orders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
  );

-- Only admins (or service role) can update order status.
create policy course_orders_admin_update on course_orders
  for update to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
