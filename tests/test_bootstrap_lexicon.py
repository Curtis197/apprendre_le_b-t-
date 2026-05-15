# tests/test_bootstrap_lexicon.py
from pipeline.bootstrap_lexicon import build_lexicon_from_alignments, group_by_bete_word


def test_group_by_bete_word_sorts_by_score():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
        {"french_word": "genera",   "bete_word": "gwälɩɛ", "score": 0.3},
        {"french_word": "fit",      "bete_word": "gwälɩɛ", "score": 0.5},
    ]
    result = group_by_bete_word(alignments)
    assert result["gwälɩɛ"][0]["word"] == "engendra"   # highest score first
    assert result["gwälɩɛ"][1]["word"] == "fit"
    assert result["gwälɩɛ"][2]["word"] == "genera"


def test_build_lexicon_entry_shape():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
    ]
    entries = build_lexicon_from_alignments(alignments)
    assert len(entries) == 1
    e = entries[0]
    assert e["bete_word"] == "gwälɩɛ"
    assert e["bete_phonetic"] == "gwalie"
    assert e["top_french"] == "engendra"
    assert e["probability"] == 0.8
    assert e["validated"] is False
    assert isinstance(e["french_candidates"], list)
    assert e["french_candidates"][0] == {"word": "engendra", "score": 0.8}


def test_build_lexicon_deduplicates_bete_words():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
        {"french_word": "genera",   "bete_word": "gwälɩɛ", "score": 0.3},
    ]
    entries = build_lexicon_from_alignments(alignments)
    assert len(entries) == 1     # one entry per Bété word


def test_build_lexicon_multiple_words():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
        {"french_word": "abraham",  "bete_word": "ablaamö", "score": 0.9},
    ]
    entries = build_lexicon_from_alignments(alignments)
    bete_words = {e["bete_word"] for e in entries}
    assert "gwälɩɛ" in bete_words
    assert "ablaamö" in bete_words


def test_build_lexicon_entries_tagged_with_dialect():
    from pipeline.bootstrap_lexicon import build_lexicon_from_alignments
    alns = [{"bete_word": "n", "french_word": "je", "score": 0.9}]
    entries = build_lexicon_from_alignments(alns, dialect="northern")
    assert entries[0]["dialect"] == "northern"

def test_build_lexicon_entries_default_western():
    from pipeline.bootstrap_lexicon import build_lexicon_from_alignments
    alns = [{"bete_word": "n", "french_word": "je", "score": 0.9}]
    entries = build_lexicon_from_alignments(alns)
    assert entries[0]["dialect"] == "western"
