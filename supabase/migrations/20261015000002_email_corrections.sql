-- Course mailing: emails for corrections ("signalements").
--   * a new report  → the content's author (or every admin when it has no known author)
--   * a decision    → the person who reported
-- New email category « corrections » (opt-out like the others). Re-runnable.

alter table email_outbox drop constraint if exists email_outbox_category_check;
alter table email_outbox add constraint email_outbox_category_check
  check (category in ('teacher_announcements', 'weekly_progress', 'course_activity', 'corrections'));

alter table email_preferences add column if not exists corrections boolean not null default true;
grant insert (corrections) on email_preferences to authenticated;
grant update (corrections) on email_preferences to authenticated;

-- ── New report: tell the author, or the admins if nobody owns the content ───────────────────────
create or replace function enqueue_correction_received_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select r.user_id,
         'corrections',
         'correction_received',
         jsonb_build_object(
           'correction_id', new.id, 'target_type', new.target_type, 'ref_id', new.ref_id,
           'label', new.label, 'field', new.field, 'kind', new.kind,
           'message', new.message, 'suggestion', new.suggestion, 'reporter_name', new.reporter_name),
         'correction-received:' || new.id || ':' || r.user_id
    from (
      select new.owner_id as user_id where new.owner_id is not null
      union
      select ur.user_id from user_roles ur where ur.role = 'admin' and new.owner_id is null
    ) r
   where r.user_id <> new.reporter_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists corrections_enqueue_received on corrections;
create trigger corrections_enqueue_received
  after insert on corrections
  for each row execute function enqueue_correction_received_email();

-- ── Decision: tell the reporter ─────────────────────────────────────────────────────────────────
create or replace function enqueue_correction_resolved_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'open' or new.status not in ('accepted', 'rejected') then
    return new;
  end if;
  -- someone who resolves their own report does not need an email about it
  if new.resolved_by is not distinct from new.reporter_id then
    return new;
  end if;

  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  values (
    new.reporter_id,
    'corrections',
    'correction_resolved',
    jsonb_build_object(
      'correction_id', new.id, 'target_type', new.target_type, 'ref_id', new.ref_id,
      'label', new.label, 'field', new.field, 'outcome', new.status, 'suggestion', new.suggestion),
    'correction-resolved:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists corrections_enqueue_resolved on corrections;
create trigger corrections_enqueue_resolved
  after update of status on corrections
  for each row execute function enqueue_correction_resolved_email();
