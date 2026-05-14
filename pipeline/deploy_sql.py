"""Deploy missing Supabase SQL objects: translation_cache table and match_lexicon_by_french RPC."""
import psycopg2

CONN = {
    "host": "db.agdqbzbjcxrzfhkvempe.supabase.co",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres",
    "password": "Uv4KxCuTG9ZemDOW",
    "sslmode": "require",
}

TRANSLATION_CACHE = """
create table if not exists translation_cache (
  id          uuid primary key default gen_random_uuid(),
  input_hash  text not null unique,
  input_text  text not null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists translation_cache_hash_idx on translation_cache (input_hash);
"""

MATCH_LEXICON_RPC = """
create extension if not exists pg_trgm;

create or replace function match_lexicon_by_french(
  query_text text,
  match_count int default 1
)
returns table (
  id uuid,
  bete_word text,
  bete_phonetic text,
  french_candidates jsonb,
  top_french text,
  probability float,
  pos text,
  notes text,
  validated bool,
  upvotes int
)
language sql stable
as $$
  select
    l.id,
    l.bete_word,
    l.bete_phonetic,
    l.french_candidates,
    l.top_french,
    l.probability,
    l.pos,
    l.notes,
    l.validated,
    l.upvotes
  from lexicon l
  order by similarity(lower(l.top_french), lower(query_text)) desc
  limit match_count;
$$;
"""


def main():
    print("Connecting to Supabase...")
    conn = psycopg2.connect(**CONN)
    conn.autocommit = True
    cur = conn.cursor()

    print("Creating translation_cache table...")
    cur.execute(TRANSLATION_CACHE)
    print("  Done.")

    print("Creating match_lexicon_by_french RPC...")
    cur.execute(MATCH_LEXICON_RPC)
    print("  Done.")

    cur.close()
    conn.close()
    print("All SQL objects deployed successfully.")


if __name__ == "__main__":
    main()
