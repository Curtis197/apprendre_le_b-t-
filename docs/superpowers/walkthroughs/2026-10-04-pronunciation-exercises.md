# Walkthrough: Vérification End-to-End du Module de Prononciation

Date : 2026-10-04
Branche : `feat/pronunciation-and-teacher-progress`

## 1. Contexte & Objectifs

L'implémentation des exercices de prononciation permet :
- Aux apprenants d'écouter un enregistrement audio modèle fourni par l'enseignant, de s'enregistrer au microphone (avec MediaRecorder, support WebM / MP4 / OGG et limite de 60s / 5 Mo), de préécouter leur prise, puis de la soumettre à l'enseignant.
- Aux enseignants de retrouver les enregistrements dans leur file de correction (`/teach/reviews`), d'écouter les prises audio via des URLs signées sécurisées générées depuis le bucket privé `pronunciation-submissions`, et de décider de valider (`validated`) ou de demander une nouvelle prise (`needs_retry`) avec un commentaire explicatif obligatoire.
- Au système de base de données de garantir que seule la validation enseignante confère le statut terminé (100% de progression) via trigger Postgres `submissions_apply_pronunciation_validation`, avec interdiction stricte pour l'apprenant de s'auto-valider ou de manipuler sa progression de prononciation.

## 2. Tests Automatisés & RLS Validés

### Suites Unitaires (`npm run test`) : 23 fichiers, 203 tests réussis
- `web/__tests__/course-thresholds.test.ts` (3 tests) : seuils QUIZ 70% et FIB 80%.
- `web/__tests__/course-pronunciation.test.ts` (8 tests) : détection MIME types, calcul des chemins d'enregistrement, labels de statut.
- `web/__tests__/course-mutations.test.ts` (18 tests) : validation des payloads d'enregistrement, limite de taille 5 Mo, commentaire obligatoire pour `needs_retry`.
- `web/__tests__/course-assignment.test.ts` (4 tests) : `isPendingSubmission`, labels des statuts.
- Toutes les autres suites (markdown, quiz, payment, lexique, réordonnancement, etc.) restent vertes sans régression.

### Suites RLS Postgres (`node scripts/test-rls.mjs <suite>`)
- `pronunciation` (10 tests) :
  - L'apprenant ne peut pas insérer de progression manuelle pour une leçon de prononciation (`42501`).
  - L'insertion d'un enregistrement force le statut à `submitted`.
  - L'apprenant ne peut pas valider son propre enregistrement.
  - La validation par l'enseignant crée automatiquement la ligne de progression à 100% via le trigger.
  - L'enregistrement validé est gelé contre toute modification intempestive de l'apprenant.
  - L'apprenant ne peut pas supprimer sa progression validée.
  - Si l'enseignant passe le devoir à `needs_retry`, la progression est révoquée.
  - L'apprenant peut réenregistrer après `needs_retry`, réinitialisant le statut à `submitted`.
  - La suppression de la leçon par l'enseignant cascade proprement sans bloquer sur les triggers.
  - Le bucket privé `pronunciation-submissions` est configuré avec 5 Mo max et les MIME types audio autorisés.
- `phase4-assignments` (4 tests) : fonctionnement nominal conservé.
- `course-review-hardening` (14 tests) : intégrité des corrections et droits enseignants conservés.
- `progress-reports` (11 tests) : intégrité de la progression conservée.
- `phase2-audio-quiz` (7 tests) : intégrité audio et quiz conservée.

### Vérification TypeScript & Linting
- `npx tsc --noEmit` : 0 erreur, typage strict respecté.

## 3. Matrice de Compatibilité & Points d'Attention
- **Navigateurs testés via tests unitaires et intégration Node :** MediaRecorder standard, fallback WebM / MP4 / OGG.
- **Safari / iOS :** Prise en charge explicite de `audio/mp4` dans l'ordre de fallback MIME type et stockage Supabase.
- **Accès micro :** Gestion d'erreur explicite en français si l'utilisateur refuse l'accès au micro.
