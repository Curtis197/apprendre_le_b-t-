"""Full pipeline orchestrator for one Bété dialect.
Usage: python -m pipeline.run_dialect --dialect northern
"""
import argparse
import asyncio
from pathlib import Path

from pipeline.config import DIALECTS, corpus_paths
from pipeline.scraper import scrape_nt
from pipeline.prepare_corpus import write_aligned_text_files, count_lines
from pipeline.align import run_alignment, extract_probabilities, save_alignments
from pipeline.bootstrap_lexicon import (
    load_verses, load_lexicon, load_alignments as load_alignments_db
)
from pipeline.vectorize import vectorize_lexicon
from pipeline.populate_examples import populate_examples
from pipeline.tag_pos import tag_pos
from pipeline.update_lemmas import update_lemmas
from pipeline.vectorize_grammar import vectorize_grammar_rules
from pipeline.mine_inflections import mine_inflections


def _client():
    from supabase import create_client
    from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def run(dialect: str) -> None:
    if dialect not in DIALECTS:
        raise ValueError(f"Unknown dialect {dialect!r}. Valid: {list(DIALECTS)}")
    paths = corpus_paths(dialect)
    name  = DIALECTS[dialect]["name"]
    print(f"\n=== Pipeline: {name} ===\n")

    print("Step 1/7 — Scrape Bible.com")
    asyncio.run(scrape_nt(dialect=dialect))

    print("\nStep 2/7 — Prepare corpus")
    if not Path(paths["bete_txt"]).exists():
        write_aligned_text_files(
            parallel_jsonl=paths["parallel_jsonl"],
            bete_txt=paths["bete_txt"],
            french_txt=paths["french_txt"],
        )
        print(f"  {count_lines(paths['bete_txt'])} sentence pairs")
    else:
        print("  Already prepared — skipping")

    print("\nStep 3/7 — Word alignment")
    if not Path(paths["alignments_jsonl"]).exists():
        run_alignment(
            french_txt=paths["french_txt"], bete_txt=paths["bete_txt"],
            forward_align=paths["forward_align"], reverse_align=paths["reverse_align"],
        )
        alignments = extract_probabilities(
            french_txt=paths["french_txt"], bete_txt=paths["bete_txt"],
            forward_align=paths["forward_align"],
        )
        save_alignments(alignments, output_path=paths["alignments_jsonl"])
    else:
        print("  Already aligned — skipping")

    client = _client()

    print("\nStep 4/7 — Load verses")
    load_verses(client, dialect=dialect)

    print("\nStep 5/7 — Load lexicon")
    load_lexicon(client, dialect=dialect)

    print("\nStep 6/7 — Load alignments")
    load_alignments_db(client, dialect=dialect)

    print("\nStep 7a/7 — Vectorize")
    vectorize_lexicon(dialect=dialect)

    print("\nStep 7b/7 — Populate examples")
    populate_examples(dialect=dialect)

    print("\nStep 7c/7 — Tag POS")
    tag_pos(dialect=dialect)

    print("\nStep 8/10 — Update french_lemma")
    update_lemmas(dialect=dialect)

    print("\nStep 9/10 — Vectorize grammar rules")
    vectorize_grammar_rules()

    print("\nStep 10/10 — Mine inflected forms")
    mine_inflections(dialect=dialect)

    print(f"\n=== Done: {name} ===\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", required=True, choices=list(DIALECTS))
    args = parser.parse_args()
    run(args.dialect)
