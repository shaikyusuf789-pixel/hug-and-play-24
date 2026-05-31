# Project Rules (Canonical)

These rules apply to EVERY change in this repo. The AI agent must follow them on every turn.

## Rule 1 — UI Spec is the source of truth
After ANY UI change to a page:
1. Take a screenshot of the updated page.
2. Open `docs/UI_SPEC.md`.
3. Replace the existing entry for that page (or add a new one) with the new screenshot + a short description of what changed.

## Rule 2 — Security check every time
After every change set (frontend, schema, or config):
- Run the Supabase linter (`supabase--linter`).
- Fix or document any new finding before closing the task.

## Rule 3 — Frontend only here, Supabase is backend
This repository is the frontend ONLY. Nothing app-data lives in the managed backend.
- All tables, storage buckets, secrets, edge functions, auth = the user's direct Supabase project: `klhcrdacefntzqwqwiiu`.
- Frontend reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` pointing to that project.
- Never create tables or store secrets in the internal managed DB.

## Mobile-first
Every page must work on a phone. All buttons, actions, and data must be reachable without a laptop. Use the existing `Sheet` mobile drawer pattern in `src/routes/_dashboard.tsx`.

## Rule 4 — UI Consistency (Dashboard)
Maintain the established dashboard design system:
- Status tiles must use the vibrant glassmorphism style with secondary icons.
- All controls (sliders, switches) must be mobile-accessible.
- Dashboard screenshots must be updated in `docs/UI_SPEC.md` after any functional or visual change.

When the user asks "what is Rule 1/2/3?" → answer from this file.
