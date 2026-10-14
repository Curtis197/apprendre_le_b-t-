-- Resources: optional version of the Bhété text in IPA / African orthography. Its words are linked to the Latin
-- words by position (same line number, same word count), so it is not part of verse_hash.
-- Apply BEFORE deploying the app version that saves it.
alter table community_texts
  add column if not exists content_ipa text
  check (content_ipa is null or char_length(content_ipa) <= 10000);
