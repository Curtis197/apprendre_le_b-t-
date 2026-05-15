import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from pipeline.config import (
    NT_BOOKS, FRENCH_BIBLE_ID, FRENCH_VERSION,
    DIALECTS, corpus_paths, RATE_LIMIT_SECONDS,
)

BIBLE_URL = "https://www.bible.com/bible/{bible_id}/{book}.{chapter}.{version}"


def parse_verses(raw: list[dict]) -> list[dict]:
    return [{"verse": v["verse"], "text": v["text"].strip()} for v in raw]


def merge_verse_pairs(
    book: str, chapter: int, dialect: str,
    bete_verses: list[dict],
    french_verses: list[dict],
) -> list[dict]:
    french_map = {v["verse"]: v["text"] for v in french_verses}
    pairs = []
    for bv in bete_verses:
        fn = french_map.get(bv["verse"])
        if fn is not None:
            pairs.append({
                "book": book, "chapter": chapter, "verse": bv["verse"],
                "dialect": dialect, "bete_text": bv["text"], "french_text": fn,
            })
    return pairs


async def _scrape_chapter(page, book: str, chapter: int, bible_id: int, version: str) -> list[dict]:
    url = BIBLE_URL.format(bible_id=bible_id, book=book, chapter=chapter, version=version)
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_selector("[data-usfm]", timeout=15_000)
    except PlaywrightTimeout:
        print(f"  Timeout: {book} {chapter} {version} — skipping")
        return []
    verses = await page.evaluate("""([book, chapter]) => {
        const prefix = book + '.' + chapter + '.';
        const results = [];
        document.querySelectorAll('[data-usfm]').forEach(el => {
            const usfm = el.getAttribute('data-usfm');
            if (!usfm.startsWith(prefix)) return;
            const parts = usfm.split('.');
            if (parts.length !== 3) return;
            const verseNum = parseInt(parts[2], 10);
            if (isNaN(verseNum)) return;
            const clone = el.cloneNode(true);
            const label = clone.querySelector('.label');
            if (label) label.remove();
            const text = (clone.innerText || clone.textContent || '').trim().replace(/\\s+/g, ' ');
            if (text) results.push({ verse: verseNum, text });
        });
        return results;
    }""", [book, chapter])
    return verses


async def scrape_nt(dialect: str = "western", output_path: str | None = None) -> None:
    """Scrape full NT for the given dialect. Safe to re-run (resumes)."""
    if dialect not in DIALECTS:
        raise ValueError(f"Unknown dialect {dialect!r}. Valid: {list(DIALECTS)}")
    info = DIALECTS[dialect]
    paths = corpus_paths(dialect)
    if output_path is None:
        output_path = paths["parallel_jsonl"]

    Path(paths["corpus_dir"]).mkdir(parents=True, exist_ok=True)

    done: set[tuple[str, int]] = set()
    if Path(output_path).exists():
        with open(output_path, "r", encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                if rec.get("dialect") == dialect:
                    done.add((rec["book"], rec["chapter"]))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Research project — Bété language preservation)"
        )
        page = await context.new_page()
        with open(output_path, "a", encoding="utf-8") as out:
            for book, num_chapters in NT_BOOKS.items():
                for chapter in range(1, num_chapters + 1):
                    if (book, chapter) in done:
                        print(f"  Skip (cached): {book} {chapter}")
                        continue
                    print(f"  Scraping {dialect}/{book} {chapter}...")
                    bete = parse_verses(
                        await _scrape_chapter(page, book, chapter, info["bible_id"], info["version"])
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)
                    french = parse_verses(
                        await _scrape_chapter(page, book, chapter, FRENCH_BIBLE_ID, FRENCH_VERSION)
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)
                    pairs = merge_verse_pairs(book, chapter, dialect, bete, french)
                    for pair in pairs:
                        out.write(json.dumps(pair, ensure_ascii=False) + "\n")
                    out.flush()
                    print(f"    -> {len(pairs)} verse pairs")
        await browser.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    asyncio.run(scrape_nt(dialect=args.dialect))
