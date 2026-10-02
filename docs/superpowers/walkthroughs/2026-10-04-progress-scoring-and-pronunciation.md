# Walkthrough: Exercices de Prononciation & Tableau de Bord Enseignant

**Date :** 4 octobre 2026  
**Branche Git :** `feat/pronunciation-and-teacher-progress`  
**Plan de référence :** `docs/superpowers/plans/2026-10-04-pronunciation-and-teacher-progress.md`

---

## 1. Vue d'Ensemble & Objectifs Réalisés

Cette implémentation majeure introduit :
1. **Harmonisation et centralisation des seuils de réussite** (`web/lib/courses/thresholds.ts`) :
   - Quiz QCM : seuil minimal de 70% (`QUIZ_PASS_PERCENT = 70`).
   - Texte à trous (Fill-in-the-blank) : seuil minimal de 80% (`FILL_IN_BLANK_PASS_PERCENT = 80`).
   - Correction de l'enregistrement de progression et de score du texte à trous, sans fuite de `console.log`.
2. **Module complet d'exercices de prononciation** :
   - Nouveau format de leçon : `pronunciation`.
   - Modèle audio enseignant téléversable (`AudioUploader` réutilisé avec libellé adapté).
   - Enregistreur vocal apprenant (`PronunciationRecorder`) gérant `MediaRecorder` avec cascade de formats (`webm`, `mp4`, `ogg`), limite de 60 secondes et 5 Mo, aperçu audio avant envoi, et messages clairs en cas de refus d'accès au micro.
   - Bucket Supabase Storage privé `pronunciation-submissions` avec politiques RLS strictes garantissant que l'apprenant ne lit/écrit que ses propres enregistrements dans son dossier `{user_id}/{lesson_id}/...`.
   - File de correction enseignant enrichie (`PronunciationReviewCard`) permettant d'écouter les prises audio via des URLs signées sécurisées et de statuer sur le devoir (`validated` ou `needs_retry`) avec commentaire obligatoire.
   - Verrouillage de la progression Postgres : seule la validation de l'enseignant marque la leçon comme terminée (100%) via le trigger `submissions_apply_pronunciation_validation`. L'apprenant ne peut ni s'auto-valider ni supprimer sa validation.
3. **Tableau de bord de suivi enseignant** :
   - Fonction SQL RPC `public.course_progress_rows(p_course_id uuid)` en `security definer`, accessible uniquement à l'enseignant propriétaire du cours et aux administrateurs.
   - Agrégration statistique pure (`web/lib/courses/stats.ts`) calculant les métriques globales (inscrits, progression moyenne, complétions), les statistiques par leçon (taux d'achèvement, scores moyens), et le classement des apprenants avec priorité d'affichage pour les apprenants nécessitant une attention (progression la plus faible en premier).
   - Composant serveur `CourseStatsPanel` intégré sur la page de gestion du cours (`/teach/[courseId]`).

---

## 2. Architecture Technique & Fichiers Créés / Modifiés

### Nouveaux Composants et Utilitaires
- [`web/lib/courses/thresholds.ts`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/lib/courses/thresholds.ts) : constantes `QUIZ_PASS_PERCENT` (70) et `FILL_IN_BLANK_PASS_PERCENT` (80), prédicats de succès.
- [`web/lib/courses/pronunciation.ts`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/lib/courses/pronunciation.ts) : utilitaires MIME types, calcul des chemins d'enregistrement Storage, libellés de statuts.
- [`web/lib/courses/stats.ts`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/lib/courses/stats.ts) : agrégation pure des lignes de progression par leçon et par apprenant.
- [`web/components/courses/PronunciationRecorder.tsx`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/components/courses/PronunciationRecorder.tsx) : enregistrement audio client avec MediaRecorder, timer pulsant et gestion d'erreurs.
- [`web/components/courses/PronunciationExercise.tsx`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/components/courses/PronunciationExercise.tsx) : interface d'exercice côté apprenant avec feedback enseignant et statut.
- [`web/components/courses/PronunciationReviewCard.tsx`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/components/courses/PronunciationReviewCard.tsx) : carte de correction avec lecteur audio pour l'enseignant.
- [`web/components/courses/CourseStatsPanel.tsx`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/web/components/courses/CourseStatsPanel.tsx) : tuiles récapitulatives et tableaux de statistiques pour l'enseignant.

### Fichiers Modifiés
- `web/lib/courses/types.ts` : ajout de `pronunciation` à `LessonKind`.
- `web/lib/courses/assignment.ts` : statuts `validated` et `needs_retry`, fonction `isPendingSubmission`, `audioUrl` sur `PendingReviewItem`.
- `web/lib/courses/mutations.ts` : implémentation de `submitPronunciation` et `reviewPronunciation`.
- `web/lib/courses/queries.ts` : `getPronunciationAudioUrl`, signature par lots des enregistrements dans `getPendingReviewsForTeacher`, `getCourseProgressRows`.
- `web/components/courses/FillInBlankExercise.tsx` : utilisation de `FILL_IN_BLANK_PASS_PERCENT`.
- `web/components/courses/LessonEditor.tsx` : support de l'auteur pour les leçons de prononciation et audio modèle.
- `web/components/courses/ReviewQueue.tsx` : affichage des devoirs de prononciation via `PronunciationReviewCard`.
- `web/app/courses/[slug]/learn/[lessonId]/page.tsx` : intégration de l'exercice de prononciation et désactivation du bouton manuel de complétion.
- `web/app/teach/[courseId]/page.tsx` : affichage du panneau statistique `CourseStatsPanel`.
- `web/app/api/courses/submissions/notify/route.ts` : gestion des notifications par email pour les statuts validés et à refaire.

### Migrations Supabase
- `supabase/migrations/20261004000000_pronunciation_exercises.sql` :
  - Extension du `CHECK (kind IN (...))` avec `pronunciation`.
  - Extension du `CHECK (status IN (...))` avec `validated` et `needs_retry`.
  - Bucket privé `pronunciation-submissions` (5 Mo, audio webm/ogg/mp4/mpeg) et politiques RLS de stockage.
  - Trigger `lesson_progress_guard_pronunciation` interdisant l'insertion manuelle de progression.
  - Trigger `submissions_apply_pronunciation_validation` appliquant automatiquement 100% de progression lors de la validation enseignant.
  - Trigger `submissions_guard_review_fields` protégeant les champs de notation et réinitialisant le statut lors d'une nouvelle tentative.
- `supabase/migrations/20261004000001_course_progress_rows.sql` :
  - Fonction RPC `public.course_progress_rows(p_course_id uuid)`.

---

## 3. Résultats des Tests & Validations

### Tests Unitaires (`npm run test`)
**24 suites passées avec succès, 210 tests au total** :
- `__tests__/course-thresholds.test.ts` (3 tests) : OK
- `__tests__/course-pronunciation.test.ts` (8 tests) : OK
- `__tests__/course-stats.test.ts` (7 tests) : OK
- `__tests__/course-mutations.test.ts` (18 tests) : OK
- `__tests__/course-assignment.test.ts` (4 tests) : OK
- `__tests__/course-fill-in-blank.test.ts` (5 tests) : OK
- Toutes les suites régression (lexique, markdown, réordonnancement, audio, vidéo, dons) : OK

### Tests RLS Database (`node scripts/test-rls.mjs <suite>`)
**7 suites RLS validées sur base Postgres réelle** :
1. `pronunciation` (10 tests) : OK
2. `course-progress-rows` (4 tests) : OK
3. `phase4-assignments` (4 tests) : OK
4. `course-review-hardening` (14 tests) : OK
5. `progress-reports` (11 tests) : OK
6. `phase2-audio-quiz` (7 tests) : OK
7. `courses-core` (26 tests) : OK

### Vérification TypeScript & Build de Production
- `npx tsc --noEmit` : **0 erreur**.
- `npm run build` : **Compilation réussie**, toutes les routes statiques et dynamiques générées sans avertissement de build.

---

## 4. Instructions de Déploiement Supabase Distant

La migration `20261004000001_course_progress_rows.sql` a déjà été appliquée avec succès sur le projet distant `agdqbzbjcxrzfhkvempe` via le serveur MCP Supabase.

La migration `20261004000000_pronunciation_exercises.sql` comportant des instructions `DROP POLICY` et `DROP CONSTRAINT`, le serveur MCP Supabase la réserve à une exécution manuelle via l'éditeur SQL du Dashboard :

1. Ouvrez le dashboard Supabase : [https://supabase.com/dashboard/project/agdqbzbjcxrzfhkvempe/sql](https://supabase.com/dashboard/project/agdqbzbjcxrzfhkvempe/sql)
2. Copiez l'intégralité du fichier [`supabase/migrations/20261004000000_pronunciation_exercises.sql`](file:///C:/Users/DELL%20LATITUDE%207480/wtp/supabase/migrations/20261004000000_pronunciation_exercises.sql) dans l'éditeur SQL.
3. Cliquez sur **Run**.
4. Vérification post-déploiement :
   - Le bucket `pronunciation-submissions` apparaît dans **Storage** comme bucket privé.
   - Les déclencheurs `submissions_apply_pronunciation_validation` et `lesson_progress_guard_pronunciation` sont actifs sur les tables respectives.
