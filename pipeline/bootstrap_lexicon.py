# pipeline/bootstrap_lexicon.py
import json
from collections import defaultdict
from pipeline.phonetic import to_phonetic


def group_by_bete_word(alignments: list[dict]) -> dict[str, list[dict]]:
    grouped: defaultdict[str, list[dict]] = defaultdict(list)
    for a in alignments:
        grouped[a["bete_word"]].append({"word": a["french_word"], "score": a["score"]})
    for bete_word in grouped:
        grouped[bete_word].sort(key=lambda x: x["score"], reverse=True)
    return dict(grouped)


def build_lexicon_from_alignments(
    alignments: list[dict],
    dialect: str = "western",
) -> list[dict]:
    grouped = group_by_bete_word(alignments)
    entries = []
    for bete_word, candidates in grouped.items():
        top = candidates[0]
        entries.append({
            "bete_word":         bete_word,
            "bete_phonetic":     to_phonetic(bete_word),
            "french_candidates": candidates,
            "top_french":        top["word"],
            "probability":       top["score"],
            "validated":         False,
            "source":            "seed",
            "dialect":           dialect,
        })
    entries.sort(key=lambda e: e["bete_word"])
    return entries


def load_verses(client, parallel_jsonl: str | None = None, dialect: str = "western") -> None:
    """Load verse pairs into the verses table (upsert by book+chapter+verse+dialect)."""
    from pipeline.config import corpus_paths
    if parallel_jsonl is None:
        parallel_jsonl = corpus_paths(dialect)["parallel_jsonl"]
    raw: list[dict] = []
    with open(parallel_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    seen: dict[tuple, dict] = {}
    for rec in raw:
        key = (rec["book"], rec["chapter"], rec["verse"], dialect)
        if key in seen:
            seen[key]["bete_text"]   += " " + rec["bete_text"]
            seen[key]["french_text"] += " " + rec["french_text"]
        else:
            entry = dict(rec)
            entry["dialect"] = dialect
            seen[key] = entry
    verses = list(seen.values())

    batch_size = 500
    for i in range(0, len(verses), batch_size):
        batch = verses[i : i + batch_size]
        result = client.table("verses").upsert(
            batch, on_conflict="book,chapter,verse,dialect"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error: {result.error}")
        print(f"  Verses: {min(i + batch_size, len(verses))}/{len(verses)}")


def load_lexicon(client, alignments_jsonl: str | None = None, dialect: str = "western") -> None:
    """Load alignment-derived lexicon entries tagged with dialect."""
    from pipeline.config import corpus_paths
    if alignments_jsonl is None:
        alignments_jsonl = corpus_paths(dialect)["alignments_jsonl"]
    raw: list[dict] = []
    with open(alignments_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    entries = build_lexicon_from_alignments(raw, dialect=dialect)
    batch_size = 500
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        result = client.table("lexicon").upsert(
            batch, on_conflict="bete_word,dialect"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error: {result.error}")
        print(f"  Lexicon: {min(i + batch_size, len(entries))}/{len(entries)}")


def load_alignments(client, alignments_jsonl: str | None = None, dialect: str = "western") -> None:
    """Load raw alignment records tagged with dialect."""
    from pipeline.config import corpus_paths
    if alignments_jsonl is None:
        alignments_jsonl = corpus_paths(dialect)["alignments_jsonl"]
    raw: list[dict] = []
    with open(alignments_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    records = [
        {"bete_word": r["bete_word"], "french_word": r["french_word"],
         "score": r["score"], "dialect": dialect}
        for r in raw
    ]
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        result = client.table("alignments").upsert(
            batch, on_conflict="bete_word,french_word,dialect"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error: {result.error}")
        print(f"  Alignments: {min(i + batch_size, len(records))}/{len(records)}")


if __name__ == "__main__":
    import argparse
    from supabase import create_client
    from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f"Loading verses for {args.dialect}...")
    load_verses(client, dialect=args.dialect)
    print(f"Loading lexicon for {args.dialect}...")
    load_lexicon(client, dialect=args.dialect)
    print(f"Loading alignments for {args.dialect}...")
    load_alignments(client, dialect=args.dialect)
    print("Done.")
