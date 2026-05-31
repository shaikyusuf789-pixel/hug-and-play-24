NOTIFY pgrst, 'reload schema';
SELECT pg_sleep(2);
NOTIFY pgrst, 'reload schema';