-- Add processing_step column
ALTER TABLE public.raw_content ADD COLUMN IF NOT EXISTS processing_step TEXT;

-- Enable Realtime for raw_content
-- First, ensure the publication exists (it usually does in Supabase)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add the table to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_content;
