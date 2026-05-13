import pytest
from pipeline.scraper import parse_verses, merge_verse_pairs


def test_parse_verses_returns_list_of_dicts():
    raw = [
        {"verse": 1, "text": "Zezwii Kliisɩ"},
        {"verse": 2, "text": "Ablaamö mɔɔ gwälɩɛ Yizaakö"},
    ]
    result = parse_verses(raw)
    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["verse"] == 1
    assert result[0]["text"] == "Zezwii Kliisɩ"


def test_parse_verses_strips_whitespace():
    raw = [{"verse": 1, "text": "  Zezwii Kliisɩ  \n"}]
    result = parse_verses(raw)
    assert result[0]["text"] == "Zezwii Kliisɩ"


def test_merge_verse_pairs_aligns_by_verse_number():
    bete = [{"verse": 1, "text": "bete one"}, {"verse": 2, "text": "bete two"}]
    french = [{"verse": 1, "text": "french one"}, {"verse": 2, "text": "french two"}]
    result = merge_verse_pairs("MAT", 1, bete, french)
    assert len(result) == 2
    assert result[0]["bete_text"] == "bete one"
    assert result[0]["french_text"] == "french one"
    assert result[0]["book"] == "MAT"
    assert result[0]["chapter"] == 1
    assert result[0]["verse"] == 1


def test_merge_verse_pairs_skips_missing_french():
    bete = [{"verse": 1, "text": "bete one"}, {"verse": 2, "text": "bete two"}]
    french = [{"verse": 1, "text": "french one"}]
    result = merge_verse_pairs("MAT", 1, bete, french)
    assert len(result) == 1
    assert result[0]["verse"] == 1


def test_merge_verse_pairs_skips_missing_bete():
    bete = [{"verse": 2, "text": "bete two"}]
    french = [{"verse": 1, "text": "french one"}, {"verse": 2, "text": "french two"}]
    result = merge_verse_pairs("MAT", 1, bete, french)
    assert len(result) == 1
    assert result[0]["verse"] == 2
