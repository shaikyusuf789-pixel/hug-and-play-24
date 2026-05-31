-- Allow anon access to everything for development/preview visibility
CREATE POLICY "Allow all access to anon" ON public.raw_content FOR ALL TO anon USING (true);
CREATE POLICY "Allow all access to anon" ON public.scripts FOR ALL TO anon USING (true);
CREATE POLICY "Allow all access to anon" ON public.script_chunks FOR ALL TO anon USING (true);
CREATE POLICY "Allow all access to anon" ON public.sources_master FOR ALL TO anon USING (true);
CREATE POLICY "Allow all access to anon" ON public.notifications FOR ALL TO anon USING (true);
CREATE POLICY "Allow all access to anon" ON public.app_settings FOR ALL TO anon USING (true);

-- Ensure RLS is on
ALTER TABLE public.raw_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon
GRANT ALL ON public.raw_content TO anon;
GRANT ALL ON public.scripts TO anon;
GRANT ALL ON public.script_chunks TO anon;
GRANT ALL ON public.sources_master TO anon;
GRANT ALL ON public.notifications TO anon;
GRANT ALL ON public.app_settings TO anon;
