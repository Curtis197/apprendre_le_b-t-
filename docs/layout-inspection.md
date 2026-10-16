# Responsive layout inspection

Method: the global skill `responsive-layout-rule` (arithmetic, no browser). Layout facts are in `web/CLAUDE.md`.
Tiers to check per page: 360 (narrowest), 640 (sm), 768 (md), 1024 (lg), 1280 (xl). Pass = at least 8-10% headroom.

Status: `fixed` | `ok` (computed, passes) | `todo` (not yet computed) | `screened` (grep found no risky pattern, still needs a read).

## Shared shell
| Item | Status | Note |
|---|---|---|
| Navbar (`components/Navbar.tsx`) | fixed 2026-10-16 | did not fit at lg 1024 (944 available vs about 1108-1148 needed); hamburger now up to xl, tighter desktop padding; at 1280: 1200 available vs about 1070 needed (about 11%) |
| Mobile menu / `MobileSidebar` + `AuthNav` | todo | `AuthNav` has `max-w-[160px]` name |
| `HeaderSearch` | todo | `max-w-[120px]` right-aligned label, `shrink-0` |

## Pages (35): first full pass 2026-10-16 (six parallel audits, arithmetic only)
All pages and their components were computed at 360 (mandatory) and 320 (warn only), plus 375, 412, 640, 768, 1024, 1280. Fixes are Tailwind class changes (rows wrap below `sm:`, `min-w-0`, `break-words`, `flex-wrap`, smaller card padding on mobile).

| Area | Status | Main failures found and fixed |
|---|---|---|
| Shell (Navbar, mobile menu), `/`, `/auth`, `/profile`, `/corrections`, `/notifications`, `/admin/*`, `/contact`, `/contribute` | fixed | mobile menu not scrollable on short phones and long name untruncated; contact card CTA 1% headroom; profile/teacher button rows; contribute level header; form card padding |
| `/lexicon*`, `/usages`, `/grammar`, `/alphabet`, `/translator` | fixed | pagination 0% headroom; list row; grammar patterns 8%; alphabet tabs 4% and toast; translator badge row 0%; unbroken words |
| `/resources*`, word-link editor | fixed | verse translation header -63%; resource card meta row -9%; add-spelling row cramped |
| `/courses*` learner side | fixed | checkout modal buttons -3% and no height cap; fill-in-blank footer -19%; pronunciation/assignment headers -6% |
| `/teach/*` | fixed | course builder lesson row (29px left for the title); review queue tabs -12%; uploaders; long names/e-mails |
| `/forum*`, shared UI | fixed | unbounded author names/URLs; tap targets and iOS zoom on forum forms |

Open items (need a decision or a follow-up):
- `PageHeader` h1 `text-4xl`: "Architecture Grammaticale" overflows by about 3px at 320 (fine at 360). Fix would be `text-3xl sm:text-4xl md:text-5xl` plus `break-words`, a global visual change.
- `ui/button` default is 32px high (`h-8`), `FilterPills` 38px: below the 40-44px comfortable tap size on phones. A global change (`h-10 md:h-8`) was not applied.
- Native inputs with `text-sm`/`text-xs` make iOS Safari zoom on focus. The three word-link `inputClass` constants are fixed (`text-base md:text-sm`); still to do: `usages/page.tsx`, `ContributionForm`, `HomeTranslator`, `VerseWords`, `PronunciationList`, `SpellingsList`, contact/profile selects, `CorrectionBox`, `CourseForm`, `DialectSelector`, `ResourceSubmitForm`.
- `MobileSidebar`, `AuthNav`, `HeaderSearch` are not imported anywhere (dead code); they would overflow at 288px if revived.
- Lexicon list row at 640px has about 1% headroom but cannot overflow (the Bhete word wraps).
- Not verifiable by arithmetic: real Lexend/Noto Sans widths, 150-200% text zoom.

## Content to size for (step 6 of the skill)
French copy (longer than English), user display names and e-mails, long Bhété words in the phonetic font (Noto Sans is wider than Inter), 150-200% text zoom.
