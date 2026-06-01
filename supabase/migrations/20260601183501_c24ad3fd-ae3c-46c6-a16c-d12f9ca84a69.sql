
-- 1. OCR results
CREATE TABLE public.ocr_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid NOT NULL,
  chunk_id      uuid NOT NULL,
  chunk_number  integer NOT NULL,
  slide_source  text NOT NULL DEFAULT 'gamma',
  words         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, chunk_id, slide_source)
);
CREATE INDEX idx_ocr_results_script ON public.ocr_results(script_id, slide_source);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_results TO anon;
GRANT ALL ON public.ocr_results TO service_role;

ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON public.ocr_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to anon" ON public.ocr_results FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER set_ocr_results_updated_at BEFORE UPDATE ON public.ocr_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Audio timestamps
CREATE TABLE public.audio_timestamps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid NOT NULL,
  chunk_id      uuid NOT NULL,
  chunk_number  integer NOT NULL,
  words         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, chunk_id)
);
CREATE INDEX idx_audio_timestamps_script ON public.audio_timestamps(script_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_timestamps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_timestamps TO anon;
GRANT ALL ON public.audio_timestamps TO service_role;

ALTER TABLE public.audio_timestamps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON public.audio_timestamps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to anon" ON public.audio_timestamps FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER set_audio_timestamps_updated_at BEFORE UPDATE ON public.audio_timestamps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Clip annotations
CREATE TABLE public.clip_annotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid NOT NULL,
  chunk_id      uuid NOT NULL,
  chunk_number  integer NOT NULL,
  slide_source  text NOT NULL DEFAULT 'gamma',
  annotations   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, chunk_id, slide_source)
);
CREATE INDEX idx_clip_annotations_script ON public.clip_annotations(script_id, slide_source);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clip_annotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clip_annotations TO anon;
GRANT ALL ON public.clip_annotations TO service_role;

ALTER TABLE public.clip_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON public.clip_annotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to anon" ON public.clip_annotations FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER set_clip_annotations_updated_at BEFORE UPDATE ON public.clip_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Video clips
CREATE TABLE public.video_clips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid NOT NULL,
  chunk_id      uuid NOT NULL,
  chunk_number  integer NOT NULL,
  slide_source  text NOT NULL DEFAULT 'gamma',
  file_name     text,
  file_url      text,
  status        text NOT NULL DEFAULT 'pending',
  error_msg     text,
  duration      double precision,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, chunk_id, slide_source)
);
CREATE INDEX idx_video_clips_script ON public.video_clips(script_id, slide_source);
CREATE INDEX idx_video_clips_status ON public.video_clips(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_clips TO anon;
GRANT ALL ON public.video_clips TO service_role;

ALTER TABLE public.video_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON public.video_clips FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to anon" ON public.video_clips FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER set_video_clips_updated_at BEFORE UPDATE ON public.video_clips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
