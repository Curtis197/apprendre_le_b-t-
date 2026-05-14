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

BETE_BIBLE_ID = 3284
FRENCH_BIBLE_ID = 93
BETE_VERSION = "BET"
FRENCH_VERSION = "LSG"

# NT books mapped to their chapter counts
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
RATE_LIMIT_SECONDS = 2

CORPUS_DIR = "corpus"
PARALLEL_JSONL   = f"{CORPUS_DIR}/nt_parallel.jsonl"
FRENCH_TXT      = f"{CORPUS_DIR}/french.txt"
BETE_TXT        = f"{CORPUS_DIR}/bete.txt"
FORWARD_ALIGN   = f"{CORPUS_DIR}/forward.align"
REVERSE_ALIGN   = f"{CORPUS_DIR}/reverse.align"
ALIGNMENTS_JSONL = f"{CORPUS_DIR}/alignments.jsonl"
