# tests/test_vectorize_grammar.py
from pipeline.vectorize_grammar import build_rule_text

def test_build_rule_text_with_description():
    rule = {
        "pattern_french": "SVO",
        "description": "Le verbe suit le sujet directement",
    }
    text = build_rule_text(rule)
    assert "SVO" in text
    assert "verbe" in text

def test_build_rule_text_minimal():
    rule = {"pattern_french": "négation", "description": ""}
    text = build_rule_text(rule)
    assert "négation" in text
    assert isinstance(text, str)
    assert len(text) > 0

def test_build_rule_text_both_parts_joined():
    rule = {"pattern_french": "ordre", "description": "sujet-verbe-objet"}
    text = build_rule_text(rule)
    assert "ordre" in text
    assert "sujet" in text
