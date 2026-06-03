DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    AND table_name <> 'daily_backup_logs'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;