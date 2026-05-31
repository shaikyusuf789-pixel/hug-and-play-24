-- Create chat_sessions table
CREATE TABLE public.chat_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    user_id UUID DEFAULT auth.uid()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;

-- Enable RLS
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own sessions" 
ON public.chat_sessions 
FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create their own sessions" 
ON public.chat_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own sessions" 
ON public.chat_sessions 
FOR UPDATE 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete their own sessions" 
ON public.chat_sessions 
FOR DELETE 
USING (auth.uid() = user_id OR user_id IS NULL);

-- Add session_id to ai_chat_memory
ALTER TABLE public.ai_chat_memory 
ADD COLUMN session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

-- Create an index for faster lookups
CREATE INDEX idx_ai_chat_memory_session_id ON public.ai_chat_memory(session_id);

-- Add user_id to ai_chat_memory if it doesn't exist (it seems it doesn't from previous read)
ALTER TABLE public.ai_chat_memory
ADD COLUMN user_id UUID DEFAULT auth.uid();

-- Update existing policies or add new ones for ai_chat_memory
CREATE POLICY "Users can view their own chat messages" 
ON public.ai_chat_memory 
FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create their own chat messages" 
ON public.ai_chat_memory 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Function to update updated_at
CREATE TRIGGER update_chat_sessions_updated_at
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();