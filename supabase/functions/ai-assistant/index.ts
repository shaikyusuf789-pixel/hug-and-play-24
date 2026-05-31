import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch App Metadata
    const { data: metadata, error: metaError } = await supabase
      .from("app_metadata")
      .select("key, value");

    if (metaError) {
      console.error("Error fetching metadata:", metaError);
    }

    const biography = metadata?.find(m => m.key === "app_biography")?.value;
    const neuralScheme = metadata?.find(m => m.key === "neural_scheme")?.value;

    const systemPrompt = `You are the SKY Studio AI Assistant, a "Second Brain" for this YouTube production pipeline application.
You have full knowledge of the app's biography and neural scheme.

APP BIOGRAPHY:
${JSON.stringify(biography, null, 2)}

NEURAL SCHEME:
${JSON.stringify(neuralScheme, null, 2)}

YOUR ROLE:
- Help the user manage their YouTube production pipeline.
- You can explain how each page works (Ideas Engine, Idea Cards, Scripting, etc.).
- You can provide data structure info for tables like sources_master, scripts, etc.
- Always be helpful, concise, and act as a proactive assistant.
- You have access to read and write data (conceptually, through your responses).

CURRENT CONTEXT:
The user is interacting with you through a chat bubble available on every page.
Solve their queries based on the app's current state and history.`;

    const response = await fetch("https://api.lovable.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
      }),
    });

    const data = await response.json();
    const assistantMessage = data.choices[0].message;

    // Save to history
    const lastUserMessage = messages[messages.length - 1];
    await supabase.from("ai_chat_memory").insert([
      { role: "user", content: lastUserMessage.content },
      { role: "assistant", content: assistantMessage.content }
    ]);

    return new Response(JSON.stringify(assistantMessage), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
