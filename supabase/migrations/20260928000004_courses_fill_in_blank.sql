-- ── Update lessons_kind_check constraint to include 'fill_in_blank' ──

alter table public.lessons drop constraint if exists lessons_kind_check;
alter table public.lessons add constraint lessons_kind_check check (kind in ('text', 'audio', 'video', 'quiz', 'assignment', 'fill_in_blank'));
