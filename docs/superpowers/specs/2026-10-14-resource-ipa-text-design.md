# Texte en API / orthographe africaine pour les ressources — champ de saisie et vue de lecture

Date : 2026-10-14. Statut : conception proposée, en attente de relecture.

## Objectif

Un contributeur qui publie une ressource (chanson, conte, proverbe…) écrit aujourd'hui le texte en orthographe
courante (latine) et, en option, un mot à mot et une traduction. Cette fonctionnalité permet d'ajouter une
**version du même texte en API / orthographe africaine** (avec les lettres ɛ ɔ ɩ ʋ ŋ…), de **relier chaque mot
API à son mot latin**, et de **lire la ressource dans l'une ou l'autre écriture**, en texte suivi comme en mot à mot.

## Constat (code actuel)

- `community_texts` contient `content_bete` (texte latin), `content_literal` (mot à mot) et `content_french`.
- Les mots sont reliés au lexique par `resource_word_blocks` : chaque bloc garde les positions (`bete_idx`,
  `gloss_idx`) des mots dans la ligne latine et la ligne du mot à mot. Les mots sont découpés sur les seuls
  espaces (même règle en SQL, `word_count`/`block_words`, et en TS, `splitWords`).
- Les lignes sont numérotées comme dans la marge du formulaire : la n-ième ligne non vide (`nonEmptyLines`,
  `numberLines`). Un verset garde ses liens tant que le hash de ses lignes latine et mot à mot ne change pas.
- La lecture (`VerseTranslation` → `VerseRow` → `VerseWords`) a deux modes de mots, déjà mémorisés dans le
  navigateur (clé `word-reader-mode`) : « Texte » (B) et « Mot par mot » (A). Hors mots, la ligne est affichée
  telle quelle ou dans `InterlinearGloss`.
- Le sélecteur de symboles (`SymbolPicker`) accepte un `textareaRef` sur `NumberedTextarea`.

## Décisions

1. **Une colonne, pas de table de liens.** `community_texts.content_ipa text` (facultatif). Le lien entre un
   mot API et un mot latin est **la position** : le mot *i* de la ligne API correspond au mot *i* de la ligne
   latine du même numéro. On réutilise ainsi les blocs existants sans nouvelle table.
2. **Le lien n'existe que si les deux lignes ont le même nombre de mots.** Sinon le verset est signalé et
   la lecture retombe sur le latin pour ce verset. Une table de paires mot à mot explicite serait plus robuste
   mais trop lourde à saisir pour un contributeur : écartée.
3. **L'écriture API n'entre pas dans le hash du verset.** Modifier l'API ne doit pas invalider les liens du
   lexique. La vérification d'alignement se fait à la lecture, verset par verset, en TS.
4. **Le champ est facultatif.** Sans lui, rien ne change pour la ressource ni pour le lecteur.

## Conception

### 1. Données

- Migration `…_resource_ipa_text.sql` : `alter table community_texts add column content_ipa text`, avec
  `check (content_ipa is null or char_length(content_ipa) <= <même limite que content_bete>)` (lire la limite
  existante au moment d'écrire la migration). À appliquer à la main en production.
- `CommunityText` et `CreateCommunityTextInput` (`lib/types.ts`) gagnent `content_ipa`.
- `resourceColumns` (`lib/community-mutations.ts`) écrit `content_ipa` en NFC (`toStoredForm`), **seulement
  quand il est rempli ou déjà présent** : tant que la migration n'est pas appliquée, publier une ressource sans
  API continue de fonctionner.
- Hors périmètre : correction du champ par signalement (`CorrectionBox` / `accept_correction` exigent une
  correspondance côté SQL), indexation des usages. À faire plus tard.

### 2. Alignement — `lib/ipa-alignment.ts` (fonctions pures)

```ts
type IpaStatus = 'none' | 'ok' | 'words-differ' | 'line-missing'
interface IpaVerse { status: IpaStatus; line: string | null; words: string[] | null; beteWords: number; ipaWords: number }
alignIpa(beteText: string, ipaText: string | null | undefined): IpaVerse[]   // un élément par ligne latine non vide
```

- Même découpage que `splitWords` (espaces et tabulations).
- `ok` : la ligne API existe et a autant de mots que la ligne latine ; `words` donne les mots API.
- `words-differ` : la ligne existe mais pas le même nombre de mots ; `line` est disponible pour l'affichage en
  lignes, mais pas `words`.
- `line-missing` : le texte API a moins de lignes que le texte latin. `none` : pas de texte API.
- `ipaForBlock(verse: IpaVerse, beteIdx: number[]): string | null` : les mots API aux positions d'un bloc, joints
  par une espace, ou `null` si le verset n'est pas `ok`.

### 3. Formulaire (`ResourceSubmitForm`)

- Nouveau `NumberedTextarea` « Texte en API / orthographe africaine (facultatif) », entre le texte latin et le mot
  à mot, avec `SymbolPicker` (dialecte courant) et la classe `phonetic`.
- Sous le champ, un récapitulatif **non bloquant** : « ligne 3 : 5 mots en latin, 4 en API », et un message si le
  nombre de lignes diffère. Le contributeur peut publier malgré tout.
- La page de modification (`resources/[id]/edit`) préremplit le champ.

### 4. Lecture

- Un second sélecteur **« Latin | API »**, mémorisé dans le navigateur (`word-reader-script`), visible seulement
  si au moins un verset a un texte API. Les deux sélecteurs existants (Texte / Mot par mot) restent.
- **Vue « Texte »** : chaque verset affiche sa ligne API (si elle existe) à la place de la ligne latine ; les mots
  restent touchables quand le verset est `ok` (le texte du bouton est le mot API, le lien vers le lexique est celui
  du mot latin). Verset non `ok` : on garde la ligne latine, avec la mention « pas d'API pour ce vers ».
- **Vue « Mot par mot »** : sur chaque bloc, le mot affiché est le mot API aux mêmes positions ; sa glose et
  sa fiche du lexique ne changent pas. Le détail d'un mot montre les deux formes (« En latin : … / En API : … »).
- **Sans mots reliés** (carte `InterlinearGloss`, texte court) : la ligne API remplace la ligne latine quand elle
  existe ; le nombre de mots n'a pas d'importance dans ce cas.
- Le mot à mot et la traduction française ne changent jamais.

### 5. Lexique

- Quand on crée une entrée à partir d'un bloc (`emptyEntryForm`, panneau « relier les mots »), le champ
  « Transcription (API) » est prérempli avec `ipaForBlock`, si disponible. C'est l'utilité principale du lien
  entre le mot API et son mot latin.

## Tests

- `alignIpa` : texte sans API, même nombre de mots, nombre de mots différent, API plus courte ou plus longue
  que le latin, lignes vides et couplets, tabulations.
- `ipaForBlock` : blocs de plusieurs mots, mots éloignés, verset non aligné.
- `resourceColumns` : `content_ipa` normalisé en NFC, absent quand vide, texte multiligne inchangé.
- Rendu statique du formulaire (le champ et son récapitulatif) et de `VerseWords` en mode API.

## Risques et limites

- **Désalignement silencieux** : si le contributeur modifie un mot latin mais pas le mot API correspondant,
  l'alignement par position reste « valide » mais faux. Atténuation : le récapitulatif de mots par ligne dans le
  formulaire ; pas de détection automatique plus fine.
- **Découpage différent** : l'API écrite avec d'autres espaces (traits d'union, clitiques) donnera `words-differ`.
  Le message de ligne dit exactement où.
- **Ordre de déploiement** : appliquer la migration avant la mise en ligne du formulaire.
- **Fiabilité de la lecture** : la lecture API n'ajoute aucune vérification linguistique ; elle affiche ce que
  le contributeur a écrit.

## Questions ouvertes

- Libellé du champ : « Texte en API / orthographe africaine » convient-il à des contributeurs non linguistes ?
- Faut-il aussi proposer la lecture API sur la page d'une entrée du lexique (les exemples de ressources) ?
  Non retenu dans cette version.
