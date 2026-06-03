-- GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- Explicitly for the key tables mentioned in stats
GRANT ALL ON public.raw_content TO service_role, authenticated, anon;
GRANT ALL ON public.scripts TO service_role, authenticated, anon;
GRANT ALL ON public.script_chunks TO service_role, authenticated, anon;
GRANT ALL ON public.video_clips TO service_role, authenticated, anon;
GRANT ALL ON public.sources_master TO service_role, authenticated, anon;
GRANT ALL ON public.app_settings TO service_role, authenticated, anon;
GRANT ALL ON public.notifications TO service_role, authenticated, anon;
GRANT ALL ON public.daily_backup_logs TO service_role, authenticated, anon;
GRANT ALL ON public.youtube_seo TO service_role, authenticated, anon;
GRANT ALL ON public.ai_chat_memory TO service_role, authenticated, anon;
GRANT ALL ON public.chat_sessions TO service_role, authenticated, anon;
GRANT ALL ON public.ocr_results TO service_role, authenticated, anon;
GRANT ALL ON public.clip_annotations TO service_role, authenticated, anon;
GRANT ALL ON public.audio_timestamps TO service_role, authenticated, anon;

-- Ensure RLS doesn't block
ALTER TABLE public.raw_content DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_clips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources_master DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_backup_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_seo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_memory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_annotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_timestamps DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS but with a truly open policy if disabling isn't enough or permitted by environment
ALTER TABLE public.raw_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.raw_content;
CREATE POLICY "open_access" ON public.raw_content FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.scripts;
CREATE POLICY "open_access" ON public.scripts FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.script_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.script_chunks;
CREATE POLICY "open_access" ON public.script_chunks FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.video_clips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.video_clips;
CREATE POLICY "open_access" ON public.video_clips FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.sources_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.sources_master;
CREATE POLICY "open_access" ON public.sources_master FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.app_settings;
CREATE POLICY "open_access" ON public.app_settings FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.notifications;
CREATE POLICY "open_access" ON public.notifications FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.daily_backup_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.daily_backup_logs;
CREATE POLICY "open_access" ON public.daily_backup_logs FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.youtube_seo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.youtube_seo;
CREATE POLICY "open_access" ON public.youtube_seo FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.ai_chat_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.ai_chat_memory;
CREATE POLICY "open_access" ON public.ai_chat_memory FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.chat_sessions;
CREATE POLICY "open_access" ON public.chat_sessions FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.ocr_results;
CREATE POLICY "open_access" ON public.ocr_results FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.clip_annotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.clip_annotations;
CREATE POLICY "open_access" ON public.clip_annotations FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.audio_timestamps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access" ON public.audio_timestamps;
CREATE POLICY "open_access" ON public.audio_timestamps FOR ALL TO public USING (true) WITH CHECK (true);