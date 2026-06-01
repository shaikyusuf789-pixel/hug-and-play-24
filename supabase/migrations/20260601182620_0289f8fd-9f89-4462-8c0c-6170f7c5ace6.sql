
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule of this job
SELECT cron.unschedule('process-generation-queue')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-generation-queue');

SELECT cron.schedule(
  'process-generation-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eozteueesaemhcmbqcxt.supabase.co/functions/v1/process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
