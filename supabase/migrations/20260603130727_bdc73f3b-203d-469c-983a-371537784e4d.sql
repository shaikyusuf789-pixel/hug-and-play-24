UPDATE public.video_clips
SET status = 'failed',
    error_msg = 'Manually reset — render stuck for 30+ minutes (likely Railway OOM)',
    updated_at = now()
WHERE script_id = 'd5ee0a25-1e18-4935-ad16-483e2ae6caab'
  AND status IN ('rendering', 'pending', 'queued');