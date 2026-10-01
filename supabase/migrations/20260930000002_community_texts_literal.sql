-- Resources: optional word-for-word (mot à mot) translation alongside the idiomatic French one.
-- Mirrors expressions.french_literal and lexicon_examples.french_literal.
alter table community_texts
  add column if not exists content_literal text
  check (content_literal is null or char_length(content_literal) <= 10000);
