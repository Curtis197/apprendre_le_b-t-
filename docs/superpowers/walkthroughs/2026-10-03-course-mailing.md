# Walkthrough — Course Mailing & Notification System

> **Date :** 2026-10-03  
> **Branche :** `feat/course-mailing` (worktree `tb-mail`)  
> **Plan de référence :** [`docs/superpowers/plans/2026-10-03-course-mailing.md`](file:///C:/Users/DELL%20LATITUDE%207480/tb-mail/docs/superpowers/plans/2026-10-03-course-mailing.md)

---

## 1. Vue d'ensemble

Mise en place d'un système d'e-mails transactionnels et de notifications de cours asynchrone et résilient reposant sur une file d'attente sortante (**Outbox pattern**) dans Supabase PostgreSQL :
1. **Annonces de nouveaux cours** : Notifier automatiquement les anciens apprenants d'un enseignant lorsqu'il publie un cours gratuit ou validé.
2. **Activité des devoirs** :
   - Notification à l'enseignant dès qu'un apprenant rend un devoir (`submission_received`).
   - Notification à l'apprenant dès que son devoir est noté ou corrigé (`submission_reviewed`).
3. **Digest hebdomadaire** : Récapitulatif envoyé chaque lundi matin résumant la progression de la semaine pour chaque apprenant actif.
4. **Désabonnement 1-click & Préférences** :
   - Conformité **RFC 8058** (`List-Unsubscribe`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`).
   - Page dédiée `/notifications/unsubscribe?token=...&category=...` avec réabonnement possible.
   - Page de gestion des préférences `/notifications` avec case à cocher par catégorie (`teacher_announcements`, `weekly_progress`, `course_activity`), accessible depuis le profil.
5. **Centralisation de l'envoi d'e-mails** :
   - Refactorisation de `send-welcome` et de `contact` pour passer par `sendEmail`.
   - Suppression de l'ancienne route cliente `notify` et de l'expéditeur codé en dur.

---

## 2. Changements Appliqués & Commits

| Commit | Description |
|---|---|
| `3568647` | **feat(mail): sender wrapper, layout and email templates**<br>Création de `categories.ts`, `send.ts`, `layout.ts`, `templates.ts` et tests unitaires complets. |
| `92da626` | **feat(mail): email preferences, outbox queue and claim function**<br>Migration `20261003000002_email_outbox.sql` (`email_preferences`, `email_outbox`, `claim_email_batch`), `unsubscribe.ts` et tests RLS. Appliquée à Supabase distant. |
| `5b4d3d7` | **feat(mail): queue emails from course, submission and digest events**<br>Migration `20261003000003_email_triggers.sql` (`courses_enqueue_new_course_emails`, `submissions_enqueue_received`, `submissions_enqueue_reviewed`, `enqueue_weekly_digest`). Appliquée à Supabase distant. |
| `dac09b1` | **feat(mail): outbox dispatcher with preferences, retries and daily cap**<br>Création du dispatcher d'envoi (`dispatcher.ts`), dépendances service-role (`dispatcher-deps.ts`), route cron `/api/mail/dispatch` et tests unitaires avec backoff quadratique. |
| `84d4522` | **feat(mail): one-click unsubscribe and notification settings**<br>Route POST `/api/mail/unsubscribe`, pages `/notifications/unsubscribe` et `/notifications`, composant `NotificationPreferences`, lien dans le profil. |
| `f6e3e91` | **refactor(mail): route welcome, contact and review emails through the shared sender**<br>Suppression de `notify/route.ts` et `assignment-email.ts`, mise à jour de `send-welcome/route.ts`, `contact/route.ts` et `mutations.ts`. |
| `c7b8826` | **feat(mail): cron schedule, env docs and live-check script**<br>Création de `supabase/ops/mail-cron.sql`, `web/scripts/mail-live-check.mjs` et documentation dans `web/.env.local.example`. |

---

## 3. Migrations Supabase Appliquées via MCP

Les deux migrations ont été appliquées avec succès sur le projet Supabase distant (`agdqbzbjcxrzfhkvempe`) via `supabase-mcp-server:apply_migration` :
- `20261003000002_email_outbox` : Tables `email_preferences`, `email_outbox` (sécurisées par RLS) et fonction PostgreSQL de lease atomique `claim_email_batch(p_limit int)`.
- `20261003000003_email_triggers` : Triggers sur `courses` et `submissions`, et fonction `enqueue_weekly_digest(p_week_start date)`.

---

## 4. Tests et Validation

1. **Tests unitaires Vitest :**
   - 24 fichiers de tests exécutés avec succès (`211/211 passés`).
   - Couverture complète des templates, de l'encodage HTML hostile, de l'échappement CR/LF des sujets, des retries et du capping journalier du dispatcher.
2. **Vérification TypeScript :**
   - `npx tsc --noEmit` : **0 erreur**.
3. **Build de production Next.js :**
   - `npm run build` : **Succès total** (18/18 pages statiques générées, compilation Turbopack sans avertissement bloquant).
   - Routes API `/api/mail/dispatch`, `/api/mail/unsubscribe`, `/api/send-welcome`, `/api/contact` opérationnelles.
