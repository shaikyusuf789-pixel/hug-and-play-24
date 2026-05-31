# Supabase Backend Configuration for Spark Joy

This project is architected with a strict separation of concerns:
- **Frontend**: Managed via Lovable (VibeCoder).
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

## Deployment Note
When migrating this project to another platform (Replit, Bolt, etc.), ensure you:
1. Provide the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the environment variables.
2. The frontend is stateless; all business data resides in Supabase.
3. RLS policies are set to allow `authenticated` and `service_role` full access to enable the server-side engine functions.
