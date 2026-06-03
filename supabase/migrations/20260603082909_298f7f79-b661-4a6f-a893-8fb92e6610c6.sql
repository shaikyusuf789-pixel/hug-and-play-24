
-- 1. Drop all anon ALL policies on pipeline tables
DROP POLICY IF EXISTS "Allow all access to anon" ON public.app_settings;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.audio_timestamps;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.clip_annotations;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.notifications;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.ocr_results;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.raw_content;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.script_chunks;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.scripts;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.sources_master;
DROP POLICY IF EXISTS "Allow all access to anon" ON public.video_clips;

-- Revoke anon grants too (defense in depth)
REVOKE ALL ON public.app_settings, public.audio_timestamps, public.clip_annotations,
  public.notifications, public.ocr_results, public.raw_content, public.script_chunks,
  public.scripts, public.sources_master, public.video_clips FROM anon;

-- 2. Fix ai_chat_memory and chat_sessions: remove "OR user_id IS NULL" bypass
DROP POLICY IF EXISTS "Users can view their own chat messages" ON public.ai_chat_memory;
DROP POLICY IF EXISTS "Users can create their own chat messages" ON public.ai_chat_memory;
CREATE POLICY "Users can view their own chat messages" ON public.ai_chat_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own chat messages" ON public.ai_chat_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.chat_sessions;
CREATE POLICY "Users can view their own sessions" ON public.chat_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own sessions" ON public.chat_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sessions" ON public.chat_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sessions" ON public.chat_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Backup logs: restrict to service_role only
DROP POLICY IF EXISTS "Allow all access to authenticated" ON public.daily_backup_logs;
REVOKE ALL ON public.daily_backup_logs FROM authenticated, anon;
GRANT ALL ON public.daily_backup_logs TO service_role;
