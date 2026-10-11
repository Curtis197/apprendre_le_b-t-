# Alphabet phonétique du bhété — page de référence, plateau de symboles, affichage

Date: 2026-10-11. Statut: conception validée en conversation, en attente de relecture.
Maquette: https://claude.ai/artifact/G7QwKSMcP3CAdz4yGwG24m (source JSX hors dépôt).

## Objectif

Les lettres de l'orthographe du bhété (`ɛ ɔ ɩ ʋ ŋ`, voyelles à tréma, marques de ton) ne se tapent pas sur
la plupart des claviers et ne sont expliquées nulle part dans l'application. Cette fonctionnalité donne :

1. une **page de référence** par dialecte (`/alphabet`) ;
2. un **plateau de symboles** à côté des champs où l'on saisit du bhété ;
3. un **affichage correct** de ces lettres (police) et un **stockage cohérent** (forme NFC).

Les notes (« comment ça sonne ») et les exemples de mots attendent une personne compétente. La structure est
construite maintenant, le contenu arrive ensuite, sans nouveau développement.

## Constats qui fondent la conception

- Le Nouveau Testament bhété du dépôt (`corpus/bete.txt` = occidental, `corpus/eastern/`, `corpus/northern/`,
  230 000 à 270 000 mots chacun) est écrit dans l'orthographe pratique des langues ivoiriennes (ILA). La table
  `verses` de production est vide et les 423 lignes archivées du lexique étaient des `_pending_` : le corpus du
  dépôt est la seule source de symboles.
- Les trois dialectes n'écrivent pas pareil :
  - occidental : `ɛ ɔ ɩ ʋ`, tréma sur `a e o i` écrit en lettre + tréma combinant (U+0308), apostrophe `'` devant
    le mot, trait d'union insécable `‑` (U+2011) ;
  - oriental : `ɛ ɔ ɩ ʋ`, `ö ë ï` précomposés (pas de `ä`), trait d'union `-` ;
  - septentrional : `ɛ ɔ ŋ` (pas de `ɩ ʋ`), pas de tréma, `"` pour un ton, trait d'union `-`.
- `ɩ` (U+0269) et `ʋ` (U+028B) viennent de l'Alphabet africain de référence, pas de l'API stricte (`ɪ`, `ʊ`).
- Selon l'orthographe voisine du godié, le ton haut s'écrit par une apostrophe et le ton bas par un trait
  d'union, placés devant la syllabe. Hypothèse à faire valider pour le bhété : la note correspondante reste
  marquée « à valider ».
- Polices : `layout.tsx` charge Inter et Lexend avec le sous-ensemble `latin` seul, qui ne couvre pas
  `ɛ ɔ ɩ ʋ ŋ` ni leurs capitales. La police mono citée (`--font-geist-mono`) n'est pas chargée.
- Recherche : `search_norm` (`lower(unaccent(...))`) transforme `ɛ→e`, `ʋ→v`, `ŋ→n`, `Ɩ→i` mais laisse `ɔ` et
  `ɩ`. Voir « Hors périmètre ».

## Conception

### 1. Données — `lib/phonetic-alphabet.ts`

```ts
type SymbolGroup = 'voyelles' | 'trema' | 'consonnes' | 'marques'
interface PhoneticSymbol {
  id: string
  group: SymbolGroup
  glyph: string            // la forme insérée par le plateau (une seule forme par caractère)
  upper?: string           // capitale, si elle existe
  codePoint: string        // 'U+025B' ; absent pour un groupe de lettres
  typable?: boolean        // bh, kp, gb… : montré sur la page, absent du plateau
  frequency: number        // occurrences dans le Nouveau Testament du dialecte
  upperFrequency?: number
  note: string | null      // null : « Note à venir »
  noteNeedsReview?: boolean
  examples: { bete: string; french: string }[]   // vide au départ
}
export const ALPHABET: Record<DialectKey, PhoneticSymbol[]>
```

- Une entrée par dialecte, avec les chiffres extraits du corpus (voir la maquette). Un symbole n'apparaît pour un
  dialecte que s'il y est attesté.
- Le plateau insère toujours la forme standard du dialecte : `ö` en un seul caractère, le trait d'union propre au
  dialecte (`‑` en occidental, `-` ailleurs), l'apostrophe ASCII.
- Les notes et exemples se renseignent en modifiant ce fichier (pull request). Une table en base viendra quand les
  exemples existeront (approche hybride), sans changer l'interface.

### 2. Page de référence — `/alphabet`

- Les onglets suivent le sélecteur de dialecte existant (`DialectContext`). Groupes : Voyelles, Voyelles à tréma,
  Consonnes, Marques. Chaque carte : glyphe (clic = copie), fréquence, code point, note ou « Note à venir »,
  emplacement « Exemples à venir ».
- Bloc « Pour aller plus loin » : liens vers le tableau de l'API (ipachart.com) et vers l'orthographe des langues
  ivoiriennes de l'ILA si une adresse fiable est trouvée.
- Métadonnées de page, entrée dans `sitemap.ts`. Pas de lien dans la barre de navigation ; liens depuis le plateau
  (« Tout l'alphabet → ») et depuis le mode édition de la fiche du lexique.

### 3. Plateau — `components/SymbolPicker.tsx`

- Bouton `ɛ` à droite du champ ; plateau fermé par défaut ; symboles du dialecte choisi, voyelles puis autres.
- Insertion à la position du curseur ou en remplacement de la sélection ; le curseur reste après le symbole ;
  le texte est mis en NFC.
- Fonction pure `insertAtSelection(value, start, end, glyph)` testée à part du composant.
- Champs équipés (la liste exacte est confirmée à l'implémentation) :
  `ContributionForm` (mot, phrase, forme phonétique, patron, exemple), `ResourceSubmitForm` (texte en bhété, mot à
  mot), `word-link/EntryForm` et `LexiconPanel` (graphie, transcription, nouvelle graphie), `SpellingsList`.
  Les champs en français n'en ont pas.

### 4. Affichage — police et ponctuation

- Une classe `.phonetic` (police à couverture complète, par exemple Noto Sans avec le sous-ensemble `latin-ext`,
  chargée via `next/font`) appliquée partout où du bhété s'affiche : titre et forme entre crochets de
  `LexiconEntry`, liste du lexique, cartes d'exemples et d'usages, lignes de ressources et blocs de mots,
  `InterlinearGloss`.
- Elle remplace `font-mono` pour la forme phonétique.
- `cleanBeteWord` ne retire plus l'apostrophe initiale : c'est une marque de ton.
- Contrôle visuel sur un vrai téléphone Android et iOS 16.1 (la compatibilité Safari 16.1 est une contrainte du projet).

### 5. Enregistrement

- Une fonction `toStoredForm(text)` (`text.normalize('NFC')`) appelée avant écriture dans les fonctions de
  mutation du lexique, des contributions et des ressources. Elle s'applique à l'enregistrement, pas à la frappe,
  pour que le curseur ne saute pas. Traits d'union et apostrophes ne sont pas modifiés : ils varient selon le
  dialecte.

## Tests

- Inventaire : chaque `glyph` correspond à son `codePoint` ; aucun symbole sans dialecte ; `ɩ ʋ` absents du
  septentrional, `ŋ` absent de l'occidental et de l'oriental.
- `insertAtSelection` : curseur, sélection, début et fin de champ.
- `toStoredForm` : lettre + tréma combinant devient un caractère précomposé ; texte sans accent inchangé.
- Rendu statique du plateau et de la page par dialecte, comme les autres tests de composants (`renderToStaticMarkup`).

## Hors périmètre (étapes suivantes)

- **Repli de la recherche** : une migration à appliquer à la main en production, puis reconstruction des index
  basés sur `search_norm`. Règles proposées à faire valider par la personne compétente avant d'écrire la
  migration : `ɛ→e`, `ɔ→o`, `ɩ→i`, `ʋ→u` (et non `v`), `ŋ→n`, capitales comme minuscules. Corriger aussi
  `normWord` (`lib/word-blocks.ts`) pour qu'il reste identique à la fonction SQL.
- Attribut `lang` sur le texte bhété ; audio ; extraction automatique d'exemples depuis le corpus ; table en base
  pour les notes et exemples.

## Questions ouvertes

- Qui valide les notes et le repli de recherche ? (personne compétente, pas encore identifiée)
- Adresse fiable pour l'orthographe de l'ILA : introuvable en ligne pour l'instant.
