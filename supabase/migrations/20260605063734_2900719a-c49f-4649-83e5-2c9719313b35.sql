
-- 1) daily_backup_logs: remove permissive policy. Service role bypasses RLS.
DROP POLICY IF EXISTS open_access ON public.daily_backup_logs;
REVOKE ALL ON public.daily_backup_logs FROM anon, authenticated;

-- 2) video-clips bucket storage policies (mirror audio-files/slides)
CREATE POLICY "Public read video-clips" ON storage.objects
  FOR SELECT USING (bucket_id = 'video-clips');
CREATE POLICY "Auth write video-clips" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'video-clips');
CREATE POLICY "Service update video-clips" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'video-clips');
CREATE POLICY "Service delete video-clips" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'video-clips');

-- 3) Revoke EXECUTE on SECURITY DEFINER function from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.get_public_tables() FROM PUBLIC, anon, authenticated;
