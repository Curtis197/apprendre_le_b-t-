# tests/test_align.py
import os
import tempfile
import json
from pipeline.align import extract_probabilities


def _write_file(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _write_jsonl(path: str, records: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def test_extract_basic_alignment():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        align = os.path.join(tmp, "forward.align")
        _write_jsonl(jsonl, [
            {"french_text": "Abraham engendra Isaac",
             "bete_text": "Ablaamö mɔɔ gwälɩɛ Yizaakö",
             "book": "MAT", "chapter": 1, "verse": 2},
        ])
        # 0-0 means french[0]="abraham" → bete[0]="ablaamö"
        _write_file(align, "0-0 1-1 2-2 3-3\n")
        results = extract_probabilities(jsonl, align, threshold=0.0)
        words = {r["french_word"]: r["bete_word"] for r in results}
        assert words["abraham"] == "ablaamö"
        assert words["engendra"] == "mɔɔ"


def test_extract_respects_threshold():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        align = os.path.join(tmp, "forward.align")
        _write_jsonl(jsonl, [
            {"french_text": "Abraham engendra Isaac",
             "bete_text": "Ablaamö mɔɔ gwälɩɛ Yizaakö",
             "book": "MAT", "chapter": 1, "verse": 2},
            {"french_text": "Isaac engendra Jacob",
             "bete_text": "Yizaakö mɔɔ gwälɩɛ Zakɔɔbö",
             "book": "MAT", "chapter": 1, "verse": 3},
        ])
        _write_file(align, "0-0 1-1 2-2 3-3\n0-0 1-1 2-2 3-3\n")
        results_all = extract_probabilities(jsonl, align, threshold=0.0)
        results_high = extract_probabilities(jsonl, align, threshold=0.9)
        assert len(results_all) >= len(results_high)


def test_output_has_required_keys():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        align = os.path.join(tmp, "forward.align")
        _write_jsonl(jsonl, [
            {"french_text": "Abraham engendra",
             "bete_text": "Ablaamö mɔɔ",
             "book": "MAT", "chapter": 1, "verse": 2},
        ])
        _write_file(align, "0-0 1-1\n")
        results = extract_probabilities(jsonl, align, threshold=0.0)
        assert results
        for r in results:
            assert "french_word" in r
            assert "bete_word" in r
            assert "score" in r
            assert 0.0 <= r["score"] <= 1.0
