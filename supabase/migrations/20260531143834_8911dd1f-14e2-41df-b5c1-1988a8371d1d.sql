-- Create and drop a dummy table to force PostgREST to reload the schema cache
CREATE TABLE IF NOT EXISTS public._schema_cache_reload_temp (id int);
DROP TABLE public._schema_cache_reload_temp;

-- Additionally, ensure processing_step is explicitly granted (though it should be via table grants)
GRANT SELECT, INSERT, UPDATE ON TABLE public.raw_content TO authenticated, service_role;
