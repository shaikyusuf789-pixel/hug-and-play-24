DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
          AND c.relname IN (
            'ai_chat_memory',
            'app_metadata',
            'app_settings',
            'audio_timestamps',
            'chat_sessions',
            'clip_annotations',
            'daily_backup_logs',
            'notifications',
            'ocr_results',
            'raw_content',
            'script_chunks',
            'scripts',
            'sources_master',
            'video_clips',
            'youtube_seo'
          )
    LOOP
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl.table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl.table_name);
    END LOOP;

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_chat_memory TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_metadata TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audio_timestamps TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_sessions TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clip_annotations TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ocr_results TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.raw_content TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.script_chunks TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scripts TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sources_master TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_clips TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.youtube_seo TO anon;
END;
$$;