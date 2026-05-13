create table if not exists translation_cache (
  id          uuid primary key default gen_random_uuid(),
  input_hash  text not null unique,
  input_text  text not null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists translation_cache_hash_idx on translation_cache (input_hash);
