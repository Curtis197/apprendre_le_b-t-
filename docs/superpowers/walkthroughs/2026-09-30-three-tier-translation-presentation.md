# Walkthrough: Présentation de la Traduction en 3 Niveaux & Gloses Interlinéaires

Date : 30 septembre 2026

## 1. Contexte & Objectif

L'utilisateur a demandé d'évaluer et d'implémenter la présentation de la traduction en trois niveaux distincts :
1. **Texte original** (en français ou en bété selon le sens de la traduction).
2. **Traduction mot à mot / Glose interlinéaire** (*literal translation*), essentielle pour appréhender la grammaire, la structure syntaxique et les métaphores propres aux langues Kru / Bété.
3. **Traduction finale idiomatique** (*final translation*), donnant le sens naturel et fluide.

La décision confirmée a porté sur l'intégration des deux axes :
- **Axe 1** : Intégration dans le moteur et l'interface du Traducteur (`TranslatorOutput`, pipeline `translator.ts`, type `TranslationResult`).
- **Axe 2** : Format de glose interlinéaire pour les cours (`LessonMarkdown`, bloc `:::gloss`) et les exemples du lexique (`/lexicon/[id]`).

---

## 2. Modifications Réalisées

### A. Modèle de données & Types (`web/lib/types.ts`)
- Ajout du champ optionnel `literal?: string | null` dans l'interface `TranslationResult`.
- Préservation de la rétrocompatibilité complète avec les résultats existants.

### B. Pipeline de Traduction (`web/lib/translator.ts`)
- **Base de données d'expressions** : Extraction du champ `french_literal` déjà présent dans la table `expressions` lors de la recherche exacte ou vectorielle.
- **Synthèse par LLM (Claude)** :
  - Mise à jour du prompt système pour demander explicitement une clé JSON `"literal": "traduction mot à mot ou glose interlinéaire"`.
  - Parsing de la réponse pour extraire `literal` aux côtés de `translation`, `explanation`, `breakdown`, et `confidence`.
- **Mécanisme de repli (Fallback)** :
  - Dans le cas où l'assemblage LLM n'est pas utilisé ou indisponible, assemblage d'un mot à mot à partir des lemmes du dictionnaire (`tokens.map(t => t.lemma)`).

### C. Composant de Glose Interlinéaire (`web/components/InterlinearGloss.tsx`)
- Nouveau composant UI réutilisable affichant clairement les 3 étages :
  1. **Niveau 1** : Texte original avec badge linguistique et forme phonétique / tonale optionnelle.
  2. **Niveau 2** : Alignement vertical mot à mot token par token (style glose leipzig/linguistique), défilable horizontalement sur mobile.
  3. **Niveau 3** : Traduction finale et idiomatique avec sens contextualisé.
- Prise en charge de deux variantes graphiques : `card` (encadré avec fond doux) et `compact` (pour listes et exemples intégrés).
- Bouton de copie rapide du texte original et de la traduction.

### D. Interface du Traducteur (`web/components/TranslatorOutput.tsx`)
- Refonte de la présentation pour mettre en valeur les 3 niveaux dans des sections harmonieuses et numérotées :
  - Étape 1 : Source (Français / Bété).
  - Étape 2 : Mot à mot / Décomposition structurale.
  - Étape 3 : Traduction finale fluide avec indice de confiance.
- Préservation intacte des analyses grammaticales, notes culturelles, alternatives et suggestions de lemmes.

### E. Fiche Détaillée du Lexique (`web/app/lexicon/[id]/page.tsx`)
- Mise à niveau de l'affichage des phrases d'exemple :
  - Utilisation du composant `InterlinearGloss` pour afficher chaque exemple avec son mot à mot (`french_literal`) et sa traduction finale (`french`).

### F. Support Markdown des Cours (`web/lib/courses/markdown.ts` & `LessonMarkdown.tsx`)
- Ajout du type de bloc `gloss` dans la grammaire Markdown des leçons.
- Prise en charge de la syntaxe de conteneur personnalisée `:::gloss` :
  - Syntaxe par clés explicites :
    ```markdown
    :::gloss
    title: Expression imagée
    bete: lagɔ bhïte
    literal: Dieu frappe
    fr: Il pleut
    :::
    ```
  - Syntaxe positionnelle 3 lignes :
    ```markdown
    :::gloss
    lagɔ bhïte
    Dieu frappe
    Il pleut
    :::
    ```
- Intégration du composant `InterlinearGloss` dans le moteur de rendu `LessonMarkdown.tsx`.

---

## 3. Validation & Tests

### Tests Unitaires (`vitest`)
- Ajout de 2 nouveaux tests unitaires dans `web/__tests__/course-markdown.test.ts` validant le parsing des conteneurs `:::gloss` (clés explicites et syntaxe 3 lignes).
- Exécution de l'intégralité de la suite de tests :
  ```
  Test Files  14 passed (14)
       Tests  105 passed (105)
  ```

### Vérification TypeScript
- Exécution de `npx tsc --noEmit` : **0 erreur**.

### Audit des suppressions
- Exécution de `git diff --diff-filter=D` : **0 fichier supprimé**, respect strict de la politique anti-suppression.
