import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { 
      topic, 
      content, 
      chapterContext, 
      videoType, 
      inputMode, 
      wordCount, 
      specialInstructions, 
      provider, 
      model 
    } = await req.json();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GOOGLE_API_KEY"); // Or GOOGLE_AI_STUDIO_API_KEY

    // Logic for segments calculation
    const wordsPerSeg = 175; // Average of 150-200
    const numSegs = Math.max(1, Math.round(wordCount / wordsPerSeg));

    const dnaText = videoType === "subjective" ? 
      `VIDEO TYPE: SUBJECTIVE -- DEEP SUBJECT TEACHING
MINIMUM ONE memory hint per major concept.
After each concept: mention PYQ angle naturally.
Last segment: SKY Academy app CTA + Telegram study notes CTA.` : 
      `VIDEO TYPE: GENERAL -- STRATEGY / GUIDANCE / MOTIVATION
High motivation energy. Think passionate senior talking to juniors.
Max three or four strategy memory hints. Community building. Telegram CTA.`;

    const systemPrompt = `You are an expert Telugu video script writer for SKY Academy.
Write a COMPLETE, ORIGINAL SKY Academy voiceover script.
${dnaText}

All Telugu content must use Telugu Unicode script characters. Never use Roman transliteration.
ALL numbers in telugu_text must be written as English words. ZERO emojis.
Generate exactly ${numSegs} segments. Each segment MUST be 150-180 words.

Return ONLY a valid JSON array. No preamble, no markdown fences.
[
  {
    "seg": 1,
    "title": "3-5 word English heading",
    "telugu_text": "full voiceover in TELUGU UNICODE SCRIPT"
  }
]`;

    const userPrompt = `
Topic: ${topic || "No topic provided"}
${chapterContext ? `Chapter/Outline Context: ${chapterContext}` : ""}
${content ? `Input Content: ${content}` : ""}
${specialInstructions ? `Special Instructions: ${specialInstructions}` : ""}
Number of Segments to generate: ${numSegs}
Total Word Count Target: ${wordCount}
`;

    let resultSegments = [];

    if (provider === "openai" || provider === "poe" || provider === "lovable-gemini" || provider === "anthropic") {
      // For simplicity in this rewrite, we route OpenAI-compatible providers to OpenAI if key exists
      // or use OpenAI as the primary engine for this specialized task.
      if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o", // Defaulting to high quality for script gen
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI failed: ${err}`);
      }

      const data = await res.json();
      const rawContent = data.choices[0].message.content;
      try {
        const parsed = JSON.parse(rawContent);
        // Sometimes AI wraps the array in an object like { "segments": [...] }
        resultSegments = Array.isArray(parsed) ? parsed : (parsed.segments || parsed.script || []);
      } catch (e) {
        // Fallback for markdown blocks
        const cleaned = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        resultSegments = JSON.parse(cleaned);
      }
    } else if (provider === "google") {
      if (!geminiKey) throw new Error("GOOGLE_API_KEY not configured");

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nUSER INPUT:\n${userPrompt}` }]
          }],
          generationConfig: {
            response_mime_type: "application/json",
          }
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini failed: ${err}`);
      }

      const data = await res.json();
      const rawContent = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(rawContent);
      resultSegments = Array.isArray(parsed) ? parsed : (parsed.segments || parsed.script || []);
    } else {
      throw new Error(`Provider ${provider} not implemented in Edge Function yet.`);
    }

    return new Response(JSON.stringify({ segments: resultSegments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
