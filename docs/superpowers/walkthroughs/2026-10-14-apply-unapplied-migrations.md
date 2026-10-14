# Walkthrough - Applying Unapplied Migrations

**Date:** 2026-10-14  
**Project:** Traduction Bété (`agdqbzbjcxrzfhkvempe`)

## 1. Context & Inspection

We checked the migration status by comparing all 63 migration files in `supabase/migrations` against `supabase_migrations.schema_migrations` on the remote Supabase database (`agdqbzbjcxrzfhkvempe`).

### Audit Summary
All migrations up to `20261012000000_find_lexicon_by_french.sql` were already applied. Two recent migrations remained unapplied:
1. `20261013000000_find_usages_exact_only.sql`:
   - Added `p_exact_only` parameter to `find_usages(...)` function.
   - Fixed variant exclusion when exact matches are required on lexicon entry and usage pages.
2. `20261014000000_resource_ipa_text.sql`:
   - Added `content_ipa` column to `community_texts` table (`text`, max 10000 characters).

## 2. Migrations Applied via Supabase MCP

Both migrations were applied via `supabase-mcp-server:apply_migration`:
- `20261013000000_find_usages_exact_only`: Executed successfully.
- `20261014000000_resource_ipa_text`: Executed successfully.

## 3. Verification & Validation

1. **`community_texts.content_ipa`**:
   - Verified via `information_schema.columns`: Column exists with data type `text`.
2. **`find_usages` signature**:
   - Verified via `pg_proc`: Arguments include `["q", "p_side", "p_limit", "p_offset", "p_threshold", "p_exclude_ref", "p_exact_only", ...]`.
3. **`schema_migrations` Table**:
   - Confirmed both migration versions (`20261014171757` and `20261014171803`) recorded with status completed.
