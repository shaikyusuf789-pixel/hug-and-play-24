-- Update Biography
UPDATE public.app_metadata 
SET value = '{
  "name": "SKY Studio",
  "version": "4.5",
  "description": "An autonomous, high-performance YouTube production ecosystem designed for hyper-efficiency. It automates the entire content lifecycle: from scraping competitor channels for viral patterns to generating deep-research scripts, breaking them into manageable chunks, producing high-quality AI voiceovers, and designing professional slides via Gamma.",
  "philosophy": "Minimize human friction, maximize creative output through intelligence-led automation.",
  "tables": {
    "sources_master": "Central registry of monitored YouTube channels (names, URLs).",
    "raw_content": "In-box for all scraped video ideas with title, views, and transcript-summaries.",
    "scripts": "Long-form narrative scripts (1000+ words) generated from approved ideas.",
    "script_chunks": "Atomic segments of scripts for modular asset production (Audio/Slides).",
    "ai_chat_memory": "The persistent memory bank for the Second Brain assistant."
  },
  "workflow": [
    {"step": 1, "page": "Ideas Engine", "description": "Monitor and scrape sources for fresh content signals."},
    {"step": 2, "page": "Idea Cards", "description": "Filter and promote winning ideas to the production pipeline."},
    {"step": 3, "page": "Scripting", "description": "Expand ideas into full scripts using advanced LLM reasoning."},
    {"step": 4, "page": "Chunks", "description": "Deconstruct scripts for modular asset generation."},
    {"step": 5, "page": "Slides/Audio", "description": "Generate visual and auditory assets in parallel."},
    {"step": 6, "page": "YouTube", "description": "Final SEO optimization and distribution."}
  ]
}'::jsonb
WHERE key = 'app_biography';

-- Update Neural Scheme
UPDATE public.app_metadata 
SET value = '{
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
    "Add Monitoring Source",
    "Approve Idea (moves to raw_content.status=''approved'')",
    "Generate Script (creates entry in scripts table)",
    "Chunk Script (creates entries in script_chunks table)",
    "Generate Audio (updates script_chunks.audio_url)",
    "Generate Slide (updates script_chunks.slide_url)"
  ],
  "intelligence_layer": "Powered by GPT-4o-mini for routing and GPT-4o for high-fidelity creative tasks (Scripts/Prompts)."
}'::jsonb
WHERE key = 'neural_scheme';

-- Ensure indexing for history
CREATE INDEX IF NOT EXISTS idx_ai_chat_memory_created_at ON public.ai_chat_memory(created_at DESC);
