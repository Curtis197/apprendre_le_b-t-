# pipeline/align.py
import json
from collections import defaultdict
from pipeline.config import (
    FRENCH_TXT, BETE_TXT, FORWARD_ALIGN, REVERSE_ALIGN,
    PARALLEL_JSONL, ALIGNMENTS_JSONL, ALIGNMENT_THRESHOLD,
)

IBM1_ITERATIONS = 5


def _load_sentence_pairs(src_path: str, tgt_path: str) -> list[tuple[list[str], list[str]]]:
    pairs = []
    with open(src_path, encoding="utf-8") as sf, open(tgt_path, encoding="utf-8") as tf:
        for s, t in zip(sf, tf):
            pairs.append((s.strip().lower().split(), t.strip().lower().split()))
    return pairs


def _ibm1_train(pairs: list[tuple[list[str], list[str]]], iterations: int) -> dict[str, dict[str, float]]:
    """Train IBM Model 1 via EM. Returns t[src_word][tgt_word] = probability."""
    # Uniform initialisation
    t: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for src_words, tgt_words in pairs:
        for s in src_words:
            for t_w in tgt_words:
                t[s][t_w] = 1.0

    for _ in range(iterations):
        counts:  defaultdict[tuple[str, str], float] = defaultdict(float)
        totals:  defaultdict[str, float]              = defaultdict(float)
        for src_words, tgt_words in pairs:
            for s in src_words:
                denom = sum(t[s][tw] for tw in tgt_words) or 1e-10
                for tw in tgt_words:
                    delta = t[s][tw] / denom
                    counts[(s, tw)] += delta
                    totals[s]       += delta
        # Normalise
        for (s, tw), c in counts.items():
            t[s][tw] = c / (totals[s] or 1e-10)

    return t


def run_alignment(
    french_txt: str = FRENCH_TXT,
    bete_txt: str = BETE_TXT,
    forward_align: str = FORWARD_ALIGN,
    reverse_align: str = REVERSE_ALIGN,
) -> None:
    """
    Run IBM Model 1 word alignment in both directions and write Pharaoh-format
    alignment files (src_idx-tgt_idx per line).
    """
    pairs = _load_sentence_pairs(french_txt, bete_txt)
    print(f"Loaded {len(pairs)} sentence pairs.")

    print(f"Training forward alignment (French -> Bete, {IBM1_ITERATIONS} iterations)...")
    t_fwd = _ibm1_train(pairs, IBM1_ITERATIONS)
    with open(forward_align, "w", encoding="utf-8") as f:
        for src_words, tgt_words in pairs:
            links = []
            for si, s in enumerate(src_words):
                best_ti = max(range(len(tgt_words)), key=lambda ti: t_fwd[s][tgt_words[ti]], default=0)
                links.append(f"{si}-{best_ti}")
            f.write(" ".join(links) + "\n")

    rev_pairs = [(t, s) for s, t in pairs]
    print(f"Training reverse alignment (Bete -> French, {IBM1_ITERATIONS} iterations)...")
    t_rev = _ibm1_train(rev_pairs, IBM1_ITERATIONS)
    with open(reverse_align, "w", encoding="utf-8") as f:
        for tgt_words, src_words in rev_pairs:
            links = []
            for ti, tw in enumerate(tgt_words):
                best_si = max(range(len(src_words)), key=lambda si: t_rev[tw][src_words[si]], default=0)
                links.append(f"{best_si}-{ti}")
            f.write(" ".join(links) + "\n")

    print("Alignment complete.")


# Keep old name as alias so existing callers don't break
run_eflomal = run_alignment


def extract_probabilities(
    french_txt: str = FRENCH_TXT,
    bete_txt: str = BETE_TXT,
    forward_align: str = FORWARD_ALIGN,
    threshold: float = ALIGNMENT_THRESHOLD,
) -> list[dict]:
    """
    Extract word-level alignment probabilities from IBM Model 1 output.

    Algorithm:
      1. For each sentence pair + alignment line, record every (french, bete) pair.
      2. Count occurrences of each pair and each source (french) word.
      3. Probability = pair_count / source_count.
      4. Filter by threshold.
    """
    sentences: list[dict] = []
    with open(french_txt, encoding="utf-8") as ff, open(bete_txt, encoding="utf-8") as bf:
        for fl, bl in zip(ff, bf):
            sentences.append({
                "french": fl.strip().split(),
                "bete":   bl.strip().split(),
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
                try:
                    src_idx, tgt_idx = int(src_idx_s), int(tgt_idx_s)
                except ValueError:
                    continue
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
    run_alignment()
    alignments = extract_probabilities()
    save_alignments(alignments)
