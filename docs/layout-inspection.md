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

## Pages (35)
Risk column = what the first grep screening found. Every `todo` still needs the full computation at 360 and at each breakpoint it uses.

| Page | Status | Risk found by screening |
|---|---|---|
| `/` (app/page.tsx) | todo | hero images `sizes="100vw"` |
| `/lexicon` | fixed 2026-10-16 (entry row) | row needed pill 64 + gaps 32 + padding 32 + right block up to 260 in 326: long French glosses squeezed the Bhété word; now wraps below `sm:` |
| `/lexicon/[id]`, `/lexicon/[id]/usages` | todo | forms, interlinear gloss (`min-w-[55px]` cells) |
| `/grammar`, `/alphabet` | todo | `AlphabetReference` cells `min-w-[84px]`, tab list scrolls |
| `/translator` | todo | `TranslatorOutput` cards `min-w-[75px]`, dark log table with `whitespace-nowrap` (scrolls) |
| `/usages` | todo | |
| `/courses`, `/courses/[slug]`, `/courses/[slug]/learn/[lessonId]` | todo | filter pills scroll horizontally; stats `grid-cols-2 sm:grid-cols-4`; checkout modal `fixed inset-0 p-4` |
| `/forum`, `/forum/new`, `/forum/[id]` | todo | titles `truncate` |
| `/resources`, `/resources/new`, `/resources/[id]`, `/resources/[id]/edit`, `/resources/[id]/relier` | todo | word-link editor (block rows), IPA line |
| `/contribute`, `/contact` | todo | contact: filters wrap; cards `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` |
| `/auth`, `/profile`, `/corrections`, `/notifications`, `/notifications/unsubscribe` | todo | |
| `/teach`, `/teach/new`, `/teach/reviews`, `/teach/[courseId]`, `.../lessons/[lessonId]`, `.../learners`, `.../learners/[userId]` | todo | learner tables sit in `overflow-x-auto` (scroll, not overflow); course titles `truncate` |
| `/admin/courses`, `/admin/reports` | todo | |

## Content to size for (step 6 of the skill)
French copy (longer than English), user display names and e-mails, long Bhété words in the phonetic font (Noto Sans is wider than Inter), 150-200% text zoom.
