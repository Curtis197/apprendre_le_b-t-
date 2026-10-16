@AGENTS.md

## Layout facts (for the `responsive-layout-rule` skill)

Verify layout by arithmetic, never with a browser (see the global skill `responsive-layout-rule`). Facts read from the code on 2026-10-16:

- **Narrowest viewport:** 360px (assumed, not confirmed by the owner; iOS Safari 16.1 must work, see memory).
- **Breakpoints:** Tailwind v4 defaults (sm 640, md 768, lg 1024, xl 1280, 2xl 1536); `globals.css` `@theme` defines no custom screens.
- **Fonts:** Inter (body), Lexend (headings, `font-heading`), Noto Sans (`.phonetic`: Bhété text, wider than Inter for ɛ ɔ ɩ ʋ ŋ).
- **Shell:** no sidebar at any tier. Root layout = sticky header `h-16` (`app/layout.tsx` → `components/Navbar.tsx`) + `<main>{children}</main>`. Navbar inner wrapper: `max-w-7xl mx-auto px-4 md:px-10` (padding 16px below `md:`, 40px from `md:`). The desktop nav and auth block show from `lg:`; below that a hamburger opens a menu inside the header.
- **Pages:** each page sets its own wrapper, usually `max-w-2xl|3xl|4xl|7xl mx-auto px-4` (some `md:px-10`); read the page's classes, don't assume. Available width = viewport − 2 × page padding, capped by `max-w-*`.
- **Content that varies:** French UI copy (longer than English), user display names (navbar truncates at 140px), Bhété words in the phonetic font.

Navbar (fixed 2026-10-16): the desktop row did not fit at `lg:` 1024px (needed about 1108-1148px in 944px). The hamburger now covers up to `xl:`; from `xl:` (1280px) links and auth buttons use `px-2.5`, `ml-2`, name `max-w-[120px]`. Estimate at 1280: available 1200px, needed about 1060-1070px (logged in/out), headroom about 11-12%.
