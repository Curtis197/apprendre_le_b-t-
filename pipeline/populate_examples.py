# pipeline/populate_examples.py
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS

MAX_PER_ENTRY = 3


def populate_examples(dialect: str = "western") -> None:
    """
    For each lexicon entry that has no examples yet, find verses whose
    bete_text contains that bete_word (word-boundary match) and insert
    up to MAX_PER_ENTRY snippets into lexicon_examples.
    Safe to re-run: skips entries that already have at least one example.
    """
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    lexicon = client.table("lexicon").select("id,bete_word").eq("dialect", dialect).execute().data or []
    print(f"Processing {len(lexicon)} {dialect} lexicon entries...")

    inserted = 0
    skipped = 0
    no_match = 0

    for entry in lexicon:
        lexicon_id = entry["id"]
        bete_word = entry["bete_word"]

        existing = (
            client.table("lexicon_examples")
            .select("id", count="exact")
            .eq("lexicon_id", lexicon_id)
            .execute()
        )
        if (existing.count or 0) > 0:
            skipped += 1
            continue

        # Find verses where the bete_word appears as a substring
        # Using ilike for case-insensitive substring match
        verses = (
            client.table("verses")
            .select("id,bete_text,french_text")
            .eq("dialect", dialect)
            .ilike("bete_text", f"% {bete_word} %")
            .limit(MAX_PER_ENTRY)
            .execute()
            .data or []
        )

        # Also try starts-with and ends-with patterns if we got fewer than needed
        if len(verses) < MAX_PER_ENTRY:
            extra = (
                client.table("verses")
                .select("id,bete_text,french_text")
                .eq("dialect", dialect)
                .ilike("bete_text", f"{bete_word} %")
                .limit(MAX_PER_ENTRY - len(verses))
                .execute()
                .data or []
            )
            seen_ids = {v["id"] for v in verses}
            verses += [v for v in extra if v["id"] not in seen_ids]

        if not verses:
            no_match += 1
            continue

        for verse in verses[:MAX_PER_ENTRY]:
            try:
                client.table("lexicon_examples").insert({
                    "lexicon_id": lexicon_id,
                    "verse_id": verse["id"],
                    "bete_snippet": verse["bete_text"],
                    "french_snippet": verse["french_text"],
                    "dialect": dialect,
                }).execute()
                inserted += 1
            except Exception as exc:
                print(f"  Warning: insert failed for '{bete_word}': {exc}")

    print(
        f"Done: {inserted} examples inserted, "
        f"{skipped} entries already had examples, "
        f"{no_match} entries had no matching verse."
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    populate_examples(dialect=args.dialect)
