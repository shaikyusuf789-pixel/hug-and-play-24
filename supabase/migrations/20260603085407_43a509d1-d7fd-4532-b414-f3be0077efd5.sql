
-- Restore anon access for single-user app with no auth flow
-- Tables: scripts, script_chunks, raw_content, sources_master, notifications, app_settings,
--        audio_timestamps, clip_annotations, ocr_results, video_clips

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'scripts','script_chunks','raw_content','sources_master','notifications',
    'app_settings','audio_timestamps','clip_annotations','ocr_results','video_clips',
    'youtube_seo','app_metadata'
  ])
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    -- Drop restrictive policies and add permissive ones for anon
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access to anon" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Allow all access to anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
