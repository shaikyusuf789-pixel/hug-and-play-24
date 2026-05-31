-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_raw_content_source') THEN
        ALTER TABLE public.raw_content 
        ADD CONSTRAINT fk_raw_content_source 
        FOREIGN KEY (source_id) 
        REFERENCES public.sources_master(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- Fix any potential permission issues
GRANT SELECT ON public.raw_content TO anon, authenticated, service_role;
GRANT SELECT ON public.sources_master TO anon, authenticated, service_role;
