-- Function to list all tables in the public schema
CREATE OR REPLACE FUNCTION public.get_public_tables()
RETURNS TABLE (table_name TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT t.table_name::TEXT
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE';
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_public_tables() TO anon, authenticated, service_role;
