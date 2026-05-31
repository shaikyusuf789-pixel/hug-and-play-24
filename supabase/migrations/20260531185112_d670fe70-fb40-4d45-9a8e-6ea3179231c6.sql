-- Add video_id column
ALTER TABLE public.raw_content ADD COLUMN IF NOT EXISTS video_id TEXT;

-- Extract video_id from existing youtube URLs
UPDATE public.raw_content
SET video_id = (
  CASE 
    WHEN video_url ~ 'v=([^&]+)' THEN substring(video_url from 'v=([^&]+)')
    WHEN video_url ~ 'youtu\.be/([^?]+)' THEN substring(video_url from 'youtu\.be/([^?]+)')
    WHEN video_url ~ 'youtube\.com/shorts/([^?]+)' THEN substring(video_url from 'youtube\.com/shorts/([^?]+)')
    ELSE NULL
  END
)
WHERE video_id IS NULL AND video_url IS NOT NULL;

-- Add unique constraint
-- Note: If there are existing duplicates, this might fail. We should handle them.
-- For safety, we'll delete duplicates first, keeping the most recent one.
DELETE FROM public.raw_content a
USING public.raw_content b
WHERE a.id < b.id
  AND a.video_id = b.video_id
  AND a.video_id IS NOT NULL;

-- Now add the constraint
ALTER TABLE public.raw_content ADD CONSTRAINT unique_video_id UNIQUE (video_id);

-- Also add an index for performance
CREATE INDEX IF NOT EXISTS idx_raw_content_video_id ON public.raw_content(video_id);
