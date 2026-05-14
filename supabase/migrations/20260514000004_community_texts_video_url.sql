-- Add optional YouTube video URL to community_texts
alter table community_texts add column if not exists video_url text;
