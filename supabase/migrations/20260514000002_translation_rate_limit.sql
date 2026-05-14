-- Per-user daily translation quota
-- identifier = user UUID for authenticated users, 'ip:<sha256>' for anonymous
create table if not exists translation_usage (
  identifier  text not null,
  used_date   date not null default current_date,
  count       int  not null default 0,
  primary key (identifier, used_date)
);
create index if not exists translation_usage_date_idx on translation_usage (used_date);

-- Auto-clean rows older than 30 days to keep the table small
create or replace function prune_translation_usage() returns void
language sql security definer as $$
  delete from translation_usage where used_date < current_date - 30;
$$;
