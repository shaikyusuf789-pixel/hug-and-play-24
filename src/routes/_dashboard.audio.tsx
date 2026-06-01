import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { 
  Mic2, 
  PlayCircle, 
  Loader2, 
  Settings, 
  Volume2, 
  RefreshCcw, 
  Download,
  Merge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dashboard/audio")({
  component: AudioEngine,
});

const GOOGLE_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", 
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", 
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", 
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", 
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"
];

function AudioEngine() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [model, setModel] = useState<string>("google");
  const [voiceId, setVoiceId] = useState<string>("Zephyr");
  const [loading, setLoading] = useState(false);
  const [generatingChunkId, setGeneratingChunkId] = useState<string | null>(null);

  useEffect(() => {
    fetchScripts();
  }, []);

  useEffect(() => {
    if (selectedScriptId) {
      fetchChunks(selectedScriptId);
    }
  }, [selectedScriptId]);

  // Auto-refresh while any audio job is queued/processing in background
  useEffect(() => {
    if (!selectedScriptId) return;
    const hasActive = chunks.some(c => c.audio_job_status === "queued" || c.audio_job_status === "processing");
    if (!hasActive) return;
    const t = setInterval(() => fetchChunks(selectedScriptId), 4000);
    return () => clearInterval(t);
  }, [selectedScriptId, chunks]);

  // Auto-fill default voice when switching providers (user can still edit)
  useEffect(() => {
    if (model === "elevenlabs") {
      setVoiceId("UusdT1frXE5G4cvEE2dJ");
    } else if (model === "google") {
      setVoiceId("Zephyr");
    }
  }, [model]);

  const fetchScripts = async () => {
    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast.error("Error fetching scripts: " + error.message);
    } else {
      setScripts(data || []);
      if (data && data.length > 0) {
        setSelectedScriptId(data[0].id);
      }
    }
  };

  const fetchChunks = async (scriptId: string) => {
    const { data, error } = await supabase
      .from("script_chunks")
      .select("*")
      .eq("script_id", scriptId)
      .order("chunk_index", { ascending: true });
    
    if (error) {
      toast.error("Error fetching chunks: " + error.message);
    } else {
      setChunks(data || []);
    }
  };

  const generateAudio = async (chunkId: string) => {
    setGeneratingChunkId(chunkId);
    try {
      const res = await supabase.functions.invoke("generate-audio", {
        body: { 
          chunkId, 
          provider: model, 
          voiceId,
          model: model === "google" ? "gemini-2.5-pro-preview-tts" : undefined
        },
      });

      if (res.error) throw res.error;
      const data = res.data;


      toast.success("Audio generated successfully.");
      fetchChunks(selectedScriptId);
    } catch (error: any) {
      toast.error("Generation failed: " + error.message);
    } finally {
      setGeneratingChunkId(null);
    }
  };

  const generateAllAudio = async () => {
    if (!selectedScriptId || chunks.length === 0) return;
    setLoading(true);
    try {
      const eligibleIds = chunks
        .filter(c => !c.audio_url && c.audio_job_status !== "processing")
        .map(c => c.id);
      if (eligibleIds.length === 0) {
        toast.info("All chunks already have audio.");
        return;
      }
      const { error: upErr } = await supabase
        .from("script_chunks")
        .update({
          audio_job_status: "queued",
          audio_job_provider: model,
          audio_job_voice_id: voiceId,
          audio_job_error: null,
        })
        .in("id", eligibleIds);
      if (upErr) throw upErr;

      // Fire-and-forget the background worker
      supabase.functions.invoke("process-queue", { body: { scriptId: selectedScriptId } }).catch(() => {});

      toast.success(`Queued ${eligibleIds.length} audio clips — running in background. You can leave this page.`);
      await fetchChunks(selectedScriptId);
    } catch (error: any) {
      toast.error("Failed to queue: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const mergeAudio = async () => {
    setLoading(true);
    try {
      toast.info("Downloading and merging all chunks...");
      
      const audioChunks = chunks.filter(c => c.audio_url);
      if (audioChunks.length === 0) {
        toast.error("No audio chunks generated yet.");
        return;
      }

      const blobs = await Promise.all(
        audioChunks.map(async (c) => {
          const resp = await fetch(c.audio_url);
          return await resp.blob();
        })
      );

      // Simple concatenation (works for some MP3s/WAVs)
      const mergedBlob = new Blob(blobs, { type: "audio/mpeg" });
      const url = URL.createObjectURL(mergedBlob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `merged_script_${selectedScriptId.slice(0, 8)}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Merged audio downloaded!");
    } catch (error: any) {
      toast.error("Merge failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
            <Mic2 className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Audio Generation</h1>
            <p className="text-slate-500">Create high-quality AI voiceovers for your script chunks.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={generateAllAudio} 
            disabled={loading || !selectedScriptId}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            Generate All
          </Button>
          <Button 
            className="bg-purple-600 hover:bg-purple-700" 
            onClick={mergeAudio}
            disabled={!chunks.some(c => c.audio_url)}
          >
            <Merge className="mr-2 h-4 w-4" />
            Merge & Download
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Script</Label>
              <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a script" />
                </SelectTrigger>
                <SelectContent>
                  {scripts.map((script) => (
                    <SelectItem key={script.id} value={script.id}>
                      {script.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model Provider</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google AI Studio</SelectItem>
                  <SelectItem value="elevenlabs">Eleven Labs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {model === "google" ? (
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_VOICES.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Eleven Labs Voice ID</Label>
                <Input 
                  placeholder="Paste Voice ID here..." 
                  value={voiceId} 
                  onChange={(e) => setVoiceId(e.target.value)} 
                />
                <p className="text-[10px] text-slate-400">Make sure ELEVEN_LABS_API_KEY is in secrets.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Chunks & Previews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {chunks.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                Select a script to view chunks
              </div>
            ) : (
              chunks.map((chunk, idx) => (
                <div key={chunk.id} className="p-4 rounded-xl border bg-slate-50/50 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-1 bg-slate-200 rounded text-slate-600">
                        CHUNK {idx + 1}
                      </span>
                      {chunk.audio_job_status === "queued" && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase">Queued</span>
                      )}
                      {chunk.audio_job_status === "processing" && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
                        </span>
                      )}
                      {chunk.audio_job_status === "failed" && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded uppercase" title={chunk.audio_job_error || ""}>Failed</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => generateAudio(chunk.id)}
                        disabled={generatingChunkId === chunk.id}
                      >
                        <RefreshCcw className={`h-4 w-4 ${generatingChunkId === chunk.id ? 'animate-spin' : ''}`} />
                      </Button>
                      {chunk.audio_url && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-blue-600"
                          asChild
                        >
                          <a href={chunk.audio_url} download target="_blank">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                    {chunk.content}
                  </p>

                  {chunk.audio_url ? (
                    <div className="flex items-center gap-3 pt-2">
                      <audio controls src={chunk.audio_url} className="h-10 w-full" />
                    </div>
                  ) : (
                    <div className="pt-2">
                      <Button 
                        size="sm" 
                        className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 border-none"
                        onClick={() => generateAudio(chunk.id)}
                        disabled={generatingChunkId === chunk.id}
                      >
                        {generatingChunkId === chunk.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="mr-2 h-4 w-4" />
                        )}
                        Generate Audio
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
