from pipeline.config import DIALECTS, corpus_paths

def test_dialect_keys():
    assert set(DIALECTS.keys()) == {"western", "northern", "eastern"}

def test_dialect_fields():
    for d in DIALECTS.values():
        assert "bible_id" in d and "version" in d and "name" in d

def test_western_values():
    assert DIALECTS["western"]["bible_id"] == 3284
    assert DIALECTS["western"]["version"] == "BET"

def test_northern_values():
    assert DIALECTS["northern"]["bible_id"] == 3837
    assert DIALECTS["northern"]["version"] == "BTG"

def test_eastern_values():
    assert DIALECTS["eastern"]["bible_id"] == 4606
    assert DIALECTS["eastern"]["version"] == "BNT96"

def test_corpus_paths_structure():
    p = corpus_paths("western")
    for key in ("corpus_dir", "parallel_jsonl", "french_txt", "bete_txt",
                "forward_align", "reverse_align", "alignments_jsonl"):
        assert key in p

def test_corpus_paths_northern():
    p = corpus_paths("northern")
    assert p["parallel_jsonl"] == "corpus/northern/nt_parallel.jsonl"

def test_corpus_paths_invalid():
    try:
        corpus_paths("invalid")
        assert False
    except ValueError:
        pass
