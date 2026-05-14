# pipeline/mine_grammar.py
"""
Mine basic grammatical patterns from the parallel French/Bété corpus.

Approach: for each French grammatical construction (negation, questions,
imperatives, prepositions, tense), find Bété words that co-occur
significantly more than by chance (lift >= threshold). These are
candidate grammatical markers.

Safe to re-run: checks for existing rules before inserting.
"""
import re
import sys
from collections import Counter, defaultdict
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

sys.stdout.reconfigure(encoding="utf-8")

MIN_SUPPORT = 6      # minimum occurrences in pattern verses
LIFT_THRESHOLD = 2.5  # how much more frequent in pattern vs baseline
PREP_MIN_COUNT = 3   # minimum alignment occurrences for preposition rule

SUBJECT_PRONOUNS = {"je", "j", "tu", "il", "elle", "nous", "vous", "ils", "elles", "on"}


def tokenize_bete(text: str) -> list[str]:
    return [
        w.strip("''\"«»(),.:;!?‑-").lower()
        for w in text.split()
        if w.strip("''\"«»(),.:;!?‑-")
    ]


def find_markers(
    pattern_verses: list[dict],
    all_verses: list[dict],
    min_support: int = MIN_SUPPORT,
    lift_threshold: float = LIFT_THRESHOLD,
) -> list[tuple[str, int, float]]:
    """
    Find Bété words significantly over-represented in pattern_verses
    compared to the full corpus. Returns (word, count, lift) triples.
    """
    n_pattern = len(pattern_verses)
    n_all = len(all_verses)
    if n_pattern < min_support:
        return []

    pattern_counts = Counter(
        w for v in pattern_verses for w in tokenize_bete(v["bete_text"])
    )
    all_counts = Counter(
        w for v in all_verses for w in tokenize_bete(v["bete_text"])
    )

    results = []
    for word, count in pattern_counts.items():
        if count < min_support or len(word) < 2:
            continue
        freq_pattern = count / n_pattern
        freq_all = all_counts[word] / n_all
        if freq_all > 0:
            lift = freq_pattern / freq_all
            if lift >= lift_threshold:
                results.append((word, count, round(lift, 2)))

    results.sort(key=lambda x: -x[2])
    return results


def mine_grammar() -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    verses = client.table("verses").select("bete_text,french_text").execute().data or []
    print(f"Loaded {len(verses)} verses\n")

    rules: list[dict] = []

    # ── 1. NEGATION ──────────────────────────────────────────────────────────
    neg_re = re.compile(
        r"\bne\b.{0,50}\b(pas|plus|jamais|rien|guère|point|nul)\b", re.IGNORECASE
    )
    neg_verses = [v for v in verses if neg_re.search(v["french_text"])]
    neg_markers = find_markers(neg_verses, verses)
    print(f"Négation — {len(neg_verses)} versets:")
    for w, c, l in neg_markers[:5]:
        print(f"  {w:15s}  count={c}  lift={l}")
    if neg_markers:
        top = neg_markers[0][0]
        rules.append({
            "category": "other",
            "pattern_french": "ne … pas / ne … plus / ne … jamais",
            "pattern_bete": f"… {top} …",
            "description": (
                f"Marqueur de négation. '{top}' apparaît {neg_markers[0][2]}× "
                f"plus souvent dans les {len(neg_verses)} versets négatifs que "
                f"dans l'ensemble du corpus."
            ),
            "validated": False,
        })

    # ── 2. INTERROGATION ────────────────────────────────────────────────────
    q_verses = [v for v in verses if "?" in v["french_text"]]
    q_markers = find_markers(q_verses, verses)
    print(f"\nInterrogation — {len(q_verses)} versets:")
    for w, c, l in q_markers[:5]:
        print(f"  {w:15s}  count={c}  lift={l}")
    if q_markers:
        top = q_markers[0][0]
        rules.append({
            "category": "other",
            "pattern_french": "phrase interrogative ( … ? )",
            "pattern_bete": f"… {top}",
            "description": (
                f"Marqueur interrogatif. '{top}' co-apparaît {q_markers[0][2]}× "
                f"plus dans les {len(q_verses)} versets interrogatifs."
            ),
            "validated": False,
        })

    # ── 3. IMPÉRATIF ────────────────────────────────────────────────────────
    imp_verses = []
    for v in verses:
        words = v["french_text"].split()
        if not words:
            continue
        first = words[0].lower().rstrip("'")
        if first not in SUBJECT_PRONOUNS and words[0][0].isupper() and len(words) > 2:
            imp_verses.append(v)
    imp_markers = find_markers(imp_verses, verses)
    print(f"\nImpératif — {len(imp_verses)} versets:")
    for w, c, l in imp_markers[:5]:
        print(f"  {w:15s}  count={c}  lift={l}")
    if imp_markers:
        top = imp_markers[0][0]
        rules.append({
            "category": "verb",
            "pattern_french": "verbe à l'impératif (phrase sans pronom sujet)",
            "pattern_bete": f"{top} …",
            "description": (
                f"Structure impérative. '{top}' apparaît {imp_markers[0][2]}× "
                f"plus souvent en tête de phrase dans les {len(imp_verses)} "
                f"versets impératifs."
            ),
            "validated": False,
        })

    # ── 4. PRÉPOSITIONS (from alignment table) ───────────────────────────────
    alignments = (
        client.table("alignments")
        .select("french_word,bete_word,score")
        .gte("score", 0.25)
        .execute()
        .data or []
    )
    FR_PREPS = {"à", "de", "en", "avec", "pour", "dans", "sur", "par", "vers", "sous", "entre"}
    prep_map: dict[str, list[str]] = defaultdict(list)
    for a in alignments:
        fw = a["french_word"].lower().strip("''\"(),.:;!?")
        if fw in FR_PREPS:
            prep_map[fw].append(a["bete_word"])

    print(f"\nPrépositions:")
    for prep in sorted(prep_map):
        top = Counter(prep_map[prep]).most_common(3)
        print(f"  {prep:6s} → {top}")
        if top and top[0][1] >= PREP_MIN_COUNT:
            bete_equiv = top[0][0]
            rules.append({
                "category": "other",
                "pattern_french": f"préposition « {prep} »",
                "pattern_bete": bete_equiv,
                "description": (
                    f"La préposition '{prep}' correspond à '{bete_equiv}' "
                    f"({top[0][1]} occurrences dans les alignements)."
                ),
                "validated": False,
            })

    # ── 5. PASSÉ vs PRÉSENT ──────────────────────────────────────────────────
    past_re = re.compile(
        r"\b(avait|avaient|était|étaient|fut|furent|avons|avez|ont)\b"
        r"|\b\w+[éèêë]e?s?\b",
        re.IGNORECASE,
    )
    future_re = re.compile(r"\b\w+(ra|ront|rez|rons)\b", re.IGNORECASE)

    past_verses = [v for v in verses if past_re.search(v["french_text"])]
    future_verses = [v for v in verses if future_re.search(v["french_text"])]

    past_markers = find_markers(past_verses, verses)
    future_markers = find_markers(future_verses, verses)

    print(f"\nPassé — {len(past_verses)} versets:")
    for w, c, l in past_markers[:5]:
        print(f"  {w:15s}  count={c}  lift={l}")

    print(f"\nFutur — {len(future_verses)} versets:")
    for w, c, l in future_markers[:5]:
        print(f"  {w:15s}  count={c}  lift={l}")

    if past_markers:
        top = past_markers[0][0]
        rules.append({
            "category": "tense",
            "pattern_french": "passé composé / passé simple (avait, fut, … -é)",
            "pattern_bete": f"… {top} …",
            "description": (
                f"Marqueur aspectuel du passé. '{top}' apparaît {past_markers[0][2]}× "
                f"plus souvent dans les {len(past_verses)} versets au passé."
            ),
            "validated": False,
        })
    if future_markers:
        top = future_markers[0][0]
        rules.append({
            "category": "tense",
            "pattern_french": "futur simple (… -ra / -ront)",
            "pattern_bete": f"… {top} …",
            "description": (
                f"Marqueur aspectuel du futur. '{top}' apparaît {future_markers[0][2]}× "
                f"plus souvent dans les {len(future_verses)} versets au futur."
            ),
            "validated": False,
        })

    # ── 6. WORD ORDER: subject position ──────────────────────────────────────
    # Compare average sentence length ratio as a proxy for agglutinative
    # vs analytic structure
    bete_longer = sum(
        1 for v in verses
        if len(v["bete_text"].split()) > len(v["french_text"].split())
    )
    ratio = bete_longer / len(verses) if verses else 0
    print(f"\nOrdre des mots — Bété sentence longer than French: {bete_longer}/{len(verses)} ({ratio:.0%})")

    # ── INSERT ────────────────────────────────────────────────────────────────
    # Avoid duplicates
    existing = {
        r["pattern_french"]
        for r in (client.table("grammar_rules").select("pattern_french").execute().data or [])
    }

    print(f"\nInserting {len(rules)} candidate rules...")
    inserted = 0
    for rule in rules:
        if rule["pattern_french"] in existing:
            print(f"  Skip (exists): {rule['pattern_french']}")
            continue
        try:
            client.table("grammar_rules").insert(rule).execute()
            print(f"  + [{rule['category']}] {rule['pattern_french']} → {rule['pattern_bete']}")
            inserted += 1
        except Exception as exc:
            print(f"  Error: {exc}")

    print(f"\nDone: {inserted} rules inserted.")


if __name__ == "__main__":
    mine_grammar()
