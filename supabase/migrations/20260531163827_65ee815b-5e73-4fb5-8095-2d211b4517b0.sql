-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Ensure processing_step exists and is of type text
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_content' AND column_name = 'processing_step') THEN
        ALTER TABLE public.raw_content ADD COLUMN processing_step TEXT;
    END IF;
END $$;

-- Ensure grants are correct for all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
