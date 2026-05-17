# pipeline/update_lemmas.py
"""
Step 10: Populate lexicon.french_lemma by lemmatizing each lexicon.top_french.
Uses the same suffix-stripping rules as web/lib/lemmatizer.ts for consistency.
Safe to re-run: skips entries that already have french_lemma set.
"""
import re
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS

IRREGULARS = {
    # être
    "suis": "être", "es": "être", "est": "être", "sommes": "être", "êtes": "être", "sont": "être",
    "étais": "être", "était": "être", "étions": "être", "étiez": "être", "étaient": "être",
    "été": "être",
    # avoir
    "ai": "avoir", "as": "avoir", "avons": "avoir", "avez": "avoir", "ont": "avoir",
    "avais": "avoir", "avait": "avoir", "avions": "avoir", "aviez": "avoir", "avaient": "avoir",
    "eu": "avoir",
    # aller
    "vais": "aller", "vas": "aller", "va": "aller", "allons": "aller", "allez": "aller", "vont": "aller",
    "allais": "aller", "allait": "aller", "allaient": "aller",
    # faire
    "fais": "faire", "fait": "faire", "faisons": "faire", "faites": "faire", "font": "faire",
    "faisais": "faire", "faisait": "faire", "faisaient": "faire",
    # pouvoir
    "peux": "pouvoir", "peut": "pouvoir", "pouvons": "pouvoir", "pouvez": "pouvoir", "peuvent": "pouvoir",
    "pouvait": "pouvoir",
    # vouloir
    "veux": "vouloir", "veut": "vouloir", "voulons": "vouloir", "voulez": "vouloir", "veulent": "vouloir",
    "voulait": "vouloir",
    # venir
    "viens": "venir", "vient": "venir", "venons": "venir", "venez": "venir", "viennent": "venir",
    "venait": "venir",
    # voir
    "vois": "voir", "voit": "voir", "voyons": "voir", "voyez": "voir", "voient": "voir",
    "voyait": "voir",
    # irregular plurals
    "chevaux": "cheval", "journaux": "journal", "travaux": "travail", "yeux": "œil",
}

STOPWORDS = {
    "le", "la", "les", "un", "une", "des", "du", "au", "aux", "de",
    "et", "ou", "mais", "donc", "or", "ni", "car", "si", "que", "qui", "dont",
    "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "on",
    "me", "te", "se", "lui", "y", "en", "ce", "cet", "cette", "ces",
    "mon", "ton", "son", "ma", "ta", "sa", "nos", "vos", "leur", "leurs",
    "pas", "plus", "très", "bien", "tout", "aussi", "même", "ne",
}

# (suffix, replacement, min_stem_length) — longest first
RULES = [
    ("issaient", "ir", 3),
    ("issions",  "ir", 3),
    ("issons",   "ir", 3),
    ("issiez",   "ir", 3),
    ("issait",   "ir", 3),
    ("issant",   "ir", 3),
    ("issez",    "ir", 3),
    ("issent",   "ir", 3),
    ("aient",    "er", 3),
    ("eront",    "er", 3),
    ("erons",    "er", 3),
    ("erez",     "er", 3),
    ("ées",      "er", 3),
    ("ant",      "er", 3),
    ("ait",      "er", 3),
    ("ons",      "er", 3),
    ("ée",       "er", 3),
    ("és",       "er", 3),
    ("ez",       "er", 3),
    ("es",       "e",  4),
    ("s",        "",   4),
]

_STRIP_RE = re.compile(r"[.,!?;:«»\"''']")


def lemmatize_fr(word: str) -> str:
    w = _STRIP_RE.sub("", word).lower().strip()
    if not w or len(w) <= 2:
        return w
    if w in STOPWORDS:
        return w
    if w in IRREGULARS:
        return IRREGULARS[w]
    for suffix, replacement, min_stem in RULES:
        if w.endswith(suffix) and len(w) - len(suffix) >= min_stem:
            return w[: len(w) - len(suffix)] + replacement
    return w


def update_lemmas(dialect: str = "western") -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    entries = (
        client.table("lexicon")
        .select("id,top_french")
        .eq("dialect", dialect)
        .is_("french_lemma", "null")
        .execute()
        .data or []
    )
    if not entries:
        print(f"All {dialect} entries already have french_lemma.")
        return

    print(f"Updating {len(entries)} {dialect} entries...")
    batch_size = 500
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        for entry in batch:
            lemma = lemmatize_fr(entry["top_french"])
            client.table("lexicon").update({"french_lemma": lemma}).eq("id", entry["id"]).execute()
        print(f"  {min(i + batch_size, len(entries))}/{len(entries)}")
    print("Done.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    update_lemmas(dialect=args.dialect)
