# Project Rules (Canonical)

These rules apply to EVERY change in this repo. The AI agent must follow them on every turn.

## Rule 0 — Approval + risk report first
Before changing code, database, secrets, deployments, or backend functions:
1. Investigate and explain the real root cause first.
2. Tell Jerry what the proposed fix will touch.
3. Tell Jerry what related issues/regressions could arise from that fix.
4. Wait for Jerry's approval before applying the fix.

## Rule 1 — UI Spec is the source of truth
After ANY UI change to a page:
1. Take a screenshot of the updated page (desktop **and** mobile if the layout differs).
2. Save it under `docs/screenshots/v5/` using the existing `NN-<page>-<device>.png` naming.
3. Open `docs/UI_SPEC.md` and replace the matching entry's screenshot + short description.

## Rule 2 — Security check every time
After every change set (frontend, schema, secrets, edge functions, server fns):
- Run `supabase--linter`.
- Fix or document any new finding before closing the task.

## Rule 3 — Frontend repo, Supabase is backend
This repository is the frontend ONLY. App data lives in the direct Supabase project, not the managed default DB.
- Project ref: `eozteueesaemhcmbqcxt` · URL: `https://eozteueesaemhcmbqcxt.supabase.co`.
- Frontend reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` pointing to that project.
- Never create tables or store secrets in the internal managed DB.
- Railway worker (`railway-worker/`) MUST point at the same Supabase project via its own `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars.

## Rule 4 — Mobile-first
Every page must work on a 390 px-wide phone. All buttons, actions, and data must be reachable without a laptop. Use the existing `Sheet` mobile drawer pattern in `src/routes/_dashboard.tsx`.

## Rule 5 — UI Consistency
Maintain the established dashboard design system:
- Status tiles use the vibrant glassmorphism style with secondary icons.
- All controls (sliders, switches) must be mobile-accessible.
- Colors come from semantic tokens in `src/styles.css` — never hard-code hex/oklch in components.

## Rule 6 — OCR & Timestamps stay off Railway
- OCR runs in `src/lib/ocr.functions.ts` via **Google Cloud Vision** (`GOOGLE_VISION_API_KEY`).
- Per-word timestamps run in `src/lib/timestamps.functions.ts` via **ElevenLabs Forced Alignment** (`ELEVEN_LABS_API_KEY`).
- Railway worker is for **clip render + mega merge only**. Do not re-wire the UI to Railway `/ocr` or `/timestamps`.

## Rule 7 — Jerry update on every change set
After completing a change set, summarise for Jerry (the project owner) in plain English:
- what changed in the UI,
- what files moved/created,
- any secrets, env vars, or Railway settings he needs to set/rotate,
- which screenshots in `docs/screenshots/v5/` were refreshed,
- any open follow-ups.

When the user asks "what is Rule N?" → answer from this file verbatim.
