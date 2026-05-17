# pipeline/mine_inflections.py
"""
Step 9: Mine inflected French->Bete form pairs from the parallel corpus.
For each aligned sentence pair, extracts (french_word, bete_word) via IBM1 alignment.
Groups pairs by French lemma, cross-references the lexicon, inserts candidates
into inflected_forms with validated=false.
Safe to re-run: uses upsert on french_form+lexicon_id.
"""
from collections import defaultdict
from pathlib import Path
from supabase import create_client
from pipeline.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS, corpus_paths,
)
from pipeline.update_lemmas import lemmatize_fr
from pipeline.phonetic import to_phonetic


def extract_aligned_pairs(
    french_words: list,
    bete_words: list,
    align_line: str,
) -> list:
    """Return (french_word, bete_word) pairs from a Pharaoh alignment line."""
    pairs = []
    for token in align_line.strip().split():
        if "-" not in token:
            continue
        s, t = token.split("-", 1)
        try:
            si, ti = int(s), int(t)
        except ValueError:
            continue
        if si < len(french_words) and ti < len(bete_words):
            pairs.append((french_words[si], bete_words[ti]))
    return pairs


def group_by_lemma(pairs: list) -> dict:
    """Group (french_inflected, bete_word) pairs by French lemma."""
    grouped = defaultdict(list)
    for french_form, bete_form in pairs:
        lemma = lemmatize_fr(french_form)
        grouped[lemma].append((french_form, bete_form))
    return dict(grouped)


def mine_inflections(dialect: str = "western") -> None:
    paths = corpus_paths(dialect)
    french_txt    = Path(paths["french_txt"])
    bete_txt      = Path(paths["bete_txt"])
    forward_align = Path(paths["forward_align"])

    if not french_txt.exists() or not bete_txt.exists() or not forward_align.exists():
        print(f"Corpus files missing for {dialect} — run steps 1-3 first.")
        return

    all_pairs = []
    with (
        open(french_txt, encoding="utf-8") as ff,
        open(bete_txt,   encoding="utf-8") as bf,
        open(forward_align, encoding="utf-8") as af,
    ):
        for fl, bl, al in zip(ff, bf, af):
            fr_words = fl.strip().lower().split()
            bt_words = bl.strip().lower().split()
            pairs = extract_aligned_pairs(fr_words, bt_words, al)
            all_pairs.extend(pairs)

    print(f"Extracted {len(all_pairs)} raw alignment pairs for {dialect}.")

    grouped = group_by_lemma(all_pairs)
    print(f"Grouped into {len(grouped)} lemma groups.")

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    lex_rows = (
        client.table("lexicon")
        .select("id,french_lemma,bete_word,bete_phonetic,pos")
        .eq("dialect", dialect)
        .not_.is_("french_lemma", "null")
        .execute()
        .data or []
    )
    lex_by_lemma = {r["french_lemma"]: r for r in lex_rows}
    print(f"Lexicon has {len(lex_by_lemma)} entries with french_lemma.")

    records = []
    for lemma, pairs in grouped.items():
        lex = lex_by_lemma.get(lemma)
        if not lex:
            continue
        freq = defaultdict(int)
        for fr, bt in pairs:
            freq[(fr, bt)] += 1
        best_per_form = {}
        for (fr, bt), count in freq.items():
            if fr not in best_per_form or count > best_per_form[fr][1]:
                best_per_form[fr] = (bt, count)

        for french_form, (bete_western, _) in best_per_form.items():
            if french_form == lemma:
                continue  # base form already in lexicon
            records.append({
                "lexicon_id":     lex["id"],
                "french_form":    french_form,
                "bete_form":      bete_western,
                "bete_phonetic":  to_phonetic(bete_western),
                "pos":            (lex.get("pos") or [""])[0] if lex.get("pos") else None,
                "inflection_tag": None,
                "validated":      False,
            })

    print(f"Inserting {len(records)} inflected form candidates...")
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        client.table("inflected_forms").upsert(
            batch, on_conflict="french_form,lexicon_id"
        ).execute()
        print(f"  {min(i + batch_size, len(records))}/{len(records)}")
    print("Done.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    mine_inflections(dialect=args.dialect)
