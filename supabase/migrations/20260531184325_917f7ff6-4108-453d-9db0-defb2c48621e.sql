CREATE TABLE IF NOT EXISTS public.app_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_metadata TO authenticated;
GRANT ALL ON public.app_metadata TO service_role;

ALTER TABLE public.app_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all metadata for authenticated users" 
ON public.app_metadata FOR SELECT TO authenticated USING (true);

-- Insert App Biography
INSERT INTO public.app_metadata (key, value) VALUES (
    'app_biography',
    '{
        "name": "SKY Studio",
        "version": "4.2",
        "description": "An end-to-end automated YouTube production pipeline that converts trending topics into fully produced videos using AI.",
        "workflow": [
            {"step": 1, "page": "Ideas Engine", "description": "Manage YouTube channel sources and trigger scrapers to find new ideas."},
            {"step": 2, "page": "Idea Cards", "description": "Review, approve, or reject scraped ideas. Approved ideas move to scripting."},
            {"step": 3, "page": "Scripting", "description": "Generate full-length (1000+ words) scripts from approved ideas."},
            {"step": 4, "page": "Chunks", "description": "Break scripts into 180-word chunks for voiceover and slide generation."},
            {"step": 5, "page": "Audio/Slides", "description": "Generate media assets (Audio, Slides, Hooks)."},
            {"step": 6, "page": "YouTube", "description": "Finalize metadata and SEO for upload."}
        ],
        "tables": {
            "sources_master": "Stores YouTube channel names and URLs for scraping.",
            "raw_content": "Stores all scraped ideas and their metadata.",
            "scripts": "Stores generated full scripts.",
            "script_chunks": "Stores segmented script pieces.",
            "ai_chat_memory": "Stores the history of this AI interaction."
        }
    }'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Insert Neural Scheme (Structure)
INSERT INTO public.app_metadata (key, value) VALUES (
    'neural_scheme',
    '{
        "pages": {
            "Dashboard": "/dashboard",
            "Ideas Engine": "/ideas-engine",
            "Idea Cards": "/idea-cards",
            "Scripting": "/script-generator",
            "Chunks": "/chunks",
            "Audio": "/audio",
            "Slides": "/slides",
            "YouTube": "/youtube",
            "History": "/history",
            "Storage": "/storage",
            "Settings": "/settings"
        },
        "critical_actions": [
            "Add Source",
            "Initialize Scraper",
            "Approve Idea",
            "Generate Script",
            "Regenerate Script",
            "Chunk Script"
        ]
    }'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
