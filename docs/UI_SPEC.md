# UI Spec

This document tracks the current visual state of every page. Per **Rule 1**, update the corresponding entry (or add a new one) whenever a page's UI changes. Attach a fresh screenshot.

> Screenshots are stored under `docs/screenshots/<page>.png`.

## Pages

### / (Landing)
- Status: default landing route.
- Screenshot: _pending_

### /dashboard
- Layout: sidebar + main content. Sidebar collapses into a Sheet drawer on mobile (hamburger top-left).
- Screenshot: _pending_

### /tables (Database Tables)
- Lists ALL public tables dynamically from Supabase via `get_public_tables` RPC.
- Screenshot: _pending_

### /idea-cards
- Tabs: Pending / Approved / Priority.
- Card includes thumbnail, original/proposed title, meta, summary points, action buttons.
- Mobile: card stack full-width, actions stay visible.
- **Update (May 31, 2026)**: Added live processing states and realtime status updates (e.g., "Fetching transcript", "AI Analysis") that show up inside the card during the approval pipeline. Ideas move to the "Approved" tab immediately upon clicking approve. Also reduced the size of the "Generate" action button on Approved cards to match the width of other action buttons for a cleaner layout.
- Screenshot (Desktop): `docs/screenshots/idea-cards-desktop.png`
- Screenshot (Mobile): `docs/screenshots/idea-cards-mobile.png`



### /script-generator, /chunks, /audio, /slides, /annotations, /master-video, /youtube
- Pipeline pages. Each must be mobile-usable (all controls reachable, no horizontal scroll).
- Screenshots: _pending_

### /history, /storage, /settings
- Utilities. Mobile-usable.
- Screenshots: _pending_

## How to update
1. Make the UI change.
2. Capture screenshot with browser tool at mobile viewport (e.g. 390x844) AND desktop.
3. Save under `docs/screenshots/<page>-mobile.png` and `<page>-desktop.png`.
4. Update this file's entry with the new path + 1–2 sentences describing the change.
