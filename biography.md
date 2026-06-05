# Sky Studio — Project Biography (v6.0)

> Single-source reproduction guide for the Sky Studio video pipeline. Any AI agent (Replit, Bolt, Cursor) should be able to rebuild this app one-to-one from this file alone.

---

## 1. Overview & Architecture

**Sky Studio** is an autonomous AI video-production pipeline for Indian competitive-exam YouTube content (SSC, UPSC, RRB, Banking). A single operator drives an entire channel by chaining specialised AI workers:

```
Ideas Engine → Idea Cards → Script → Chunks → Audio → Slides → Annotations → Render → Master Video → YouTube
```

**Three runtimes:**
| Runtime | Where | Role |
|---|---|---|
| **Frontend (TanStack Start + React 19)** | Lovable Cloud, edge-deployed | UI, real-time DB, server functions (`createServerFn`) for OCR + Timestamps |
| **Supabase** (project `eozteueesaemhcmbqcxt`) | Postgres + Auth + Storage + Realtime | All app data; service-role used by Railway |
| **Railway worker** (FastAPI, Python 3.11) | Repo `shaikyusuf789-pixel/sky-annotations-worker`, auto-deploy on push | **Only** clip render + mega merge (FFmpeg/CairoSVG/Pillow) |

**Hard rule:** OCR runs in `src/lib/ocr.functions.ts` via Google Cloud Vision; per-word timestamps in `src/lib/timestamps.functions.ts` via ElevenLabs Forced Alignment. The Railway worker is **never** wired to OCR or timestamps from the UI.

---

## 2. Tech Stack & Integrations

| Layer | Tech |
|---|---|
| Framework | TanStack Start v1, React 19, Vite 7 |
| Styling | Tailwind 4 (semantic tokens in `src/styles.css`, oklch palette) |
| UI kit | shadcn/ui (`src/components/ui/*`), Lucide icons, Recharts |
| Data | Supabase JS client (`@/integrations/supabase/client`) + service-role server client |
| Routing | File-based, `src/routes/_dashboard.*.tsx` |
| Server logic | `createServerFn` from `@tanstack/react-start` |
| Python worker | FastAPI, Pillow, CairoSVG, FFmpeg, Pytesseract (legacy) |

**AI / external services:**
- **Script generation**: Google Gemini 3.1 Pro / GPT-4o (edge functions `generate-script*`)
- **Fact check**: `fact-check-script` edge function
- **OCR**: Google Cloud Vision (`GOOGLE_VISION_API_KEY`)
- **Per-word timestamps**: ElevenLabs Forced Alignment (`ELEVEN_LABS_API_KEY`)
- **AI annotations** (which words to underline/circle): GPT-4o (Railway `workers/ai_annotations.py`)
- **Audio TTS**: ElevenLabs v3, Google AI Studio (Gemini 2.5 TTS), Cartesia Sonic 3
- **Slides**: Gamma.app (`GAMMA_API_KEY`) + DALL-E fallback (`Oasis` theme)
- **Idea scraping**: Apify YouTube transcript actor (`APIFY_API_TOKEN`)
- **Long-term memory chat**: Lovable AI Gateway (`LOVABLE_API_KEY`) → Second Brain

---

## 3. Data Model (Supabase, schema `public`)

| Table | Purpose | Wired to UI |
|---|---|---|
| `sources_master` | Tracked competitor YouTube channels | `/ideas-engine` |
| `raw_content` | Scraped videos with status (`Pending` / `Approved` / `Priority` / `Done`) | `/idea-cards`, `/content-preview`, `/dashboard` |
| `scripts` | Finished scripts (`title`, `content`, `word_count`, `status`, `fact_check_findings`) | `/script-generator`, all downstream selectors |
| `script_chunks` | 0-indexed segments of a script with `audio_url`, `slide_url`, `slide_id` and per-stage job status fields | `/chunks`, `/audio`, `/slides`, `/annotations` |
| `audio_timestamps` | ElevenLabs word-level alignment JSON keyed by `(script_id, chunk_id)` | `/annotations` Timestamps panel |
| `ocr_results` | Google Vision word bboxes keyed by `(script_id, chunk_id, slide_source)` | `/annotations` OCR panel |
| `clip_annotations` | GPT-4o output: 3–8 underline/circle ops per chunk | `/annotations` Annotations panel |
| `video_clips` | Rendered MP4s (`status` = pending/done/error) → bucket `video-clips/{script_id}/clip_NNN_{source}.mp4` | `/annotations` final-clip column, `/master-video` |
| `youtube_seo` | Titles, description, tags, thumbnail per script | `/youtube` |
| `notifications` | Header bell | All pages |
| `user_uploads` | Manual reference files | `/uploads` |
| `ai_chat_memory` | Second Brain assistant log | `/history`, chat bubble |
| `chat_sessions` | Reserved for multi-session chat | (none yet) |
| `app_settings` | Single-row config (provider keys, telegram, etc.) | `/settings`, `/pipeline` |
| `app_metadata` | Generic KV — also holds `merge:{script_id}` job state and `doc:biography` | `/master-video` polling, this doc |
| `daily_backup_logs` | "Full Backup" telemetry | `/dashboard` |

**Storage buckets** (all public): `slides` (`{script_id}/slide_{NNN}.png`), `audio-files` (`{script_id}/audio_{N}.mp3` + master), `video-clips` (`{script_id}/clip_{NNN}_{source}.mp4` + `mega_{source}.mp4`), `user-uploads`.

RLS is permissive single-user; multi-user requires adding `user_id` columns and tightening policies. Service-role calls happen only inside `createServerFn` handlers or the Railway worker.

---

## 4. Pipeline Stages & Flows

### Phase 0 — Ideas Engine (`/ideas-engine`)
Watchdog scheduled every N hours (`app_settings.engine_auto_run`). Calls `src/lib/engine.functions.ts` → RSS scrape competitor channels in `sources_master` → Apify pulls transcripts → Gemini analyzes & writes `raw_content` rows with `status='Pending'`.

### Phase 1 — Triage (`/idea-cards`)
Pending → Approved → Priority → Done. Each card: original title, AI proposed direction, summary points, "Strategy Intelligence". Action buttons mutate `raw_content.status`.

### Phase 2 — Scripting (`/script-generator`)
Inputs: Priority List | Topic Name | Competitor Transcripts | Book/PDF section. Picks provider/model, target word count, special instructions. Calls edge fn `generate-script-stream` (streaming) which writes `scripts` row, then `fact-check-script` populates `scripts.fact_check_findings`.

### Phase 3 — Chunking (`/chunks`)
"Auto Chunk" splits a finished script using AI into chunks of ~185 words (configurable 80–300). Saves to `script_chunks` with `chunk_index` and `word_count`. The SBI Clerk 2026 script produced **7 chunks** (~119 words avg). Each chunk row is editable.

### Phase 4 — Audio (`/audio`)
Per chunk: Provider (ElevenLabs / Google AI Studio / Cartesia), TTS model (e.g. `gemini-2.5-pro-preview-tts`), Voice (e.g. `Charon`). Edge fn `generate-audio` synthesizes, uploads to `audio-files` bucket, writes URL into `script_chunks.audio_url`. "Generate All" loops chunks; "Merge & Download" stitches into master audio.

### Phase 5 — Slides (`/slides`)
Three columns per chunk: **Chunk Text (source)** → **Slide Outline (AI-generated, editable)** → **Gamma Slide (rendered)**. Theme picker = `Oasis`. "All Outlines" generates outlines, "Generate All Slides" hits Gamma API and uploads PNG to `slides` bucket → `script_chunks.slide_url`.

### Phase 6 — Annotations (`/annotations`) — the heart of the pipeline
Sequential pipeline per chunk: **OCR → Timestamps → AI Annotations → Render Clip**, then **Merge Mega Video**.

Bulk controls along the top:
- `DALL·E | Gamma | Replit` — slide source toggle (default Gamma)
- `MEGA RUN` — runs Audios→Slides→OCR→TS→AI→Render in order
- `All OCR` / `Skip & Run OCR` — Google Vision on every chunk slide → `ocr_results`
- `All Timestamps` / `Skip & Run TS` — ElevenLabs Forced Alignment on every chunk audio → `audio_timestamps`
- `All Annotations` / `Skip & Run AI` — GPT-4o picks 3–8 words per chunk → `clip_annotations`
- `Render All` / `Skip & Render` — POST `/clips/render-all` to Railway → `video_clips`
- `Merge Mega Video` — POST `/merge/run` (added 2026-06-05) to Railway → uploads `mega_{source}.mp4`, polls `app_metadata.key='merge:{script_id}'`

Per-chunk row shows: Original Script, Slide preview, OCR Output (token, bbox, conf), Timestamps (start→end, word), Annotations (raw JSON of underline/circle ops with `target_text` + `match_word`), Final Clip (video player + "Re-render").

### Phase 7 — Master Video (`/master-video`)
Library of merged mega videos. SBI Clerk 2026 mega: 7 clips, 7:05 runtime. Buttons: **Download MP4**, **Edit**, **Open**.

### Phase 8 — YouTube (`/youtube`)
Per script: title variations, selected title, description, tags, thumbnail prompt + URL.

### Mega page (`/mega`)
One-screen "do everything for this script": pick script → set words/chunk → click `RUN ALL` to chain Audios → Slides → OCR → Timestamps → Annotations → Render (merge stays manual). Per-stage `Run` buttons let you re-run any single step.

### Utilities
- `/history` — Neural History: full Second Brain chat log
- `/storage` — Asset manager with usage gauge (4.2 GB / 50 GB)
- `/settings` — API credentials note + Email/Telegram toggles
- `/tables` — Live two-way Supabase inspector (`get_public_tables` RPC)
- `/uploads` — Reference file vault
- `/pipeline` — Watchdog status + manual run
- `/hook-generator` — Viral hook ideation

---

## 5. Frontend Screens & Controls (Visual Tour)

All shots use the **SBI Clerk 2026 Notification OUT?** script (`id=5e3749a5-4960-4d8c-9506-aa964d826811`, 7 chunks, all phases complete).

### 01 — Dashboard (`/dashboard`)
![Dashboard](./docs/biography-screenshots/01-dashboard.png)
Top tiles (live): Total Ideas (384), Pending Approval (256), Pending Priority (17), Pending Scripting (1), Pending Audio (108), Pending Slides (0). Production Velocity chart (7-day output). Status Distribution bar chart. Active Database Clusters strip (sources_master, raw_content, scripts, script_chunks, app_settings, notifications, daily_backup_logs, youtube_seo, ai_chat_memory). Footer: Production Workflow explainer. **Full Backup** button = `daily_backup_logs` writer.

### 02 — Ideas Engine (`/ideas-engine`)
![Ideas Engine](./docs/biography-screenshots/02-ideas-engine.png)
**Run Manually** triggers `engine.functions.ts`. Auto-Run toggle, Interval slider (hours), Videos/Channel slider. AI Engine card adds channel (name + YouTube URL → `Sync to Source Master`). Manual Entry card writes directly to `sources_master`. Source Master Table at bottom.

### 03 — Idea Cards: Pending (`/idea-cards`)
![Idea Cards Pending](./docs/biography-screenshots/03-idea-cards-pending.png)
Tabs: PENDING 256 / APPROVED 17 / PRIORITY 1 / DONE 2. Each card: thumbnail, Original Intelligence (title), Proposed Direction, date, **APPROVE** / **REJECT** → `raw_content.status`.

### 24 — Idea Cards: Priority
![Idea Cards Priority](./docs/biography-screenshots/24-idea-cards-priority.png)
Buttons: **REJECT**, **GENERATE** (jumps to `/script-generator` priority-list mode), **DONE**.

### 25 — Idea Cards: Done
![Idea Cards Done](./docs/biography-screenshots/25-idea-cards-done.png)
Shows finished topics (DSSSB 2026, 3 Hacks to Crack Bank Exams). Strategy Intelligence expandable list.

### 26 — Idea Cards: Approved
![Idea Cards Approved](./docs/biography-screenshots/26-idea-cards-approved.png)

### 04 / 31 / 32 — Script Generator (`/script-generator`)
![Script Generator](./docs/biography-screenshots/04-script-generator.png)
![Topic Mode](./docs/biography-screenshots/31-script-generator-topic-mode.png)
![History Picker](./docs/biography-screenshots/32-script-generator-history.png)
Provider (`Sky Studio Gemini`), Model (`Gemini 3.1 Pro`), Video Type (Subjective / General). Input Mode: Priority List | Topic Name | Competitor Transcripts | Book/PDF. Word count slider (~660 = 9.9 min). Special Instructions textarea. **Generate Script** streams into right panel. **View History** loads last 10 scripts. **DNA Active** indicator = Lovable AI prompt pipeline.

### 05 / 06 — Chunks (`/chunks`)
![Chunks Empty](./docs/biography-screenshots/05-chunks-empty.png)
![Chunks Populated](./docs/biography-screenshots/06-chunks-populated.png)
Words-per-chunk slider (80–300, default 185). **Auto Chunk** writes `script_chunks`. Each chunk: number, word count, badge `SLIDE_GENERATED`, **Edit** inline editor. **Save All Chunks** persists edits. SBI Clerk = 7 chunks: 105 + 119 + 116 + 127 + 127 + 128 + 121 words.

### 07 / 08 — Audio (`/audio`)
![Audio Empty](./docs/biography-screenshots/07-audio-empty.png)
![Audio Populated](./docs/biography-screenshots/08-audio-populated.png)
Settings: Script picker, Provider (Google AI Studio shown), TTS Model (`gemini-2.5-pro-preview-tts`), Voice (`Charon`). Right panel: per-chunk preview with HTML5 audio (0:58, 1:04, …), **Edit** / **Regenerate** / **Download** icons. Top-right: **Generate All**, **Merge & Download**.

### 09 / 10 — Slides (`/slides`)
![Slides Empty](./docs/biography-screenshots/09-slides-empty.png)
![Slides Populated](./docs/biography-screenshots/10-slides-populated.png)
Theme: `Oasis`. **All Outlines** then **Generate All Slides**. Each row: chunk text | editable outline | rendered Gamma deck preview + **UPDATE SLIDE** + **REGENERATE OUTLINE**.

### 11 / 12 — Annotations (`/annotations`)
![Annotations Empty](./docs/biography-screenshots/11-annotations-empty.png)
![Annotations Full](./docs/biography-screenshots/12-annotations-full.png)
Bulk controls: DALL·E / **Gamma** / Replit toggle, **MEGA RUN**, **All OCR** + **Skip & Run OCR** + trash, **All Timestamps** + **Skip & Run TS** + trash, **All Annotations** + **Skip & Run AI** + trash, **Render All** + **Skip & Render** + trash. **Mega Video** banner with **Merge Mega Video** button (queues `merge:{script_id}` in `app_metadata`, Railway `/merge/run`). Per-chunk: OCR table (token / bbox / conf / `Show all N rows`), Timestamps table (start→end / word), Annotations JSON (`underline`/`circle` with `match_word`), Final Clip MP4 player + Re-render.

### 13 — Mega (`/mega`)
![Mega](./docs/biography-screenshots/13-mega-empty.png)
Script picker + words/chunk slider + **Generate Chunks**. All-buttons grid: All Slides (Gamma+Oasis), All Audios (Cartesia+sonic-3-latest+voice id), All OCR, All Timestamps, All Annotations, Render All. **RUN ALL** chains Audios→Slides→OCR→TS→Annotations→Render.

### 14 — Master Video (`/master-video`)
![Master Video](./docs/biography-screenshots/14-master-video.png)
Cards per merged mega: thumbnail (first slide), title, chunk count, date, source. **Download MP4** / **Edit** / **Open**.

### 15 — YouTube (`/youtube`)
![YouTube](./docs/biography-screenshots/15-youtube-empty.png)
Script picker + SEO editor + **Save Changes**.

### 16 — History (`/history`)
![History](./docs/biography-screenshots/16-history.png)
Neural History — Second Brain assistant log. Search + Filter + Export + Clear All. Memory Logs entries (47 shown).

### 17 — Storage (`/storage`)
![Storage](./docs/biography-screenshots/17-storage.png)
Usage gauge (4.2 GB / 50 GB). Search + **New Folder** + **Upload Asset**. Neural Storage cards (Biography, Database Mapping, Chat History). Asset tiles with Download / Delete.

### 18 — Settings (`/settings`)
![Settings](./docs/biography-screenshots/18-settings.png)
API Credentials banner (managed via Supabase Secrets). Notifications: Email Alerts toggle, Telegram Bot toggle. **Save Changes** / **Reset**.

### 19 — Tables (`/tables`)
![Tables](./docs/biography-screenshots/19-tables.png)
Live Supabase inspector via `get_public_tables` RPC. Per-table card with search, Add Row, edit/delete row actions, "Reveal N more records" pagination.

### 20 — Uploads (`/uploads`)
![Uploads](./docs/biography-screenshots/20-uploads.png)
**Upload File** writes to `user_uploads` + `user-uploads` bucket.

### 21 — Pipeline (`/pipeline`)
![Pipeline](./docs/biography-screenshots/21-pipeline.png)
Live Pipeline Status (Scraping / Chunking / Audio / Slides / Annotations / Rendering with "just now / Xm ago"). Watchdog Status panel + Quick Stats. **Manual Run** + watchdog toggle.

### 22 — Hook Generator (`/hook-generator`)
![Hooks](./docs/biography-screenshots/22-hook-generator.png)
**Generate Hooks** = 10+ high-CTR viral hook variants.

### 23 — Content Preview (`/content-preview`)
![Content Preview](./docs/biography-screenshots/23-content-preview.png)
Tabular view of all `raw_content` (S.No / Original Title / Proposed Title / Summary Points / Status).

### 27 — AI Chat Assistant (overlay)
![AI Chat](./docs/biography-screenshots/27-ai-chat-assistant.png)
Floating bubble (bottom-right) opens Second Brain — context-aware queries against `ai_chat_memory`. Auto-run counts, idea totals, scheduling reminders.

### 28 / 29 / 30 — Mobile (390 × 844)
![Mobile Dashboard](./docs/biography-screenshots/28-mobile-dashboard.png)
![Mobile Menu](./docs/biography-screenshots/29-mobile-menu.png)
![Mobile Annotations](./docs/biography-screenshots/30-mobile-annotations.png)
Hamburger top-left opens sidebar Sheet. All controls remain reachable at 390 px (Rule 3).

---

## 6. Python Services & Railway Auto-Deploy

### Repo layout (`railway-worker/`)
```
main.py                # FastAPI app + all routes
workers/
  ocr.py               # legacy Tesseract (UI no longer uses it)
  timestamps.py        # legacy Whisper (UI no longer uses it)
  ai_annotations.py    # GPT-4o → underline/circle ops
  render.py            # FFmpeg + Pillow + CairoSVG per-chunk MP4
  merger.py            # FFmpeg concat of clips → mega MP4
lib/
  config.py
  supabase_client.py   # service-role singleton
  storage.py           # bucket helpers
Dockerfile             # apt: ffmpeg + tesseract; pip: requirements.txt
railway.toml           # healthcheck=/health, startCmd=uvicorn
requirements.txt       # fastapi, uvicorn, supabase, openai, Pillow, cairosvg, pytesseract, httpx
```

### Required env vars (Railway → Variables tab)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | `https://eozteueesaemhcmbqcxt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB + storage access |
| `OPENAI_API_KEY` | GPT-4o annotation generation |
| `ANNOTATION_LEAD_SECONDS` | Default `0.6` — how early underline appears before word |
| `PORT` | Injected by Railway |

### Endpoints (`main.py`)
- `GET /health` — Railway healthcheck
- `POST /ai/run` / `/ai/run-all` — generate annotations (kept for completeness)
- `POST /clips/render` — single-chunk render (script_id, chunk_id, chunk_number, slide_source)
- `POST /clips/render-all` — all chunks for a script
- `POST /merge/run` — queues `merger.merge_script_clips()`; sets `app_metadata.merge:{script_id}` to `queued → running → done/error` so the UI can poll

### Auto-deploy flow (GitHub → Railway)
The Railway service is connected to repo `shaikyusuf789-pixel/sky-annotations-worker` on the `main` branch. Any push to `main` triggers a fresh build (Dockerfile) and rolling deploy. Workflow:

1. **Edit** files inside this monorepo's `railway-worker/` directory.
2. **Push** with `python push_worker.py` — uses `GITHUB_PAT` to upload the `railway-worker/` tree as a single commit via the GitHub Trees API (no `git` required from the agent sandbox).
3. **Wait** ~60–120 s. Hit `https://<your-railway-domain>/health` → expect `{"ok":true}`.
4. **Verify** by triggering a small job (e.g. `/merge/run` from the Annotations page) and watching Railway logs.

### Hard rules
- Railway worker = **render + merge only**. Do not re-wire UI to `/ocr` or `/timestamps` — those legacy endpoints exist but the frontend calls Google Vision + ElevenLabs directly.
- The Railway env must point at the same Supabase project (`eozteueesaemhcmbqcxt`). The retired ref `klhcrdacefntzqwqwiiu` must not be used.

---

## 7. How to Extend or Modify

| You want to… | Touch these files |
|---|---|
| Add a new pipeline stage | New `_dashboard.<stage>.tsx` route + new `<stage>.functions.ts` server fn + migration for state table |
| Swap TTS provider | `supabase/functions/generate-audio/index.ts` + Provider dropdown in `_dashboard.audio.tsx` |
| Change annotation prompt | `railway-worker/workers/ai_annotations.py` (then `push_worker.py`) |
| Tighten RLS for multi-user | Add `user_id uuid` columns, replace `open_access` policies with `auth.uid()`-scoped ones, add `user_roles` table (see Lovable user-roles guide) |
| Add a Supabase secret | Lovable Cloud secrets tool only — never commit `.env` |
| Add a new mobile-only screen | Follow `Sheet` pattern in `src/routes/_dashboard.tsx`; verify at 390 px |

**Don't touch** (auto-generated): `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher,types}.ts`, `src/routeTree.gen.ts`, `supabase/config.toml`.

---

## 8. Reproduction Checklist (for a new agent)

1. Create Lovable Cloud project; provision Supabase (Auth + Storage + Realtime).
2. Run migrations to create all 16 tables in §3 with permissive RLS + `GRANT` blocks.
3. Create 4 public buckets: `slides`, `audio-files`, `video-clips`, `user-uploads`.
4. Add secrets: `OPENAI_API_KEY`, `GOOGLE_VISION_API_KEY`, `ELEVEN_LABS_API_KEY`, `GAMMA_API_KEY`, `APIFY_API_TOKEN`, `CARTESIA_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`, `GITHUB_PAT`.
5. Scaffold TanStack Start with file routes from `src/routes/`.
6. Implement edge functions in `supabase/functions/` (generate-script*, generate-audio, generate-slides, fact-check-script, process-annotations, ai-assistant).
7. Implement server fns: `src/lib/ocr.functions.ts` (Vision), `src/lib/timestamps.functions.ts` (ElevenLabs FA), `src/lib/engine.functions.ts` (Apify+Gemini scraper).
8. Deploy `railway-worker/` to Railway → connect GitHub repo → set env vars → confirm `/health`.
9. Seed `sources_master` with 1–2 channels, hit **Run Manually** on `/ideas-engine`, then walk the SBI Clerk flow end-to-end.

---

_Document version: v6.0 · Last refreshed by Lovable agent 2026-06-05 with 31 live screenshots of the SBI Clerk 2026 production._
