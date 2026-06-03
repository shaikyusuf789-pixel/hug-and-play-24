-- Fix RLS policies for chat_sessions
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.chat_sessions;

GRANT ALL ON public.chat_sessions TO anon, authenticated;

CREATE POLICY "Allow all access to chat_sessions"
ON public.chat_sessions
FOR ALL
USING (true)
WITH CHECK (true);

-- Fix RLS policies for ai_chat_memory
DROP POLICY IF EXISTS "Users can view their own messages" ON public.ai_chat_memory;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.ai_chat_memory;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.ai_chat_memory;

GRANT ALL ON public.ai_chat_memory TO anon, authenticated;

CREATE POLICY "Allow all access to ai_chat_memory"
ON public.ai_chat_memory
FOR ALL
USING (true)
WITH CHECK (true);
