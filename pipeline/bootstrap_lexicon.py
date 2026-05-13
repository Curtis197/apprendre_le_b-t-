# pipeline/bootstrap_lexicon.py
import json
from collections import defaultdict
from pipeline.phonetic import to_phonetic


def group_by_bete_word(alignments: list[dict]) -> dict[str, list[dict]]:
    """
    Group alignment records by Bété word.
    Each group is a list of {word, score} dicts sorted by score descending.
    """
    grouped: defaultdict[str, list[dict]] = defaultdict(list)
    for a in alignments:
        grouped[a["bete_word"]].append({"word": a["french_word"], "score": a["score"]})
    for bete_word in grouped:
        grouped[bete_word].sort(key=lambda x: x["score"], reverse=True)
    return dict(grouped)


def build_lexicon_from_alignments(alignments: list[dict]) -> list[dict]:
    """Build lexicon entry dicts ready for Supabase upsert."""
    grouped = group_by_bete_word(alignments)
    entries = []
    for bete_word, candidates in grouped.items():
        top = candidates[0]
        entries.append({
            "bete_word":          bete_word,
            "bete_phonetic":      to_phonetic(bete_word),
            "french_candidates":  candidates,
            "top_french":         top["word"],
            "probability":        top["score"],
            "validated":          False,
        })
    entries.sort(key=lambda e: e["bete_word"])
    return entries


def load_verses(client, parallel_jsonl: str | None = None) -> None:
    """Load verse pairs into the verses table (upsert by book+chapter+verse)."""
    from pipeline.config import PARALLEL_JSONL
    if parallel_jsonl is None:
        parallel_jsonl = PARALLEL_JSONL
    verses = []
    try:
        with open(parallel_jsonl, "r", encoding="utf-8") as f:
            for line in f:
                verses.append(json.loads(line))
    except FileNotFoundError:
        raise FileNotFoundError(f"Parallel JSONL file not found: {parallel_jsonl!r}")

    batch_size = 500
    for i in range(0, len(verses), batch_size):
        batch = verses[i : i + batch_size]
        result = client.table("verses").upsert(
            batch, on_conflict="book,chapter,verse"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error upserting verses: {result.error}")
        print(f"  Verses: {min(i + batch_size, len(verses))}/{len(verses)}")


def load_lexicon(client, alignments_jsonl: str | None = None) -> None:
    """Load alignment-derived lexicon entries into the lexicon table."""
    from pipeline.config import ALIGNMENTS_JSONL
    if alignments_jsonl is None:
        alignments_jsonl = ALIGNMENTS_JSONL
    raw: list[dict] = []
    try:
        with open(alignments_jsonl, "r", encoding="utf-8") as f:
            for line in f:
                raw.append(json.loads(line))
    except FileNotFoundError:
        raise FileNotFoundError(f"Alignments JSONL file not found: {alignments_jsonl!r}")

    entries = build_lexicon_from_alignments(raw)

    batch_size = 500
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        result = client.table("lexicon").upsert(
            batch, on_conflict="bete_word"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error upserting lexicon: {result.error}")
        print(f"  Lexicon: {min(i + batch_size, len(entries))}/{len(entries)}")


def load_alignments(client, alignments_jsonl: str | None = None) -> None:
    """Load raw alignment records into the alignments table for future retraining."""
    from pipeline.config import ALIGNMENTS_JSONL
    if alignments_jsonl is None:
        alignments_jsonl = ALIGNMENTS_JSONL

    raw: list[dict] = []
    try:
        with open(alignments_jsonl, "r", encoding="utf-8") as f:
            for line in f:
                raw.append(json.loads(line))
    except FileNotFoundError:
        raise FileNotFoundError(f"Alignments JSONL file not found: {alignments_jsonl!r}")

    # alignments table: bete_word, french_word, score (verse_id left null)
    records = [
        {"bete_word": r["bete_word"], "french_word": r["french_word"], "score": r["score"]}
        for r in raw
    ]

    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        result = client.table("alignments").upsert(batch).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase upsert error: {result.error}")
        done = min(i + batch_size, len(records))
        print(f"  Alignments: {done}/{len(records)}")


if __name__ == "__main__":
    from supabase import create_client
    from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("Loading verses...")
    load_verses(client)
    print("Loading lexicon...")
    load_lexicon(client)
    print("Loading alignments...")
    load_alignments(client)
    print("Done.")
