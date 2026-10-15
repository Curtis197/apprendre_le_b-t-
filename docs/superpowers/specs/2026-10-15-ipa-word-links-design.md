# Liens explicites entre les mots API et les blocs de mots — conception

Date : 2026-10-15. Statut : proposée, en attente de relecture. Complète la spec
`2026-10-14-resource-ipa-text-design.md` (texte API relié par position).

## Objectif

Aujourd'hui les mots API ne sont reliés aux mots latins que **par position** : le verset doit avoir le même nombre
de mots en latin et en API. Dès que les deux écritures découpent les mots autrement (`ghèhi-wu` en un mot latin,
`ghäyɩ 'wʋ` en deux mots API), le verset retombe sur le latin dans la vue « mot par mot ».

On veut que le contributeur puisse **relier lui-même les mots API aux blocs** de l'éditeur « Relier les mots »
(là où il relie déjà les mots latins au mot à mot et au lexique), pour que le nombre de mots n'ait plus à
correspondre. Le mot à mot et le lexique restent liés au bloc : en reliant l'API au bloc, il est relié du même coup
au mot à mot et à la fiche du lexique.

## Constat (code actuel)

- Un **bloc** (`resource_word_blocks`) = des mots latins (`bete_idx`) + des mots du mot à mot (`gloss_idx`) + le
  lexique. Les blocs d'un verset sont valables tant que le hash des lignes latine et mot à mot ne change pas
  (`verse_hash`).
- L'éditeur (`WordLinkEditor` → `BlockPanel`, état pur dans `lib/word-link-editor.ts` : `VerseDraft`, `BlockMeta`,
  `derive`, `toSave`) manipule deux côtés, `b` (latin) et `g` (mot à mot). Les métadonnées d'un bloc sont rangées par
  `blockKey` (indices latins joints par « - ») et suivent les fusions/éclatements de blocs.
- Les fonctions SQL `get_resource_words` et `save_resource_verse` (dernières versions dans
  `20261008000000_lexicon_from_word_links.sql`) lisent et écrivent ces blocs ; `save_resource_verse` vérifie
  les lignes de base (`p_base_bete`, `p_base_literal`) et que chaque mot est dans un bloc.
- Le lecteur (`readerTokens`) n'utilise l'API que par position (`ipaWords`, même nombre de mots).

## Conception

### 1. Données

Migration `…_word_block_ipa_links.sql` (à appliquer à la main, **avant** le déploiement) :

- `resource_word_blocks.ipa_idx int[] not null default '{}'` : positions (0-based) des mots de la ligne API
  appartenant au bloc ; vide = pas de lien API explicite.
- `resource_word_blocks.ipa_hash text` : md5 de la ligne API du verset au moment de l'enregistrement. Les liens
  `ipa_idx` ne sont valables que tant que la ligne API n'a pas changé ; modifier le texte API n'invalide donc jamais
  les liens latin / mot à mot (le `verse_hash` ne change pas).
- Contraintes : `ipa_idx` sans doublon dans le bloc ; `ipa_hash` non nul quand `ipa_idx` ne l'est pas.
- `get_resource_words` renvoie, par bloc, `ipa_idx`, et par verset `ipa_line` (la n-ième ligne non vide du texte API)
  et `ipa_stale` (vrai si un bloc a un `ipa_hash` différent du hash de la ligne API actuelle).
- `save_resource_verse` gagne deux paramètres **facultatifs** (`default null`) : `p_base_ipa` (la ligne API sur laquelle
  l'éditeur a été construit) et, dans chaque bloc du JSON, la clé `ipa_idx`. Validation côté serveur : la ligne API
  actuelle doit être égale à `p_base_ipa` (sinon erreur `ipa_moved`, comme pour le latin) ; chaque position est dans
  `[0, word_count(ligne API) - 1]` ; une position n'appartient qu'à un seul bloc. Les mots API non reliés sont permis.
  Sans `p_base_ipa`, la fonction se comporte exactement comme aujourd'hui.

### 2. État de l'éditeur — `lib/word-link-editor.ts` (fonctions pures)

- `VerseDraft` gagne `ipa: string` (ligne API du verset), `baseIpa: string` et, dans `BlockMeta`, `ipaIdx: number[]`
  (rangé par `blockKey`, donc il suit fusions et éclatements de blocs : les `ipaIdx` de blocs fusionnés sont réunis
  et triés ; en cas d'éclatement les positions restent au bloc qui garde le premier mot).
- Les indices API ne dépendent pas des indices latins : corriger, ajouter ou supprimer un mot latin (`editWords`,
  `addWords`, `removeWord`) ne touche pas `ipaIdx`.
- Nouvelles fonctions : `toggleIpaWord(d, key, i)` (relie ou délie le mot API *i* au bloc ; s'il appartient à un autre
  bloc, il lui est retiré), `autoLinkIpa(d)` (relie par position quand les deux lignes ont le même nombre de mots,
  sinon ne fait rien), `ipaStatus(d)` : `{ words, linked, unlinked }`.
- `initDraft` : reprend les `ipaIdx` enregistrés quand `ipa_stale` est faux ; sinon, et si les nombres de mots sont égaux,
  relie par position (c'est le comportement actuel, rendu explicite) ; sinon aucun lien.
- `toSave` ajoute `ipa_idx` à chaque bloc et renvoie `baseIpa`.

### 3. Interface — `BlockPanel` et résumé du verset

- Quand la ressource a un texte API, une section « Mots en API » apparaît sous la paire latin / mot à mot : les mots
  de la ligne API du verset sont affichés comme des pastilles ; celles du bloc sélectionné sont en couleur pleine,
  celles d'un autre bloc sont grisées avec le numéro de ce bloc, les autres sont neutres. Un clic sur une pastille la
  relie au bloc sélectionné ou la délie. Un bouton « Relier par position » est proposé quand les nombres de mots sont
  égaux.
- Résumé du verset : « API : 14 mots, 13 reliés, 1 non relié ». Les mots non reliés ne bloquent pas l'enregistrement :
  ils ne sont simplement pas montrés dans la vue « mot par mot » (la vue « Texte » montre toujours la ligne entière).
- Le panneau lexique prérempli la transcription avec les mots API **du bloc** (`ipaIdx`), plus seulement par position.
- Hors périmètre : modifier le texte API depuis l'éditeur (cela reste dans le formulaire de la ressource).

### 4. Lecture — `readerTokens`

- Pour un verset, les mots API d'un bloc sont : ses `ipa_idx` si le verset n'est pas `ipa_stale` et que le bloc a des
  liens ; sinon, par position si les nombres de mots sont égaux (comportement actuel) ; sinon rien (latin).
- Quand les mots latins d'un bloc sont séparés (plusieurs morceaux) : si le nombre de séquences contiguës de `ipa_idx`
  est égal au nombre de morceaux, chaque morceau reçoit sa séquence ; sinon le premier morceau reçoit tous les mots
  API du bloc et les autres affichent « … ».
- Le détail d'un mot (« En latin : … · En API : … ») utilise la même règle. La vue « Texte » et la carte simple
  continuent d'utiliser la ligne API entière.

## Tests

- `lib/word-link-editor` : `toggleIpaWord` (relier, délier, déplacer d'un bloc à l'autre), `autoLinkIpa` (égal / inégal),
  fusion et éclatement de blocs avec `ipaIdx`, `initDraft` avec liens valables / `ipa_stale`, `toSave` (clé `ipa_idx`,
  `baseIpa`), mots non reliés comptés.
- `readerTokens` : `ipa_idx` explicite avec nombres de mots différents, repli par position, repli latin, morceaux
  séparés (séquences égales / inégales).
- Rendu statique de la section « Mots en API » (pastilles, grisées, résumé).
- SQL : non testable ici (Docker indisponible) ; script de vérification en lecture seule après application
  (colonnes, signature des fonctions, un `get_resource_words` sur la ressource « Notre Père ») et script d'annulation.

## Risques et limites

- **Remplacer deux fonctions SQL complexes** (`get_resource_words`, `save_resource_verse`) sans base locale : risque
  d'erreur de recopie. Atténuation : repartir de la dernière version de `20261008…` en n'ajoutant que le nécessaire, relire
  la différence, appliquer en dehors des heures de pointe, garder le script d'annulation (la migration précédente).
- **Ordre de déploiement** : la migration d'abord. Le nouveau code n'envoie `p_base_ipa` / `ipa_idx` que pour un verset
  qui a des liens API explicites, donc une ressource sans API se comporte comme avant même avant la migration ; avec des
  liens API explicites et une base non migrée, l'enregistrement échoue.
- **Texte API modifié après liaison** : les liens explicites sont ignorés (`ipa_stale`), le lecteur retombe sur la
  position puis sur le latin ; l'éditeur le dit (« API à revoir ») et reprend la liaison par position si possible.
- **Complexité de l'éditeur** : une troisième ligne de mots à relier alourdit l'écran ; elle n'apparaît que si la
  ressource a un texte API.

## Questions ouvertes

- Quand un mot API appartient déjà à un autre bloc, faut-il le déplacer sans demander (proposé) ou demander ?
- Faut-il aussi laisser relier les mots API directement aux mots du mot à mot (sans passer par le bloc) ? Non retenu :
  le bloc est déjà l'unité qui relie latin, mot à mot et lexique.
