# Appliquer la migration des liens IPA sur les blocs de mots

## Ce que fait la migration

Elle ajoute deux colonnes à `resource_word_blocks` (`ipa_idx`, les positions des mots IPA liés au bloc, et `ipa_hash`, le md5 de la ligne IPA sur laquelle ces liens ont été faits). Elle remplace `get_resource_words` (qui renvoie aussi `ipa_idx` par bloc, et `ipa_line` / `ipa_stale` par verset) et `save_resource_verse` (nouveau paramètre optionnel `p_base_ipa`, sans effet s'il est omis).

À appliquer AVANT de déployer la version de l'application qui enregistre les liens IPA.

## Comment l'appliquer

1. Ouvrir l'éditeur SQL de Supabase, projet `agdqbzbjcxrzfhkvempe`.
2. Coller tout le contenu de `supabase/migrations/20261015000000_word_block_ipa_links.sql`.
3. Exécuter une seule fois.

## Vérifications en lecture seule

```sql
select column_name, data_type from information_schema.columns
 where table_name = 'resource_word_blocks' and column_name in ('ipa_idx', 'ipa_hash');
```
Attendu : 2 lignes.

```sql
select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'save_resource_verse';
```
Attendu : une seule ligne, qui finit par `, p_base_ipa text`.

```sql
select verse_no, stale, ipa_line is not null as has_ipa, ipa_stale, jsonb_array_length(blocks) as blocks
 from get_resource_words('43259afc-d7c3-4944-a7c3-0dae605b9869');
```
Attendu : 5 lignes, `stale = false`, `ipa_stale = false`.

```sql
select blocks -> 0 -> 'ipa_idx' as first_block_ipa from get_resource_words('43259afc-d7c3-4944-a7c3-0dae605b9869') limit 1;
```
Attendu : `[]`.

## Retour arrière

1. Supprimer les deux nouvelles fonctions :
   ```sql
   drop function if exists get_resource_words(uuid);
   drop function if exists save_resource_verse(uuid, int, text, text, text, text, jsonb, text);
   ```
2. Rejouer les deux définitions de fonction de `supabase/migrations/20261008000000_lexicon_from_word_links.sql` : `get_resource_words` (lignes 455 à 504) puis `save_resource_verse` (lignes 507 à 715), avec leurs lignes `revoke` / `grant`.
3. Les colonnes peuvent rester (elles sont sans effet), ou être supprimées :
   ```sql
   alter table resource_word_blocks drop constraint resource_word_blocks_ipa_hash_ck, drop column ipa_idx, drop column ipa_hash;
   ```
