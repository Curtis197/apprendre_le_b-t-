# pipeline/phonetic.py

CHAR_MAP: dict[str, str] = {
    # Vowels
    "ɩ": "i",  "Ɩ": "i",
    "ɛ": "e",  "Ɛ": "e",
    "ɔ": "o",  "Ɔ": "o",
    "ö": "o",  "Ö": "o",
    "ä": "a",  "Ä": "a",
    "ë": "e",  "Ë": "e",
    "ü": "u",  "Ü": "u",
    "ï": "i",  "Ï": "i",
    # Consonants
    "ʋ": "v",  "Ʋ": "v",
    "ŋ": "ng", "Ŋ": "ng",
}

STRIP_CHARS: frozenset[str] = frozenset([
    "'",       # apostrophe prefix
    "‘",  # left single quotation mark
    "’",  # right single quotation mark
    "ʼ",  # modifier letter apostrophe
    "‑",  # non-breaking hyphen
    "‐",  # hyphen
    "‒",  # figure dash
])


def to_phonetic(word: str) -> str:
    """
    Convert a Bété word in standard orthography to its simplified phonetic form.
    - Special Bété characters mapped to ASCII (CHAR_MAP)
    - Tone markers and prefix apostrophes removed (STRIP_CHARS)
    - Output lowercased
    """
    result: list[str] = []
    for ch in word:
        if ch in STRIP_CHARS:
            continue
        result.append(CHAR_MAP.get(ch, ch))
    return "".join(result).lower()
