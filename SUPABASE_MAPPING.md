# Supabase Backend Configuration for Spark Joy

This project is architected with a strict separation of concerns:
- **Frontend**: Managed via Sky Studio (VibeCoder).
- **Backend**: Managed strictly via your own **Supabase Project**.

## Database Tables Mapping

| Table Name | UI Page / Feature | Description |
|------------|-------------------|-------------|
| `sources_master` | `/sources` | YouTube channels tracked for inspiration. |
| `raw_content` | `/idea-cards` | Extracted video data, summaries, and AI analysis. |
| `scripts` | `/script-generator` | AI-generated video scripts. |
| `script_chunks` | `/audio`, `/slides` | Chunks of scripts with associated audio/images. |
| `youtube_seo` | `/youtube` | SEO metadata (titles, tags, descriptions). |
| `notifications` | UI Notifications | System alerts and user notifications. |
| `user_uploads` | `/uploads` | References to user-uploaded files. |
| `ai_chat_memory` | AI Assistant | Chat history for the internal AI helper. |
| `app_settings` | Settings | Global application configuration. |

## Storage Buckets
- `audio-files`: Generated voiceovers.
- `slides`: Generated slide images.
- `user-uploads`: User-uploaded documents/media.

## Environment Configuration
When migrating this project to another platform (Replit, Bolt, etc.), you must provide the following environment variables:

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase Project Settings > API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Project Settings > API (anon/public) |
| `CUSTOM_SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings > API (service_role) |

**Note on Service Role Key**: Direct Supabase reserves the `SUPABASE_SERVICE_ROLE_KEY` prefix, so we use `CUSTOM_SUPABASE_SERVICE_ROLE_KEY` to connect server-side functions and bypass RLS for administrative tasks.

## Deployment Checklist
1. Provide the Supabase URL and keys in the target platform's secrets/environment settings.
2. The frontend is stateless; all business logic and data resides in Supabase.
3. RLS policies are set to allow `authenticated` and `service_role` access.
4. The `get_public_tables()` RPC function must be present in the Supabase `public` schema for the database browser to function correctly.
