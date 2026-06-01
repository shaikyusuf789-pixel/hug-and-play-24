import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { geminiGenerateText, requireGoogleApiKey } from "../_shared/google-ai.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { chunkId, action } = await req.json()
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch the chunk content
    const { data: chunk, error: fetchError } = await supabase
      .from('script_chunks')
      .select('content')
      .eq('id', chunkId)
      .single()

    if (fetchError || !chunk) {
      throw new Error('Chunk not found')
    }

    if (action === 'generate-prompt') {
      const promptResult = await geminiGenerateText(requireGoogleApiKey(), {
        model: 'gemini-2.5-flash-lite',
        system: 'You are an expert at creating slide content. Your output must be exactly one heading followed by exactly 6 bullet points. No other text.',
        user: `Create slide content based on this text: ${chunk.content}\n\nRemember: One heading and 6 bullet points.`,
        temperature: 0.2,
      })

      // Save to database
      const { error: updateError } = await supabase
        .from('script_chunks')
        .update({ slide_prompt: promptResult })
        .eq('id', chunkId)

      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true, prompt: promptResult }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'generate-slide') {
      // Placeholder for Gamma slide generation
      // For now, let's just simulate success or update a status
      // In a real scenario, this would call Gamma API
      
      const { error: updateError } = await supabase
        .from('script_chunks')
        .update({ status: 'slide_generated', slide_url: 'https://gamma.app/placeholder' })
        .eq('id', chunkId)

      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
