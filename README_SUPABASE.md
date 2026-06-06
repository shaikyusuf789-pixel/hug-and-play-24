# Sky Studio — Backend Handover (v5.0, 2026-06-02)

This project is architected with a strict separation:
- **Frontend**: TanStack Start v1 (Lovable / VibeCoder).
- **Backend (data, auth, storage, secrets)**: a single direct Supabase project — **NOT** the platform's default managed DB.

## 🔗 Active Supabase Project

- **Project ref:** `eozteueesaemhcmbqcxt`
- **Project URL:** `https://eozteueesaemhcmbqcxt.supabase.co`
- **Publishable Key:** see `VITE_SUPABASE_PUBLISHABLE_KEY` (safe in client)
- **Service Role Key:** stored as the secret `SUPABASE_SERVICE_ROLE_KEY` (and `CUSTOM_SUPABASE_SERVICE_ROLE_KEY` for direct-DB tools). Server-side only.

> The earlier project `klhcrdacefntzqwqwiiu` is retired. Anything pointing at it must be updated.

## 🗄️ Database Table → UI Mapping

| Table | UI Page / Feature |
|---|---|
| `sources_master` | `/ideas-engine` — channel registry |
| `raw_content` | `/idea-cards`, `/content-preview`, `/dashboard` counts |
| `scripts` | `/script-generator`, `/chunks`, `/audio`, `/slides` selectors |
| `script_chunks` | `/chunks`, `/audio`, `/slides`, `/annotations` per-chunk rows |
| `audio_timestamps` | `/annotations` — ElevenLabs forced-alignment per-word timings |
| `ocr_results` | `/annotations` — Google Vision word + bbox JSON |
| `clip_annotations` | `/annotations` — AI overlay JSON |
| `video_clips` | `/annotations` final clip, `/video-editor` |
| `youtube_seo` | `/youtube` |
| `notifications` | header bell |
| `user_uploads` | `/uploads` |
| `ai_chat_memory` | `/history` (Neural History / Second Brain) |
| `app_settings`, `app_metadata` | `/settings`, `/pipeline` |
| `daily_backup_logs` | Dashboard "Full Backup" button |

## 🪣 Storage Buckets (all public)

- `slides` — `{script_id}/slide_{nnn}.png` Gamma deck output
- `audio-files` — `{script_id}/{chunk}.mp3` + merged master
- `video-clips` — `{script_id}/clip_{nnn}.mp4` per-chunk rendered + `mega.mp4`
- `user-uploads` — PDFs / transcripts referenced by AI

## 🔐 Secrets (Supabase Edge Function Secrets)

Required: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_VISION_API_KEY`, `LOVABLE_API_KEY`, `APIFY_API_TOKEN`, `ELEVEN_LABS_API_KEY`, `GAMMA_API_KEY`, plus the Supabase `*_KEY` / `*_KEYS` / `JWKS` / `DB_URL` set.

`GOOGLE_VISION_API_KEY` is a separate key from `GOOGLE_API_KEY`. It must be issued from a Google Cloud project where the **Vision AI API** (`vision.googleapis.com`) is enabled and not blocked. The Gemini key (`GOOGLE_API_KEY`) lives on `aistudio.google.com` and is unrelated.

## 🛠️ Architecture Notes

1. **OCR** runs in `src/lib/ocr.functions.ts` via Google Cloud Vision `DOCUMENT_TEXT_DETECTION`. No Railway dependency.
2. **Per-word timestamps** run in `src/lib/timestamps.functions.ts` via ElevenLabs Forced Alignment. No Railway dependency. Original text is ASCII-normalized with `any-ascii` before being sent.
3. **Clip rendering + mega-merge** are the only Railway responsibilities. Repo: `shaikyusuf789-pixel/sky-annotations-worker`. Deploy URL: `https://sky-annotations-worker-production.up.railway.app`.
4. **Annotation lead** — render worker subtracts `ANNOTATION_LEAD_SECONDS` (default `0.6`) from every annotation `start_time` so overlays land before the matching voice line.
5. **Dynamic Database Browser** (`/tables`) uses the SECURITY DEFINER RPC `public.get_public_tables()` to list every public table.
6. **Admin client** (`supabaseAdmin` in `src/integrations/supabase/client.server.ts`) uses the service-role key to bypass RLS for server fns.

## 🚀 Porting to Replit / Bolt / Another Builder

1. Copy this repo's `src/` and `railway-worker/`.
2. On the target platform, set:
   - `VITE_SUPABASE_URL=https://eozteueesaemhcmbqcxt.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role key>` (server-side only)
   - All secrets in the list above.
3. Apply `docs/backup/schema.sql` then `docs/backup/data.sql` to a fresh Supabase project (or reuse `eozteueesaemhcmbqcxt`).
4. Ensure these RPCs exist:

   ```sql
   CREATE OR REPLACE FUNCTION public.get_public_tables()
   RETURNS TABLE (table_name TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
   BEGIN
     RETURN QUERY SELECT t.table_name::TEXT FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';
   END; $$;
   ```

5. Redeploy `railway-worker/` to Railway, with env vars listed in `docs/UI_SPEC.md` §8.
6. Open `/annotations`, pick a script, click **All OCR → All Timestamps → All Annotations → Render All → Merge Mega Video** and confirm a 4K MP4 lands in `video-clips/`.
