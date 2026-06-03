ALTER TABLE public.raw_content DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_content OWNER TO postgres;
GRANT ALL ON public.raw_content TO anon, authenticated, service_role;
ALTER TABLE public.raw_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.raw_content;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.raw_content;
DROP POLICY IF EXISTS "open_access" ON public.raw_content;

CREATE POLICY "open_access" ON public.raw_content FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_content TO anon, authenticated;
GRANT ALL ON public.raw_content TO service_role;