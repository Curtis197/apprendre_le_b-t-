import json
import os
import tempfile
from pipeline.prepare_corpus import write_aligned_text_files, count_lines


def _write_jsonl(path: str, records: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def test_writes_one_line_per_verse():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        bete_txt = os.path.join(tmp, "bete.txt")
        french_txt = os.path.join(tmp, "french.txt")
        _write_jsonl(jsonl, [
            {"bete_text": "Ablaamö mɔɔ gwälɩɛ", "french_text": "Abraham engendra"},
            {"bete_text": "Yizaakö mɔɔ gwälɩɛ", "french_text": "Isaac engendra"},
        ])
        write_aligned_text_files(jsonl, bete_txt, french_txt)
        assert count_lines(bete_txt) == 2
        assert count_lines(french_txt) == 2


def test_bete_and_french_lines_stay_in_sync():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        bete_txt = os.path.join(tmp, "bete.txt")
        french_txt = os.path.join(tmp, "french.txt")
        _write_jsonl(jsonl, [
            {"bete_text": "bete line one", "french_text": "french line one"},
            {"bete_text": "bete line two", "french_text": "french line two"},
        ])
        write_aligned_text_files(jsonl, bete_txt, french_txt)
        with open(bete_txt, encoding="utf-8") as f:
            bete_lines = f.readlines()
        with open(french_txt, encoding="utf-8") as f:
            french_lines = f.readlines()
        assert bete_lines[0].strip() == "bete line one"
        assert french_lines[0].strip() == "french line one"
        assert bete_lines[1].strip() == "bete line two"
        assert french_lines[1].strip() == "french line two"


def test_empty_corpus_produces_empty_files():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        bete_txt = os.path.join(tmp, "bete.txt")
        french_txt = os.path.join(tmp, "french.txt")
        # Write empty JSONL
        open(jsonl, "w").close()
        write_aligned_text_files(jsonl, bete_txt, french_txt)
        assert count_lines(bete_txt) == 0
        assert count_lines(french_txt) == 0


def test_count_lines():
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        f.write("line1\nline2\nline3\n")
        path = f.name
    assert count_lines(path) == 3
    os.unlink(path)
