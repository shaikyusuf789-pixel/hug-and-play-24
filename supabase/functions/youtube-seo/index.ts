import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, scriptContent, prompt } = await req.json();
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) throw new Error("OPENAI_API_KEY is not set.");

    if (action === "generate-seo") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert YouTube SEO specialist. Generate titles, tags, and a description based on the script." },
            { role: "user", content: `Generate SEO for this script:\n\n${scriptContent}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      return new Response(JSON.stringify(content), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "thumbnail-lines") {
      // Logic for lines...
      return new Response(JSON.stringify({ line1: "Line 1", line2: "Line 2", dallePrompt: "Prompt" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
