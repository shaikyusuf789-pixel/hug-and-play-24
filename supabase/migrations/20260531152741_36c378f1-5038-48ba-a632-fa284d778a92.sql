-- 1. Create tables
CREATE TABLE public.sources_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_name TEXT NOT NULL,
    source_url TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'youtube',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.raw_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.sources_master(id),
    original_title TEXT NOT NULL,
    video_url TEXT UNIQUE NOT NULL,
    views BIGINT,
    published_at TIMESTAMPTZ,
    status TEXT DEFAULT 'Pending',
    processing_step TEXT,
    original_summary TEXT,
    proposed_title TEXT,
    new_thumbnail_outline TEXT,
    target_audience TEXT,
    core_hooks TEXT,
    summary_points JSONB,
    video_outline JSONB,
    published_date TEXT,
    duration TEXT,
    thumbnail_url TEXT,
    date_extracted TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID REFERENCES public.raw_content(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER,
    video_type TEXT,
    model TEXT,
    status TEXT DEFAULT 'SCRIPT_DONE',
    final_audio_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.script_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES public.scripts(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER,
    status TEXT DEFAULT 'PENDING',
    audio_url TEXT,
    slide_id TEXT,
    slide_prompt TEXT,
    slide_url TEXT,
    annotations JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.daily_backup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL,
    error_message TEXT,
    tables_backed_up JSONB,
    last_backup_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.youtube_seo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID UNIQUE REFERENCES public.scripts(id) ON DELETE CASCADE,
    title_variations TEXT[],
    selected_title TEXT,
    tags TEXT[],
    description TEXT,
    thumbnail_lines JSONB,
    thumbnail_prompt TEXT,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ai_chat_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. Enable RLS
ALTER TABLE public.sources_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_seo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_memory ENABLE ROW LEVEL SECURITY;

-- 4. Create dummy policy for all access (Allow all access to authenticated)
CREATE POLICY "Allow all access to authenticated" ON public.sources_master FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.raw_content FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.scripts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.script_chunks FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.app_settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.notifications FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.daily_backup_logs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.youtube_seo FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.ai_chat_memory FOR ALL TO authenticated USING (true);

-- 5. Helper function for dynamic tables
CREATE OR REPLACE FUNCTION public.get_public_tables()
RETURNS TABLE (table_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_public_tables() TO authenticated;
