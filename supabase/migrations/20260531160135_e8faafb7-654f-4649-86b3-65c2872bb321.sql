ALTER TABLE public.raw_content 
ADD COLUMN IF NOT EXISTS processing_step TEXT;

-- Refresh schema cache visibility
NOTIFY pgrst, 'reload schema';