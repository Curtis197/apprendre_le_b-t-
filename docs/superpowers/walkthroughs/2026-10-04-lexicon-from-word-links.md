# Walkthrough — Lexique alimenté depuis l'éditeur mot à mot, variantes orthographiques et marqueurs grammaticaux

Ce document résume l'implémentation complète de la spécification et du plan technique définis dans `docs/superpowers/plans/2026-10-04-lexicon-from-word-links.md`.

---

## 1. Vue d'ensemble des changements

Le contributeur d'une ressource peut désormais relier directement les blocs de mots bhété au dictionnaire :
1. **Liaison directe au lexique** : Choix d'une entrée existante et sélection du sens précis utilisé dans le verset.
2. **Recherche de candidats intelligente** : Correspondance exacte, normalisée (sans accents/tons) ou par distance de Levenshtein (variantes orthographiques et coquilles).
3. **Création d'entrée complète à la volée** : Création d'entrées lexicales directement depuis l'éditeur de liaison (`create_lexicon_entry`) avec catégories grammaticales, transcription phonétique/API, sens multiples (pré-remplis à partir du mot à mot nettoyé de ses articles), synonymes, notes et phrase d'exemple issue du verset.
4. **Variantes orthographiques (`lexicon_spellings`)** : Ajout et normalisation de graphies secondaires associées à une entrée principale sans duplication inutile d'entrées.
5. **Marqueurs grammaticaux intégrés au lexique** : Unification des marqueurs comme entrées de type `entry_kind = 'marker'` dans la table `lexicon`. Les lecteurs peuvent visualiser le rôle du marqueur et renseigner son sens s'il est vide (`set_marker_meaning`).
6. **Affichage enrichi côté lecteur (`VerseWords`)** : Affichage d'un bloc « Dans le lexique » avec catégorie, transcription phonétique, sens prioritaire, définition, synonymes, et lien direct vers la fiche complète du mot.

---

## 2. Découpage des tâches et commits réalisés

| Tâche | Commit | Description |
|---|---|---|
| **Task 1** | `d1d5e34` | Modèle de données : colonnes `entry_kind`, `marker_*`, trigger `lexicon_guard_insert`, table `lexicon_spellings`, colonnes `lexicon_id` & `translation_id` sur `resource_word_blocks`. Tests RLS. |
| **Task 2** | `cf72e5f` | Fonctions SQL : `lexicon_summary`, `get_lexicon_entry`, `create_lexicon_entry`, `add_lexicon_spelling`, `set_marker_meaning`, `find_lexicon_candidates`. Tests RLS. |
| **Task 3** | `dfcaaad` | Fonctions SQL : mise à jour de `save_resource_verse`, `get_resource_words`, `search_lexicon` et `correction_column`. Suppression de `resource_word_markers`. Tests RLS et unitaires. |
| **Task 4** | `0bb6aa9` | Types et fonctions pures : `LexSummary`, `LexSense`, `lexicon-links.ts` (`stripArticle`, `groupCandidates`, etc.), enrichissement du draft d'édition dans `word-link-editor.ts`. |
| **Task 5** | `e3949a9` | Couche de données frontend : `lexicon-links-data.ts`, mise à jour de `word-blocks-data.ts` (`parseLex`, messages d'erreurs traduits). Tests unitaires. |
| **Task 6** | `c18cf2f` | Interface éditeur : composants `EntryForm.tsx` et `LexiconPanel.tsx`, intégration dans `BlockPanel.tsx` et `WordLinkEditor.tsx`. |
| **Task 7** | `a3f003d` | Interface lecteur : bloc dictionnaire `DictionaryPart`, formulaire inline `MarkerForm`, propagation du droit d'édition `canEditMarkers`. |
| **Task 8** | `dcecacf` | Filtre des marqueurs vides dans la liste publique, sitemap et contributions en attente, affichage de la fiche marqueur, validation complète et test pilote Notre Père étendu. |

---

## 3. Résultats des vérifications et tests

- **Migration SQL** :
  - Re-exécutée avec succès sur la base locale (`psql -v ON_ERROR_STOP=1`), idempotente.
- **Vérification TypeScript** :
  - `npx tsc --noEmit` : 0 erreur.
- **Tests unitaires Vitest** :
  - `npx vitest run --exclude "**/rls/**"` : **41 fichiers de tests passés, 446 tests passés (0 échec)**.
- **Tests RLS Supabase (exécutés un par un contre la base locale)** :
  - `lexicon-from-word-links.test.ts` : 42 passed.
  - `resource-word-links.test.ts` : 32 passed.
  - `resource-word-links-pilot.test.ts` : 5 passed (couvre le scénario complet Notre Père, liaison lexique, variantes, marqueurs).
  - `search-lexicon.test.ts` : 9 passed.
  - `corrections.test.ts` & `corrections-helpers.test.ts` : 30 passed.
  - `lexicon-translations.test.ts` : 15 passed.
  - `function-grants.test.ts` : 14 passed.
  - `resources-community.test.ts` : 17 passed.
- **Compilation Next.js** :
  - `npm run build` : **Succès total** (compilation et génération des 20 pages statiques réussies).
- **Audit de la base distante (dry-run lecture seule via Supabase MCP)** :
  - `select count(*) from resource_word_markers;` : retourne **0** (aucun marqueur legacy en production).
  - `select count(*) from lexicon;` : retourne **0** (aucune donnée conflictuelle).

---

## 4. Statut du déploiement en production

1. **Migration SQL distante (Supabase)** :
   - Appliquée avec succès le 2026-10-04 sur le projet `agdqbzbjcxrzfhkvempe` via `supabase-mcp-server:apply_migration`.
   - Migration : `lexicon_from_word_links`.
   - Cache PostgREST rechargé : `NOTIFY pgrst, 'reload schema';`.
   - Schéma vérifié : table `lexicon_spellings` active, colonnes `entry_kind`, `lexicon_id`, `translation_id` créées, table legacy `resource_word_markers` supprimée, et les 6 procédures stockées publiques (`lexicon_summary`, `get_lexicon_entry`, `create_lexicon_entry`, `add_lexicon_spelling`, `set_marker_meaning`, `find_lexicon_candidates`) opérationnelles.

2. **Déploiement du code applicatif** :
   - Pour déployer vers Vercel / GitHub, il suffit d'exécuter :
     ```bash
     git push origin master
     ```

