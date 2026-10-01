-- The resources form and filters offer a 'video' type (YouTube links via video_url),
-- but the original CHECK constraint did not allow it, so every video submission was rejected.
-- 'course' stays excluded: courses moved to /courses and /resources?type=course redirects there.
alter table community_texts drop constraint if exists community_texts_type_check;
alter table community_texts
  add constraint community_texts_type_check
  check (type in ('song', 'story', 'poem', 'proverb', 'speech', 'riddle', 'video', 'other'));
