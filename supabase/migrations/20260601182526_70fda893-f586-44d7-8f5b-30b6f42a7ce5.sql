
ALTER TABLE public.script_chunks
  ADD COLUMN IF NOT EXISTS slide_job_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS audio_job_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS slide_job_theme text,
  ADD COLUMN IF NOT EXISTS slide_job_error text,
  ADD COLUMN IF NOT EXISTS audio_job_error text,
  ADD COLUMN IF NOT EXISTS slide_job_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS audio_job_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS audio_job_provider text,
  ADD COLUMN IF NOT EXISTS audio_job_voice_id text;

CREATE INDEX IF NOT EXISTS idx_script_chunks_slide_job_status ON public.script_chunks(slide_job_status) WHERE slide_job_status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS idx_script_chunks_audio_job_status ON public.script_chunks(audio_job_status) WHERE audio_job_status IN ('queued','processing');
