"""Migrate lexicon.pos from text to text[] and ensure GIN index exists."""
import psycopg2

CONN = {
    "host": "db.agdqbzbjcxrzfhkvempe.supabase.co",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres",
    "password": "Uv4KxCuTG9ZemDOW",
    "sslmode": "require",
}

SQL = """
alter table lexicon
  alter column pos type text[]
  using case when pos is null then null else array[pos] end;

create index if not exists lexicon_pos_gin_idx
  on lexicon using gin(pos);
"""


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = True
    cur = conn.cursor()
    print("Migrating lexicon.pos to text[]...")
    cur.execute(SQL)
    print("Done.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
