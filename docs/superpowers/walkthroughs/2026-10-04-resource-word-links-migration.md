# Walkthrough - Migration `20261007000000_resource_word_links.sql`

## Contexte et Objectif

La migration `supabase/migrations/20261007000000_resource_word_links.sql` met en place la structure de données et les fonctions nécessaires pour la lecture mot à mot des ressources (`community_texts`).

Elle permet d'associer les mots d'un verset en Bété avec leurs équivalents mot à mot en français (relation several-to-several, mots non consécutifs possibles) et d'annoter les marqueurs grammaticaux sans impacter le lexique global.

## Détails techniques de la migration

1. **Fonctions utilitaires internes** (privées, accès révoqué pour public/anon/authenticated) :
   - `verse_line(text, int)` : extrait le n-ième verset (non vide).
   - `verse_hash(text, text, int)` : empreinte md5 des lignes Bété et mot à mot.
   - `word_count(text)` : compte de mots selon les séparateurs d'espaces / insécables.
   - `block_words(text, int[])` : extrait et joint les mots aux positions spécifiées.
   - `block_word_norm(text, int[])` : normalisation via `usage_token_norm`.
   - `replace_nth_line(text, int, text)` : remplace la ligne corrigée en préservant la mise en page.

2. **Tables créées** :
   - `public.resource_word_blocks` : blocs d'alignement par verset (`verse_no`, `position`, `bete_idx`, `gloss_idx`, `is_marker`, `solo`, `note`, `composition`, `verse_hash`).
   - `public.resource_word_markers` : signification et type des marqueurs grammaticaux par ressource et token normalisé.
   - RLS activée avec politiques de lecture publique (`SELECT USING (true)`).

3. **Fonctions RPC `SECURITY DEFINER`** :
   - `get_resource_words(p_resource uuid)` : lecture des versets et des blocs ordonnés (détecte si le texte a été modifié via `stale`). Accessible en anonyme et authentifié.
   - `save_resource_verse(...)` : écriture atomique et validation complète des blocs, mise à jour des marqueurs et synchronisation des corrections textuelles. Accessible aux utilisateurs authentifiés uniquement (propriétaire de la ressource).

## Application et Validation

### 1. Application Supabase MCP
- Migration appliquée avec succès via `supabase-mcp-server:apply_migration` sur le projet distant `agdqbzbjcxrzfhkvempe` :
  - **Nom** : `20261007000000_resource_word_links`
  - **Résultat** : `{"success": true}`

### 2. Validation dans la base distante
- Migration répertoriée dans le schéma Supabase.
- Tables `resource_word_blocks` et `resource_word_markers` confirmées.
- Fonctions `get_resource_words` et `save_resource_verse` enregistrées en `SECURITY DEFINER` avec les types de retour conformes.
- Tests automatisés (96/96 passés avec succès dans la suite de tests `word-links`).
