# tests/test_phonetic.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from phonetic import to_phonetic

def test_maps_iota_to_i():
    assert to_phonetic("ɩ") == "i"

def test_maps_epsilon_to_e():
    assert to_phonetic("ɛ") == "e"

def test_maps_open_o_to_o():
    assert to_phonetic("ɔ") == "o"

def test_maps_upsilon_to_v():
    assert to_phonetic("ʋ") == "v"

def test_maps_o_umlaut_to_o():
    assert to_phonetic("ö") == "o"

def test_maps_a_umlaut_to_a():
    assert to_phonetic("ä") == "a"

def test_removes_apostrophe_prefix():
    # 'sɔ → so
    assert to_phonetic("'sɔ") == "so"

def test_removes_non_breaking_hyphen():
    # ‑nyɛ → nye
    assert to_phonetic("‑nyɛ") == "nye"

def test_full_word_gwalie():
    assert to_phonetic("gwälɩɛ") == "gwalie"

def test_full_word_mva():
    assert to_phonetic("mʋa") == "mva"

def test_lowercase_output():
    assert to_phonetic("Ablaamö") == "ablaamo"

def test_empty_string():
    assert to_phonetic("") == ""

def test_plain_ascii_unchanged():
    assert to_phonetic("bete") == "bete"
