-- Enable pgvector extension
create extension if not exists vector;

-- Raw parallel corpus
create table if not exists verses (
  id          uuid primary key default gen_random_uuid(),
  book        text not null,
  chapter     int  not null,
  verse       int  not null,
  bete_text   text not null,
  french_text text not null,
  unique (book, chapter, verse)
);

-- Core lexicon
create table if not exists lexicon (
  id                uuid    primary key default gen_random_uuid(),
  bete_word         text    not null unique,
  bete_phonetic     text    not null,
  french_candidates jsonb   not null,
  top_french        text    not null,
  probability       float   not null,
  embedding         vector(384),
  pos               text,
  notes             text,
  validated         bool    not null default false,
  upvotes           int     not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists lexicon_embedding_idx
  on lexicon using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists lexicon_top_french_idx  on lexicon (top_french);
create index if not exists lexicon_phonetic_idx    on lexicon (bete_phonetic);

-- NT example sentences per lexicon entry
create table if not exists lexicon_examples (
  id           uuid primary key default gen_random_uuid(),
  lexicon_id   uuid references lexicon(id) on delete cascade,
  verse_id     uuid references verses(id),
  bete_snippet   text not null,
  french_snippet text not null
);

-- Raw eflomal output (kept for retraining)
create table if not exists alignments (
  id          uuid  primary key default gen_random_uuid(),
  french_word text  not null,
  bete_word   text  not null,
  score       float not null,
  verse_id    uuid  references verses(id)
);

-- Grammar rules (user-contributed)
create table if not exists grammar_rules (
  id                   uuid primary key default gen_random_uuid(),
  category             text not null,
  pattern_french       text not null,
  pattern_bete         text not null,
  description          text not null,
  example_french       text,
  example_bete         text,
  example_bete_phonetic text,
  validated            bool not null default false,
  upvotes              int  not null default 0,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now()
);

-- Idiomatic / fixed expressions (user-contributed)
create table if not exists expressions (
  id               uuid primary key default gen_random_uuid(),
  french_phrase    text not null,
  bete_phrase      text not null,
  bete_phonetic    text not null,
  type             text not null,
  embedding        vector(384),
  example_verse_id uuid references verses(id),
  validated        bool not null default false,
  upvotes          int  not null default 0,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists expressions_embedding_idx
  on expressions using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- User feedback on translations and lexicon entries
create table if not exists user_feedback (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id),
  lexicon_id              uuid references lexicon(id),
  type                    text not null,
  suggested_bete          text,
  suggested_bete_phonetic text,
  translator_phrase       text,
  created_at              timestamptz not null default now()
);
