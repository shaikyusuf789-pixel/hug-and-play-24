# VibeCoder - Project Status & Handover Documentation
**Date:** May 31, 2026
**Status:** Successfully decoupled from managed backend services. Fully integrated with Direct Supabase Instance.

## 🔗 Core Backend Integration
The project is strictly wired to a specific Supabase instance. **Do not use the project's default managed database.**

- **Project URL:** `https://eozteueesaemhcmbqcxt.supabase.co`
- **Publishable Key:** `sb_publishable_8_LFpheRbnwNiecH1oHujQ_6HHrydgh`
- **Service Role Key:** Required for server functions (stored in secrets as `CUSTOM_SUPABASE_SERVICE_ROLE_KEY`).

### Configuration Files
- `src/integrations/supabase/client.ts`: Hardcoded to the specific Supabase project for the frontend.
- `src/integrations/supabase/client.server.ts`: Hardcoded to the specific Supabase project for server-side functions using the custom service role key.
- `.env`: Contains the same credentials for local development.

## 🗄️ Database Mapping (Direct Supabase)
Every component in the UI is mapped directly to these tables in your Supabase project:

| Table Name | UI Context |
|------------|------------|
| `sources_master` | Scraper Sources & Dashboard |
| `raw_content` | Idea Cards & Content Tracking |
| `scripts` | Script Generator |
| `script_chunks` | Audio & Slide Generation |
| `youtube_seo` | YouTube Optimization |
| `notifications` | System Alerts |
| `user_uploads` | File Management |
| `ai_chat_memory` | AI Assistant Context |
| `app_settings` | Global System Settings |
| `daily_backup_logs`| Backup Status Tracking |

## 🛠️ Key Technical Fixes & Features
1. **Dynamic Database Browser**: The "Database Tables" page uses a custom RPC function `get_public_tables()` to list **all** available tables in your Supabase project dynamically.
2. **Hardcoded Decoupling**: Credentials have been hardcoded in the Supabase clients to prevent the internal backend from interfering.
3. **Admin Client (Bypassing RLS)**: Server functions use `supabaseAdmin` with the Service Role Key to manage complex workflows like the Idea Engine.
4. **Dashboard Wiring**: The Dashboard now visualizes status indicators for all 10 core tables to confirm active connectivity.

## 🚀 Migration Instructions (Replit / Bolt / New Project)
To replicate this setup elsewhere:
1. Copy the frontend code.
2. Add the `CUSTOM_SUPABASE_SERVICE_ROLE_KEY` to the new platform's secrets.
3. Ensure the Supabase project at `eozteueesaemhcmbqcxt.supabase.co` has the following RPC in the `public` schema:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_public_tables()
   RETURNS TABLE (table_name TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
   BEGIN
       RETURN QUERY SELECT t.table_name::TEXT FROM information_schema.tables t
       WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';
   END; $$;
   ```
4. Update `.env` with the project URL and Publishable Key.
