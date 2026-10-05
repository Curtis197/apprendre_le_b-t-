-- supabase/migrations/20261010000000_remove_voting.sql
-- Voting is removed: contributions are usable at once and the community corrects them afterwards
-- (the model of resources). The upvotes columns and user_votes stay, inert.
-- Spec: docs/superpowers/specs/2026-10-05-contribute-page-voting-audio-funding-design.md
-- Re-runnable. Apply by hand in production (it drops triggers, functions and policies).

begin;

-- ── 1. what was waiting for votes is validated ──────────────────────────────────────────────────
update expressions set validated = true where not validated;
update grammar_rules set validated = true where not validated;

-- New contributions are validated from the start.
alter table expressions   alter column validated set default true;
alter table grammar_rules alter column validated set default true;

-- ── 2. no more validation by score ──────────────────────────────────────────────────────────────
drop trigger if exists trg_auto_validate_grammar_rules on grammar_rules;
drop trigger if exists trg_auto_validate_expressions on expressions;
drop trigger if exists trg_auto_validate_community_texts on community_texts;
drop function if exists auto_validate_on_upvotes();

-- ── 3. no more vote functions ───────────────────────────────────────────────────────────────────
drop function if exists vote(text, uuid, text);
drop function if exists increment_upvotes(text, uuid, int);
drop function if exists increment_upvotes(text, uuid);

-- ── 4. the "vote" update policies let any signed-in user edit any column of any row ─────────────
-- Nothing needs them once voting is gone. (The lexicon policy "lexicon upvote" stays: the description
-- editing and lexicon_guard_update rely on it.)
drop policy if exists "grammar_rules vote" on grammar_rules;
drop policy if exists "expressions vote" on expressions;

commit;
