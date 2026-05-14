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


def _write_plain(path: str, lines: list[str]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for line in lines:
            f.write(line + "\n")


def test_extract_basic_alignment():
    with tempfile.TemporaryDirectory() as tmp:
        french_txt = os.path.join(tmp, "french.txt")
        bete_txt = os.path.join(tmp, "bete.txt")
        align = os.path.join(tmp, "forward.align")
        _write_plain(french_txt, ["Abraham engendra Isaac"])
        _write_plain(bete_txt, ["Ablaamö mɔɔ gwälɩɛ Yizaakö"])
        # 0-0 means french[0]="abraham" → bete[0]="ablaamö"
        _write_file(align, "0-0 1-1 2-2 3-3\n")
        results = extract_probabilities(french_txt, bete_txt, align, threshold=0.0)
        words = {r["french_word"]: r["bete_word"] for r in results}
        assert words["abraham"] == "ablaamö"
        assert words["engendra"] == "mɔɔ"


def test_extract_respects_threshold():
    with tempfile.TemporaryDirectory() as tmp:
        french_txt = os.path.join(tmp, "french.txt")
        bete_txt = os.path.join(tmp, "bete.txt")
        align = os.path.join(tmp, "forward.align")
        _write_plain(french_txt, [
            "Abraham engendra Isaac",
            "Isaac engendra Jacob",
        ])
        _write_plain(bete_txt, [
            "Ablaamö mɔɔ gwälɩɛ Yizaakö",
            "Yizaakö mɔɔ gwälɩɛ Zakɔɔbö",
        ])
        _write_file(align, "0-0 1-1 2-2 3-3\n0-0 1-1 2-2 3-3\n")
        results_all = extract_probabilities(french_txt, bete_txt, align, threshold=0.0)
        results_high = extract_probabilities(french_txt, bete_txt, align, threshold=0.9)
        assert len(results_all) >= len(results_high)


def test_output_has_required_keys():
    with tempfile.TemporaryDirectory() as tmp:
        french_txt = os.path.join(tmp, "french.txt")
        bete_txt = os.path.join(tmp, "bete.txt")
        align = os.path.join(tmp, "forward.align")
        _write_plain(french_txt, ["Abraham engendra"])
        _write_plain(bete_txt, ["Ablaamö mɔɔ"])
        _write_file(align, "0-0 1-1\n")
        results = extract_probabilities(french_txt, bete_txt, align, threshold=0.0)
        assert results
        for r in results:
            assert "french_word" in r
            assert "bete_word" in r
            assert "score" in r
            assert 0.0 <= r["score"] <= 1.0


def test_malformed_tokens_are_skipped():
    with tempfile.TemporaryDirectory() as tmp:
        french_txt = os.path.join(tmp, "french.txt")
        bete_txt = os.path.join(tmp, "bete.txt")
        align = os.path.join(tmp, "forward.align")
        _write_plain(french_txt, ["Abraham engendra"])
        _write_plain(bete_txt, ["Ablaamö mɔɔ"])
        # "a-b" is malformed, "0-0" is valid
        _write_file(align, "0-0 a-b 1-1\n")
        results = extract_probabilities(french_txt, bete_txt, align, threshold=0.0)
        # Should not crash, and should return the valid alignments
        assert results
        words = {r["french_word"]: r["bete_word"] for r in results}
        assert words["abraham"] == "ablaamö"
