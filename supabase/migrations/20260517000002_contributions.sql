create table contributions (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  amount_cents int not null,
  contributor_email text,
  month text not null,
  created_at timestamptz default now()
);

-- RLS enabled with no policies: default-deny for anon + authenticated.
-- Service role bypasses RLS; the webhook route uses SUPABASE_SERVICE_ROLE_KEY.
alter table contributions enable row level security;
