-- One-time scheduling for course mailing. Run by hand in the Supabase SQL editor (production)
-- after the two email migrations are applied. Not a migration: it needs a real secret.
--
-- 1. Enable the extensions (Dashboard → Database → Extensions, or the two lines below).
-- 2. Store the secret once in Vault (use the SAME value as the CRON_SECRET env var in Vercel):
--      select vault.create_secret('<CRON_SECRET value>', 'mail_cron_secret');
-- 3. Run the rest of this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running replaces the jobs.
select cron.unschedule(jobid) from cron.job where jobname in ('mail-dispatch', 'mail-weekly-digest');

-- Every 5 minutes: ask the app to send due emails.
select cron.schedule(
  'mail-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://apprendre-le-bhete.com/api/mail/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Mondays 07:00 UTC (07:00 in Côte d'Ivoire): queue last week's progress digests.
select cron.schedule('mail-weekly-digest', '0 7 * * 1', $$select enqueue_weekly_digest();$$);
