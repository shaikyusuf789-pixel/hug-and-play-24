# Supabase Mapping (Sky Studio, v5.0)

This file is the single source of truth for **table → UI** wiring. Keep it in sync with `docs/UI_SPEC.md` §3.

## Project

- **Ref:** `eozteueesaemhcmbqcxt`
- **URL:** `https://eozteueesaemhcmbqcxt.supabase.co`

## Tables → UI

| Table | UI Page / Feature | Notes |
|---|---|---|
| `sources_master` | `/ideas-engine` | YouTube channels tracked |
| `raw_content` | `/idea-cards`, `/content-preview`, `/dashboard` | Pending / Approved / Priority statuses |
| `scripts` | `/script-generator`, `/chunks`, `/audio`, `/slides`, `/annotations` selectors | |
| `script_chunks` | `/chunks`, `/audio`, `/slides`, `/annotations` per-chunk rows | `chunk_number` is 0-indexed in DB |
| `audio_timestamps` | `/annotations` Timestamps panel | Source: ElevenLabs Forced Alignment |
| `ocr_results` | `/annotations` OCR Output panel | Source: Google Cloud Vision `DOCUMENT_TEXT_DETECTION` |
| `clip_annotations` | `/annotations` Annotations panel | AI overlay JSON |
| `video_clips` | `/annotations` Final Clip + `/master-video` | MP4 stored in `video-clips/` bucket |
| `youtube_seo` | `/youtube` | Title/desc/tags/thumb per script |
| `notifications` | header bell | |
| `user_uploads` | `/uploads` | |
| `ai_chat_memory` | `/history` (Neural History) | Second Brain chat log |
| `app_settings` | `/settings`, `/pipeline` | Single-row config |
| `app_metadata` | misc kv | |
| `daily_backup_logs` | Dashboard "Full Backup" | |
| `chat_sessions` | reserved (multi-session chat) | |

## Storage Buckets

| Bucket | Public | Path pattern |
|---|---|---|
| `slides` | yes | `{script_id}/slide_{nnn}.png` |
| `audio-files` | yes | `{script_id}/{chunk}.mp3` + merged master |
| `video-clips` | yes | `{script_id}/clip_{nnn}.mp4` + `mega.mp4` |
| `user-uploads` | yes | as-uploaded |

## Required RPCs

- `public.get_public_tables()` — SECURITY DEFINER, used by `/tables` to enumerate the schema.
- `public.update_updated_at_column()` / `public.handle_updated_at()` — trigger helpers.

## Realtime Publication

`supabase_realtime` includes at minimum: `raw_content`, `scripts`. Idea Cards, Content Preview, Dashboard, and Tables subscribe via Supabase Realtime.

## Env Variables Consumed

- Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CUSTOM_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`.

## Notes

- RLS is currently permissive (single-user). Multi-user requires `user_id` columns + tight policies.
- The frontend never holds privileged secrets — service-role calls happen only in `createServerFn` handlers.
