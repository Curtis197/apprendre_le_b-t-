-- supabase/migrations/20260517000002_contributions.sql
create table contributions (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  amount_eur int not null,
  contributor_email text,
  month text not null,
  created_at timestamptz default now()
);

-- Only service role can insert (webhook uses service key)
alter table contributions enable row level security;

create policy "service role full access" on contributions
  using (true)
  with check (true);
