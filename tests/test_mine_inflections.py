# tests/test_mine_inflections.py
from pipeline.mine_inflections import extract_aligned_pairs, group_by_lemma

def test_extract_aligned_pairs_basic():
    french_words = ["le", "père", "aime"]
    bete_words   = ["na", "so", "amo"]
    align_line   = "0-0 1-1 2-2"
    pairs = extract_aligned_pairs(french_words, bete_words, align_line)
    assert ("père", "so") in pairs
    assert ("aime", "amo") in pairs
    assert len(pairs) == 3

def test_extract_aligned_pairs_skips_bad_index():
    french_words = ["père"]
    bete_words   = ["so"]
    align_line   = "0-0 5-99"  # out of bounds indices
    pairs = extract_aligned_pairs(french_words, bete_words, align_line)
    assert len(pairs) == 1

def test_group_by_lemma_groups_correctly():
    pairs = [("aimait", "amo"), ("aimons", "amo"), ("père", "so")]
    grouped = group_by_lemma(pairs)
    # aimait → aimer, aimons → aimer
    assert "aimer" in grouped
    assert len(grouped["aimer"]) == 2
    assert "père" in grouped
