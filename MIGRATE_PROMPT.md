# Migration Prompt — VibeCoder Frontend

Paste this into any new AI coding tool (Replit, Bolt, Cursor, etc.) when migrating this project.

---

You are taking over the **VibeCoder** frontend. Before doing anything, read and follow these files:

1. **`RULES.md`** — the 3 canonical project rules. Apply them on EVERY change.
2. **`docs/UI_SPEC.md`** — current UI state. Update it after any UI change (Rule 1).
3. **`SUPABASE_MAPPING.md`** — table → page wiring.
4. **`README_SUPABASE.md`** — backend handover.

## Hard rules (do not break)

- **Rule 1**: After any page UI change → screenshot + update `docs/UI_SPEC.md`.
- **Rule 2**: Run security checks (Supabase linter) after every change.
- **Rule 3**: Frontend ONLY. Backend = direct Supabase project `eozteueesaemhcmbqcxt` at `https://eozteueesaemhcmbqcxt.supabase.co`. **Do NOT** use internal managed services, do NOT create new tables/secrets/edge functions anywhere else.

## Mobile-first
Every page must be fully usable on a phone (390px). All buttons/actions visible without horizontal scroll.

## Env vars expected
```
VITE_SUPABASE_URL=https://eozteueesaemhcmbqcxt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role, server-only>
```

## Stack
TanStack Start (Vite 7, React 19) + Tailwind v4 + Supabase JS. Routes under `src/routes/` (flat dot-convention). Server logic via `createServerFn`, NOT Supabase Edge Functions.

If the user asks "what is Rule 1 / 2 / 3?" — answer from `RULES.md`.
