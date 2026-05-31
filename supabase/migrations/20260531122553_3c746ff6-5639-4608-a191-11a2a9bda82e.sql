-- Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('slides', 'slides', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('user-uploads', 'user-uploads', true) ON CONFLICT (id) DO NOTHING;

-- Schema
-- name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Tables
CREATE TABLE public.ai_chat_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    role text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'general'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sources_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    type text NOT NULL,
    channel_name text NOT NULL,
    source_url text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.raw_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    source_id uuid REFERENCES public.sources_master(id),
    original_title text NOT NULL,
    video_url text NOT NULL UNIQUE,
    views bigint DEFAULT 0,
    published_at timestamp with time zone,
    status text DEFAULT 'pending'::text,
    original_summary text,
    proposed_title text,
    new_thumbnail_outline text,
    target_audience text,
    core_hooks text,
    summary_points jsonb,
    video_outline jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_date text,
    duration text,
    thumbnail_url text,
    date_extracted timestamp with time zone DEFAULT now()
);

CREATE TABLE public.scripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    idea_id uuid REFERENCES public.raw_content(id),
    title text NOT NULL,
    content text NOT NULL,
    word_count integer,
    video_type text,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'DRAFT'::text,
    final_audio_url text
);

CREATE TABLE public.script_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    script_id uuid NOT NULL REFERENCES public.scripts(id),
    chunk_index integer NOT NULL,
    content text NOT NULL,
    word_count integer,
    status text DEFAULT 'PENDING'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_url text,
    slide_prompt text,
    slide_url text,
    slide_id text,
    annotations jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.youtube_seo (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    script_id uuid NOT NULL UNIQUE REFERENCES public.scripts(id),
    title_variations text[] DEFAULT '{}'::text[],
    selected_title text,
    tags text[] DEFAULT '{}'::text[],
    description text,
    thumbnail_lines jsonb DEFAULT '{}'::jsonb,
    thumbnail_prompt text,
    thumbnail_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.daily_backup_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    last_backup_time timestamp with time zone DEFAULT now(),
    status text NOT NULL,
    tables_backed_up jsonb DEFAULT '[]'::jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_type text,
    file_size bigint,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Triggers
CREATE TRIGGER set_updated_at_raw BEFORE UPDATE ON public.raw_content FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_scripts BEFORE UPDATE ON public.scripts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_settings BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_sources BEFORE UPDATE ON public.sources_master FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_uploads BEFORE UPDATE ON public.user_uploads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_raw_content_updated_at BEFORE UPDATE ON public.raw_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_script_chunks_updated_at BEFORE UPDATE ON public.script_chunks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scripts_updated_at BEFORE UPDATE ON public.scripts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sources_master_updated_at BEFORE UPDATE ON public.sources_master FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_uploads_updated_at BEFORE UPDATE ON public.user_uploads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_youtube_seo_updated_at BEFORE UPDATE ON public.youtube_seo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.ai_chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_seo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_uploads ENABLE ROW LEVEL SECURITY;

-- Permissive Policies
CREATE POLICY "Allow all access to authenticated" ON public.ai_chat_memory FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.app_settings FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.sources_master FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.raw_content FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.scripts FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.script_chunks FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.youtube_seo FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.notifications FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.daily_backup_logs FOR ALL USING (true);
CREATE POLICY "Allow all access to authenticated" ON public.user_uploads FOR ALL USING (true);

-- Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Seed Data
INSERT INTO public.app_settings (key, value) VALUES ('engine_auto_run', '{"enabled": true, "interval_hrs": 1}') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.sources_master (type, channel_name, source_url) VALUES 
('Youtube', 'SKY', 'https://www.youtube.com/@Skyacademytelugu'),
('youtube', 'SKY Studio Test', 'https://www.youtube.com/@Skystudioofficial'),
('Youtube', 'adda247', 'https://www.youtube.com/@adda247')
ON CONFLICT (source_url) DO NOTHING;
