import json
import re
from pipeline.config import PARALLEL_JSONL, BETE_TXT, FRENCH_TXT

_CITATION_RE = re.compile(r'^[\w\d\s]+\d+:\d+$')
_INLINE_REF_RE = re.compile(r'#[^.]+\.')   # e.g. #Lu 1:31, 32.
_LEADING_NUM_RE = re.compile(r'^\d+')       # leading verse number e.g. "1Généalogie"
_TOKEN_NUM_RE = re.compile(r'^\d+')         # verse number prefix on any token e.g. "36'n"


def _clean_french(text: str) -> str:
    text = _INLINE_REF_RE.sub('', text)
    text = _LEADING_NUM_RE.sub('', text)
    return text.strip()


def _clean_bete(text: str) -> str:
    # Strip leading verse number from the whole line
    text = _LEADING_NUM_RE.sub('', text).strip()
    # Strip verse number prefix from individual tokens (e.g. "36'n" -> "'n")
    tokens = [_TOKEN_NUM_RE.sub('', tok) for tok in text.split()]
    return ' '.join(t for t in tokens if t)


def _is_bad(record: dict) -> bool:
    """True if the French text is a bare citation with no actual content."""
    french = record["french_text"].strip()
    return len(french) < 40 and bool(_CITATION_RE.match(french))


def write_aligned_text_files(
    parallel_jsonl: str = PARALLEL_JSONL,
    bete_txt: str = BETE_TXT,
    french_txt: str = FRENCH_TXT,
) -> None:
    """
    Convert the JSONL parallel corpus to two line-aligned plain text files
    suitable for eflomal input.
    Line N in bete.txt corresponds to line N in french.txt.
    Skips records where the French text is a bare cross-reference citation.
    """
    skipped = 0
    with (
        open(parallel_jsonl, "r", encoding="utf-8") as src,
        open(bete_txt,       "w", encoding="utf-8") as bf,
        open(french_txt,     "w", encoding="utf-8") as ff,
    ):
        for line in src:
            record = json.loads(line)
            if _is_bad(record):
                skipped += 1
                continue
            bf.write(_clean_bete(record["bete_text"]) + "\n")
            ff.write(_clean_french(record["french_text"]) + "\n")
    if skipped:
        print(f"  Skipped {skipped} records with citation-only French text.")


def count_lines(path: str) -> int:
    """Return the number of lines in a text file."""
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for _ in f)


if __name__ == "__main__":
    import argparse
    from pipeline.config import DIALECTS, corpus_paths
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    paths = corpus_paths(args.dialect)
    write_aligned_text_files(
        parallel_jsonl=paths["parallel_jsonl"],
        bete_txt=paths["bete_txt"],
        french_txt=paths["french_txt"],
    )
    n = count_lines(paths["bete_txt"])
    assert n == count_lines(paths["french_txt"]), "Line counts do not match!"
    print(f"Wrote {n} aligned sentence pairs.")
