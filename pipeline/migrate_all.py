"""Run all pending migrations against the Bété project database."""
import os
import psycopg2

CONN = {
    "host": "db.agdqbzbjcxrzfhkvempe.supabase.co",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres",
    "password": "Uv4KxCuTG9ZemDOW",
    "sslmode": "require",
}

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations")

def run():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = True
    cur = conn.cursor()

    files = sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))
    for fname in files:
        path = os.path.join(MIGRATIONS_DIR, fname)
        with open(path, encoding="utf-8") as f:
            sql = f.read()
        print(f"Running {fname} ...", end=" ")
        try:
            cur.execute(sql)
            print("OK")
        except Exception as e:
            print(f"ERROR: {e}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    run()
