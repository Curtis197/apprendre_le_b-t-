import os
from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.local", override=True)

_project_id = os.environ.get("SUPABASE_PROJECT_ID", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", f"https://{_project_id}.supabase.co" if _project_id else "")
SUPABASE_SERVICE_KEY = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
)

DIALECTS: dict[str, dict] = {
    "western":  {"bible_id": 3284, "version": "BET",   "name": "Bété Occidental (Guiberoua)"},
    "northern": {"bible_id": 3837, "version": "BTG",   "name": "Bété Septentrional (Gagnoa)"},
    "eastern":  {"bible_id": 4606, "version": "BNT96", "name": "Bété Oriental (Daloa)"},
}

# Backward-compat constants
BETE_BIBLE_ID = DIALECTS["western"]["bible_id"]
BETE_VERSION  = DIALECTS["western"]["version"]
FRENCH_BIBLE_ID = 93
FRENCH_VERSION  = "LSG"

NT_BOOKS = {
    "MAT": 28, "MRK": 16, "LUK": 24, "JHN": 21,
    "ACT": 28, "ROM": 16, "1CO": 16, "2CO": 13,
    "GAL": 6,  "EPH": 6,  "PHP": 4,  "COL": 4,
    "1TH": 5,  "2TH": 3,  "1TI": 6,  "2TI": 4,
    "TIT": 3,  "PHM": 1,  "HEB": 13, "JAS": 5,
    "1PE": 5,  "2PE": 3,  "1JN": 5,  "2JN": 1,
    "3JN": 1,  "JUD": 1,  "REV": 22,
}

ALIGNMENT_THRESHOLD = 0.1
RATE_LIMIT_SECONDS  = 2
CORPUS_DIR = "corpus"


def corpus_paths(dialect: str) -> dict[str, str]:
    """Return per-dialect corpus file paths. Raises ValueError for unknown dialects."""
    if dialect not in DIALECTS:
        raise ValueError(f"Unknown dialect {dialect!r}. Valid: {list(DIALECTS)}")
    base = f"{CORPUS_DIR}/{dialect}"
    return {
        "corpus_dir":      base,
        "parallel_jsonl":  f"{base}/nt_parallel.jsonl",
        "french_txt":      f"{base}/french.txt",
        "bete_txt":        f"{base}/bete.txt",
        "forward_align":   f"{base}/forward.align",
        "reverse_align":   f"{base}/reverse.align",
        "alignments_jsonl": f"{base}/alignments.jsonl",
    }


# Backward-compat flat constants (western)
_w = corpus_paths("western")
PARALLEL_JSONL   = _w["parallel_jsonl"]
FRENCH_TXT       = _w["french_txt"]
BETE_TXT         = _w["bete_txt"]
FORWARD_ALIGN    = _w["forward_align"]
REVERSE_ALIGN    = _w["reverse_align"]
ALIGNMENTS_JSONL = _w["alignments_jsonl"]
