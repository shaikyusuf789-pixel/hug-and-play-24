
CREATE TABLE public.thumbnail_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  prompt text,
  lines jsonb,
  model text,
  script_id uuid,
  source text NOT NULL DEFAULT 'youtube_page',
  tags text[],
  is_sky_style boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.thumbnail_library TO anon, authenticated;
GRANT ALL ON public.thumbnail_library TO service_role;

ALTER TABLE public.thumbnail_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thumb_lib_read" ON public.thumbnail_library FOR SELECT USING (true);
CREATE POLICY "thumb_lib_insert" ON public.thumbnail_library FOR INSERT WITH CHECK (true);
-- No UPDATE / DELETE policies = nobody can mutate or remove rows from the client.

CREATE INDEX thumbnail_library_created_at_idx ON public.thumbnail_library (created_at DESC);
