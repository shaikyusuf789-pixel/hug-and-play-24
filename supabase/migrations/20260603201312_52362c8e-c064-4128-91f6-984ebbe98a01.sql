-- (1) Re-grant permissions to all tables in the public schema
DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl.table_name);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO authenticated', tbl.table_name);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO anon', tbl.table_name);
        -- Also grant usage on sequences for inserts
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role');
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated');
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon');
    END LOOP;
END;
$$;

-- (2) Ensure RLS is enabled and policies are permissive for all dashboard tables
-- This is a brute-force fix for the "zero" dashboard issue by ensuring the app can read everything.

-- List of tables to fix
-- raw_content, scripts, script_chunks, ocr_results, audio_timestamps, clip_annotations, video_clips, etc.

DO $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY[
        'raw_content', 'scripts', 'script_chunks', 'ocr_results', 
        'audio_timestamps', 'clip_annotations', 'video_clips', 
        'app_metadata', 'app_settings', 'ai_chat_memory', 
        'chat_sessions', 'notifications', 'youtube_seo', 'sources_master'
    ];
BEGIN
    FOREACH t IN ARRAY tables_to_fix LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        
        -- Drop existing "Allow all" policies to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS "Allow all access to authenticated" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all access to anon" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON public.%I', t);
        
        -- Create fresh permissive policies
        EXECUTE format('CREATE POLICY "Allow all for authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
        EXECUTE format('CREATE POLICY "Allow all for anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
    END LOOP;
END;
$$;