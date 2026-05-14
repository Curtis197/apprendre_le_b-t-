# pipeline/tag_pos.py
"""
Rule-based POS + semantic tagger for the Bété lexicon.

Tags applied:
  POS (exactly one): noun verb adj adv name num interj prep conj pron
  Semantic (0-n):    family nature body religion animal food place time action

Noisy entries (citation fragments like "1:15.je") are tagged ["fragment"].
Safe to re-run: skips entries that already have pos tags.
"""
import re
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

# ---------------------------------------------------------------------------
# Data tables
# ---------------------------------------------------------------------------

KNOWN: dict[str, list[str]] = {
    # ── Names / proper nouns ───────────────────────────────────────────────
    "aaron": ["name", "religion"], "abraham": ["name", "religion"],
    "adam": ["name", "religion"], "agrippa": ["name"],
    "amplias": ["name"], "andrée": ["name"], "apollos": ["name"],
    "babylone": ["name", "place"], "bethléhem": ["name", "place"],
    "christ": ["name", "religion"], "david": ["name", "religion"],
    "décapole": ["name", "place"], "élie": ["name", "religion"],
    "élisabeth": ["name"], "étienne": ["name", "religion"],
    "gethsémani": ["name", "place"], "gomorrhe": ["name", "place"],
    "isaac": ["name", "religion"], "isaïe": ["name", "religion"],
    "jacob": ["name", "religion"], "jaspe": ["name"],
    "jean": ["name", "religion"], "jésus": ["name", "religion"],
    "joël": ["name", "religion"], "josias": ["name", "religion"],
    "jourdain": ["name", "place", "nature"], "judas": ["name"],
    "lama": ["name", "religion"], "lazare": ["name"],
    "lot": ["name", "religion"], "marie": ["name"],
    "marthe": ["name"], "moïse": ["name", "religion"],
    "paul": ["name", "religion"], "philémon": ["name"],
    "pilate": ["name"], "salathiel": ["name", "religion"],
    "salmon": ["name"], "sardoine": ["name"],
    "sarepta": ["name", "place"], "simon": ["name"],
    "thomas": ["name"], "urbain": ["name"],
    "zacharie": ["name", "religion"],

    # ── Nouns – family ─────────────────────────────────────────────────────
    "belle-fille": ["noun", "family"], "enfant": ["noun", "family"],
    "époux": ["noun", "family"], "épouse": ["noun", "family"],
    "famille": ["noun", "family"], "femme": ["noun", "family"],
    "fille": ["noun", "family"], "fils": ["noun", "family"],
    "frère": ["noun", "family"], "garçon": ["noun", "family"],
    "mari": ["noun", "family"], "mère": ["noun", "family"],
    "neveu": ["noun", "family"], "père": ["noun", "family"],
    "sœur": ["noun", "family"],

    # ── Nouns – religion ───────────────────────────────────────────────────
    "abolition": ["noun", "religion"], "ange": ["noun", "religion"],
    "apôtre": ["noun", "religion"], "apôtres": ["noun", "religion"],
    "archange": ["noun", "religion"], "baptême": ["noun", "religion"],
    "baptiste": ["noun", "religion"],
    "croyant": ["noun", "religion"], "croyants": ["noun", "religion"],
    "diable": ["noun", "religion"], "dieu": ["noun", "religion"],
    "esprit": ["noun", "religion"], "évangile": ["noun", "religion"],
    "foi": ["noun", "religion"], "géhenne": ["noun", "religion", "place"],
    "gloire": ["noun", "religion"], "grâce": ["noun", "religion"],
    "immolé": ["noun", "religion"], "malin": ["noun", "religion"],
    "paix": ["noun", "religion"], "paradis": ["noun", "place", "religion"],
    "parole": ["noun", "religion"], "pasteur": ["noun", "religion"],
    "péché": ["noun", "religion"], "pécheur": ["noun", "religion"],
    "prière": ["noun", "religion"], "prophète": ["noun", "religion"],
    "résurrection": ["noun", "religion"], "roi": ["noun", "religion"],
    "royaume": ["noun", "religion", "place"], "sabbat": ["noun", "religion", "time"],
    "saint": ["noun", "religion"], "salut": ["noun", "religion"],
    "sceptre": ["noun", "religion"], "temple": ["noun", "religion", "place"],
    "trône": ["noun", "religion"],

    # ── Nouns – nature ─────────────────────────────────────────────────────
    "aile": ["noun", "nature"], "ailes": ["noun", "nature"],
    "arbre": ["noun", "nature"], "campagne": ["noun", "nature", "place"],
    "ciel": ["noun", "nature"], "côte": ["noun", "nature", "place"],
    "eau": ["noun", "nature"], "étoile": ["noun", "nature"],
    "étoiles": ["noun", "nature"], "feu": ["noun", "nature"],
    "fleur": ["noun", "nature"], "fondements": ["noun", "nature"],
    "montagne": ["noun", "nature", "place"], "pierre": ["noun", "nature"],
    "rocher": ["noun", "nature"], "soleil": ["noun", "nature"],
    "troupeau": ["noun", "nature", "animal"], "troupeaux": ["noun", "nature", "animal"],
    "vent": ["noun", "nature"],

    # ── Nouns – animal ─────────────────────────────────────────────────────
    "agneau": ["noun", "animal"], "âne": ["noun", "animal"],
    "ânesse": ["noun", "animal"], "brebis": ["noun", "animal"],
    "colombe": ["noun", "animal"], "pigeon": ["noun", "animal"],
    "pigeons": ["noun", "animal"], "poisson": ["noun", "animal"],
    "renard": ["noun", "animal"], "renards": ["noun", "animal"],
    "serpent": ["noun", "animal"],

    # ── Nouns – food/drink ─────────────────────────────────────────────────
    "faim": ["noun", "food"], "festin": ["noun", "food"],
    "huile": ["noun", "food"], "jeûne": ["noun", "food"],
    "levain": ["noun", "food"], "nourriture": ["noun", "food"],
    "pain": ["noun", "food"], "soif": ["noun", "food"],
    "vin": ["noun", "food"],

    # ── Nouns – body ───────────────────────────────────────────────────────
    "cœur": ["noun", "body"], "face": ["noun", "body"],
    "faces": ["noun", "body"], "main": ["noun", "body"],
    "nuditée": ["noun", "body"], "oreille": ["noun", "body"],
    "tête": ["noun", "body"], "yeux": ["noun", "body"],

    # ── Nouns – place ──────────────────────────────────────────────────────
    "chaire": ["noun", "place"], "chemin": ["noun", "place"],
    "chemins": ["noun", "place"], "contrée": ["noun", "place"],
    "jardin": ["noun", "place"], "maison": ["noun", "place"],
    "passage": ["noun", "place"], "portique": ["noun", "place"],
    "portiques": ["noun", "place"], "ville": ["noun", "place"],

    # ── Nouns – time ───────────────────────────────────────────────────────
    "âge": ["noun", "time"], "âges": ["noun", "time"],
    "heure": ["noun", "time"], "jour": ["noun", "time"],
    "lendemain": ["noun", "time"], "matin": ["noun", "time"],
    "nuit": ["noun", "time"], "quotidien": ["noun", "time"],

    # ── Nouns – general ────────────────────────────────────────────────────
    "affaire": ["noun"], "aiguillon": ["noun"],
    "berger": ["noun"], "but": ["noun"],
    "chant": ["noun"], "directeur": ["noun"],
    "effigie": ["noun"], "fardeau": ["noun"],
    "fl-ûte": ["noun"], "flûte": ["noun"],
    "forgeron": ["noun"], "gloire": ["noun"],
    "groupes": ["noun"], "groupe": ["noun"],
    "guérison": ["noun"], "guérisons": ["noun"],
    "insulte": ["noun"], "insultes": ["noun"],
    "juge": ["noun"], "juges": ["noun"],
    "loyauté": ["noun"], "magie": ["noun"],
    "misère": ["noun"], "obstacle": ["noun"],
    "offense": ["noun"], "opulence": ["noun"],
    "parabole": ["noun"], "paraboles": ["noun"],
    "perle": ["noun"], "persévérance": ["noun"],
    "prisonnier": ["noun"], "repos": ["noun"],
    "ruse": ["noun"], "secret": ["noun"],
    "secrets": ["noun"], "soldat": ["noun"],
    "tonnerres": ["noun"], "tourment": ["noun"],
    "tribulation": ["noun"], "trompette": ["noun"],
    "trompettes": ["noun"], "tuteur": ["noun"],
    "tuteurs": ["noun"], "veuve": ["noun"],
    "veuves": ["noun"], "vigneron": ["noun"],
    "vignerons": ["noun"], "vol": ["noun"],
    "vols": ["noun"], "vœu": ["noun"],
    "naissance": ["noun"], "faiblesses": ["noun"],
    "affection": ["noun"], "séduction": ["noun"],

    # ── Verbs ──────────────────────────────────────────────────────────────
    "accoucher": ["verb", "body"], "accomplir": ["verb", "action"],
    "adorer": ["verb", "religion"], "agir": ["verb", "action"],
    "aimer": ["verb", "action"], "appeler": ["verb", "action"],
    "assembler": ["verb", "action"], "bannir": ["verb", "action"],
    "chanter": ["verb", "action"], "condamner": ["verb", "action"],
    "continuer": ["verb", "action"], "couvrir": ["verb", "action"],
    "crucifier": ["verb", "action", "religion"], "décapiter": ["verb", "action"],
    "demander": ["verb", "action"], "demeurer": ["verb", "action"],
    "descendre": ["verb", "action"], "donner": ["verb", "action"],
    "dormir": ["verb", "action"], "écouter": ["verb", "action"],
    "élever": ["verb", "action"], "enseigner": ["verb", "action", "religion"],
    "envoyer": ["verb", "action"], "exalter": ["verb", "religion"],
    "exhorter": ["verb", "action"], "fermer": ["verb", "action"],
    "fuir": ["verb", "action"], "garder": ["verb", "action"],
    "glorifier": ["verb", "religion"], "haïr": ["verb", "action"],
    "humilier": ["verb", "action"], "jeûner": ["verb", "religion"],
    "lancer": ["verb", "action"], "laisser": ["verb", "action"],
    "marcher": ["verb", "action"], "marier": ["verb", "action", "family"],
    "mourir": ["verb", "action"], "nommer": ["verb", "action"],
    "obéir": ["verb", "action"], "offenser": ["verb", "action"],
    "opposer": ["verb", "action"], "parler": ["verb", "action"],
    "passer": ["verb", "action"], "permettre": ["verb", "action"],
    "persécuter": ["verb", "action"], "promettre": ["verb", "action"],
    "prophétiser": ["verb", "religion"], "rassasier": ["verb", "food"],
    "ravir": ["verb", "action"], "relâcher": ["verb", "action"],
    "rendre": ["verb", "action"], "renvoyer": ["verb", "action"],
    "réparer": ["verb", "action"], "ressembler": ["verb", "action"],
    "ressusciter": ["verb", "religion"], "retrancher": ["verb", "action"],
    "rire": ["verb", "action"], "savoir": ["verb", "action"],
    "scandaliser": ["verb", "action"], "suivre": ["verb", "action"],
    "troubler": ["verb", "action"], "vendre": ["verb", "action"],
    "vivre": ["verb", "action"],

    # ── Adjectives ─────────────────────────────────────────────────────────
    "attristé": ["adj"], "aveugle": ["adj", "body"],
    "béni": ["adj", "religion"], "bienheureuse": ["adj", "religion"],
    "bouillant": ["adj"], "condamné": ["adj"],
    "courbé": ["adj"], "couronné": ["adj", "religion"],
    "crucifié": ["adj", "religion"], "difficiles": ["adj"],
    "disposé": ["adj"], "étroit": ["adj"],
    "glorieux": ["adj", "religion"], "grand": ["adj"],
    "grands": ["adj"], "heureux": ["adj"],
    "heureuse": ["adj"], "humble": ["adj"],
    "illégitimes": ["adj"], "immobile": ["adj"],
    "inquiet": ["adj"], "insensés": ["adj"],
    "lâches": ["adj"], "libre": ["adj"],
    "loyal": ["adj"], "malin": ["adj"],
    "mauvais": ["adj"], "meurtri": ["adj"],
    "misérables": ["adj"], "nombreux": ["adj"],
    "principal": ["adj"], "raboteux": ["adj"],
    "rassasiés": ["adj"], "sage": ["adj"],
    "soumis": ["adj"], "troublé": ["adj"],

    # ── Adverbs ────────────────────────────────────────────────────────────
    "ainsi": ["adv"], "aussitôt": ["adv"],
    "bientôt": ["adv"], "déjà": ["adv"],
    "désormais": ["adv"], "encore": ["adv"],
    "mutuellement": ["adv"], "ouvertement": ["adv"],
    "particulier": ["adv"], "premièrement": ["adv"],
    "prochainement": ["adv"], "véritablement": ["adv"],

    # ── Pronouns ───────────────────────────────────────────────────────────
    "je": ["pron"], "il": ["pron"], "elle": ["pron"],
    "ils": ["pron"], "elles": ["pron"], "nous": ["pron"],
    "vous": ["pron"], "on": ["pron"], "qui": ["pron"],
    "que": ["pron"], "quiconque": ["pron"],
    "personne": ["pron"], "plusieurs": ["pron"],

    # ── Conjunctions / prepositions / particles ────────────────────────────
    "car": ["conj"], "mais": ["conj"], "et": ["conj"],
    "or": ["conj"], "afin": ["conj"], "comme": ["conj"],
    "si": ["conj"], "car,": ["conj"],
    "en": ["prep"], "de": ["prep"], "par": ["prep"],
    "pour": ["prep"], "avec": ["prep"], "sans": ["prep"],
    "dès": ["prep"], "la": ["prep"],
}

# Morphological suffix → POS heuristics (French)
VERB_SUFFIXES = (
    "ait", "aient", "ons", "eront", "erez", "iront", "aient",
    "er", "ir", "re", "ez", "ons", "aient", "ais",
)
NOUN_SUFFIXES = (
    "tion", "sion", "ment", "eur", "eurs", "ité", "ités",
    "ance", "ence", "age", "ages", "ure", "ures",
    "isme", "iste", "oire", "toire",
)
ADJ_SUFFIXES = (
    "eux", "euse", "euses", "eux", "al", "ale", "aux",
    "el", "elle", "iel", "ielle", "ique", "iques",
    "able", "ible", "if", "ive", "ant", "ante",
)
ADV_SUFFIXES = ("ment",)

# Regex for citation garbage: starts with digit(s) or contains ":"
_GARBAGE_RE = re.compile(r"^\d|:")


def _morph_tags(word: str) -> list[str]:
    """Guess tags from French word morphology."""
    w = word.lower().rstrip(".,;:?!")
    for s in ADV_SUFFIXES:
        if w.endswith(s) and len(w) > len(s) + 3:
            return ["adv"]
    for s in NOUN_SUFFIXES:
        if w.endswith(s):
            return ["noun"]
    for s in ADJ_SUFFIXES:
        if w.endswith(s):
            return ["adj"]
    # Past-participle or verb form heuristics
    if re.search(r"[aeiou][ée]s?$", w):
        return ["verb"]
    for s in VERB_SUFFIXES:
        if w.endswith(s):
            return ["verb"]
    # Default
    return ["noun"]


def classify(top_french: str) -> list[str]:
    raw = top_french.strip()

    # Garbage: citation fragments
    if not raw or _GARBAGE_RE.match(raw) or len(raw) <= 1:
        return ["fragment"]

    key = raw.lower().rstrip(".,;:?!\"'«»")

    if key in KNOWN:
        return KNOWN[key]

    # Try without trailing punctuation variants
    key2 = re.sub(r"[^a-zàâäéèêëîïôùûüç'-]", "", key)
    if key2 in KNOWN:
        return KNOWN[key2]

    # Capitalized single word → likely proper name
    if raw[0].isupper() and " " not in raw:
        return ["name"]

    return _morph_tags(key2 or key)


def tag_pos() -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    entries = (
        supabase.table("lexicon")
        .select("id,bete_word,top_french")
        .is_("pos", "null")
        .execute()
        .data or []
    )

    if not entries:
        print("All entries already tagged.")
        return

    print(f"Tagging {len(entries)} entries...")

    counts: dict[str, int] = {}
    for entry in entries:
        tags = classify(entry["top_french"])
        supabase.table("lexicon").update({"pos": tags}).eq("id", entry["id"]).execute()
        key = tags[0]
        counts[key] = counts.get(key, 0) + 1

    print("Done. Distribution:")
    for tag, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {tag:12s} {n}")


if __name__ == "__main__":
    tag_pos()
