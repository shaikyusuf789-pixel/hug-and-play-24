
-- 1. Fix function search_path and tighten SECURITY DEFINER exposure
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_tables() FROM PUBLIC, anon, authenticated;

-- 2. Storage RLS policies for audio-files, slides, user-uploads
-- Authenticated users can read/list (buckets are public-facing for app)
DROP POLICY IF EXISTS "Authenticated can read app buckets" ON storage.objects;
CREATE POLICY "Authenticated can read app buckets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('audio-files', 'slides', 'user-uploads'));

-- Allow public read since buckets are marked public
DROP POLICY IF EXISTS "Public can read app buckets" ON storage.objects;
CREATE POLICY "Public can read app buckets"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id IN ('audio-files', 'slides', 'user-uploads'));

-- Only authenticated users can upload, and into their own user-id-prefixed folder
DROP POLICY IF EXISTS "Authenticated can upload to own folder" ON storage.objects;
CREATE POLICY "Authenticated can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('audio-files', 'slides', 'user-uploads')
  AND (auth.uid()::text = (storage.foldername(name))[1] OR owner = auth.uid())
);

-- Only owner can update their files
DROP POLICY IF EXISTS "Owners can update their files" ON storage.objects;
CREATE POLICY "Owners can update their files"
ON storage.objects FOR UPDATE
TO authenticated
USING (owner = auth.uid())
WITH CHECK (owner = auth.uid());

-- Only owner can delete their files
DROP POLICY IF EXISTS "Owners can delete their files" ON storage.objects;
CREATE POLICY "Owners can delete their files"
ON storage.objects FOR DELETE
TO authenticated
USING (owner = auth.uid());
