import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from pipeline.config import (
    NT_BOOKS, BETE_BIBLE_ID, FRENCH_BIBLE_ID,
    BETE_VERSION, FRENCH_VERSION,
    PARALLEL_JSONL, CORPUS_DIR, RATE_LIMIT_SECONDS,
)

BIBLE_URL = "https://www.bible.com/bible/{bible_id}/{book}.{chapter}.{version}"


def parse_verses(raw: list[dict]) -> list[dict]:
    """Normalise raw verse dicts: strip whitespace from text."""
    return [{"verse": v["verse"], "text": v["text"].strip()} for v in raw]


def merge_verse_pairs(
    book: str, chapter: int,
    bete_verses: list[dict],
    french_verses: list[dict],
) -> list[dict]:
    """
    Align Bété and French verses by verse number.
    Only verses present in BOTH lists are included.
    """
    french_map = {v["verse"]: v["text"] for v in french_verses}
    pairs = []
    for bv in bete_verses:
        fn = french_map.get(bv["verse"])
        if fn is not None:
            pairs.append({
                "book": book,
                "chapter": chapter,
                "verse": bv["verse"],
                "bete_text": bv["text"],
                "french_text": fn,
            })
    return pairs


async def _scrape_chapter(
    page,
    book: str,
    chapter: int,
    bible_id: int,
    version: str,
) -> list[dict]:
    """
    Scrape a single chapter from bible.com.
    Returns list of {verse, text} dicts.
    """
    url = BIBLE_URL.format(
        bible_id=bible_id, book=book, chapter=chapter, version=version
    )
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_selector("[data-usfm]", timeout=15_000)
    except PlaywrightTimeout:
        print(f"  Timeout: {book} {chapter} {version} — skipping")
        return []

    verses = await page.evaluate("""() => {
        const results = [];
        document.querySelectorAll('[data-usfm]').forEach(el => {
            const usfm = el.getAttribute('data-usfm');
            const parts = usfm.split('.');
            if (parts.length !== 3) return;
            const verseNum = parseInt(parts[2], 10);
            if (isNaN(verseNum)) return;
            const clone = el.cloneNode(true);
            const label = clone.querySelector('.label');
            if (label) label.remove();
            const text = (clone.innerText || clone.textContent || '')
                .trim().replace(/\\s+/g, ' ');
            if (text) results.push({ verse: verseNum, text });
        });
        return results;
    }""")
    return verses


async def scrape_nt(output_path: str = PARALLEL_JSONL) -> None:
    """
    Scrape the full NT in Bété and French, saving verse pairs to JSONL.
    Safe to re-run: resumes from where it left off if output file exists.
    """
    Path(CORPUS_DIR).mkdir(exist_ok=True)

    # Build set of already-scraped (book, chapter) pairs for resume support
    done: set[tuple[str, int]] = set()
    if Path(output_path).exists():
        with open(output_path, "r", encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                done.add((rec["book"], rec["chapter"]))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Research project — Bété language preservation)"
            )
        )
        page = await context.new_page()

        with open(output_path, "a", encoding="utf-8") as out:
            for book, num_chapters in NT_BOOKS.items():
                for chapter in range(1, num_chapters + 1):
                    if (book, chapter) in done:
                        print(f"  Skip (cached): {book} {chapter}")
                        continue

                    print(f"  Scraping {book} {chapter}...")
                    bete = parse_verses(
                        await _scrape_chapter(
                            page, book, chapter, BETE_BIBLE_ID, BETE_VERSION
                        )
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)

                    french = parse_verses(
                        await _scrape_chapter(
                            page, book, chapter, FRENCH_BIBLE_ID, FRENCH_VERSION
                        )
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)

                    pairs = merge_verse_pairs(book, chapter, bete, french)
                    for pair in pairs:
                        out.write(json.dumps(pair, ensure_ascii=False) + "\n")
                    out.flush()  # ensure data is written to disk before next chapter
                    print(f"    → {len(pairs)} verse pairs")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(scrape_nt())
