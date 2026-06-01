ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS fact_check_findings jsonb,
  ADD COLUMN IF NOT EXISTS script_error text;