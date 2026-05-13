import json
from pipeline.config import PARALLEL_JSONL, BETE_TXT, FRENCH_TXT


def write_aligned_text_files(
    parallel_jsonl: str = PARALLEL_JSONL,
    bete_txt: str = BETE_TXT,
    french_txt: str = FRENCH_TXT,
) -> None:
    """
    Convert the JSONL parallel corpus to two line-aligned plain text files
    suitable for eflomal input.
    Line N in bete.txt corresponds to line N in french.txt.
    """
    with (
        open(parallel_jsonl, "r", encoding="utf-8") as src,
        open(bete_txt,       "w", encoding="utf-8") as bf,
        open(french_txt,     "w", encoding="utf-8") as ff,
    ):
        for line in src:
            record = json.loads(line)
            bf.write(record["bete_text"].strip() + "\n")
            ff.write(record["french_text"].strip() + "\n")


def count_lines(path: str) -> int:
    """Return the number of lines in a text file."""
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for _ in f)


if __name__ == "__main__":
    write_aligned_text_files()
    bete_count = count_lines(BETE_TXT)
    french_count = count_lines(FRENCH_TXT)
    assert bete_count == french_count, "Line counts do not match!"
    print(f"Wrote {bete_count} aligned sentence pairs.")
