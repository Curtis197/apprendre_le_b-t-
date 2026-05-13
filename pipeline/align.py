# pipeline/align.py
import json
import subprocess
import sys
from collections import defaultdict
from pipeline.config import (
    FRENCH_TXT, BETE_TXT, FORWARD_ALIGN, REVERSE_ALIGN,
    PARALLEL_JSONL, ALIGNMENTS_JSONL, ALIGNMENT_THRESHOLD,
)


def run_eflomal(
    french_txt: str = FRENCH_TXT,
    bete_txt: str = BETE_TXT,
    forward_align: str = FORWARD_ALIGN,
    reverse_align: str = REVERSE_ALIGN,
) -> None:
    """
    Run eflomal word alignment.
    French is the source (input language), Bété is the target (output language).
    Model 3 = HMM+fertility, highest quality.
    """
    cmd = [
        sys.executable, "-m", "eflomal",
        "-s", french_txt,
        "-t", bete_txt,
        "-f", forward_align,
        "-r", reverse_align,
        "--model", "3",
        "--overwrite",
    ]
    print("Running eflomal (this takes several minutes)...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"eflomal failed:\n{result.stderr}")
    print("Alignment complete.")


def extract_probabilities(
    parallel_jsonl: str = PARALLEL_JSONL,
    forward_align: str = FORWARD_ALIGN,
    threshold: float = ALIGNMENT_THRESHOLD,
) -> list[dict]:
    """
    Extract word-level alignment probabilities from eflomal output.

    Algorithm:
      1. For each sentence pair + alignment line, record every (french, bete) pair.
      2. Count occurrences of each pair and each source (french) word.
      3. Probability = pair_count / source_count.
      4. Filter by threshold.
    """
    sentences: list[dict] = []
    with open(parallel_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            sentences.append({
                "french": rec["french_text"].split(),
                "bete":   rec["bete_text"].split(),
            })

    pair_counts:   defaultdict[tuple[str, str], int] = defaultdict(int)
    source_counts: defaultdict[str, int]             = defaultdict(int)

    with open(forward_align, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= len(sentences):
                break
            french_words = sentences[i]["french"]
            bete_words   = sentences[i]["bete"]
            for token in line.strip().split():
                if "-" not in token:
                    continue
                src_idx_s, tgt_idx_s = token.split("-", 1)
                src_idx, tgt_idx = int(src_idx_s), int(tgt_idx_s)
                if src_idx < len(french_words) and tgt_idx < len(bete_words):
                    fw = french_words[src_idx].lower()
                    bw = bete_words[tgt_idx].lower()
                    pair_counts[(fw, bw)] += 1
                    source_counts[fw] += 1

    alignments: list[dict] = []
    for (fw, bw), count in pair_counts.items():
        score = count / source_counts[fw]
        if score >= threshold:
            alignments.append({
                "french_word": fw,
                "bete_word":   bw,
                "score":       round(score, 4),
            })

    return sorted(alignments, key=lambda x: x["score"], reverse=True)


def save_alignments(
    alignments: list[dict],
    output_path: str = ALIGNMENTS_JSONL,
) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        for a in alignments:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
    print(f"Saved {len(alignments)} alignment pairs to {output_path}")


if __name__ == "__main__":
    run_eflomal()
    alignments = extract_probabilities()
    save_alignments(alignments)
