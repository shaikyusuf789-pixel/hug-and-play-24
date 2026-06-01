import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Layers, Scissors, CheckCircle2, ChevronRight, Play, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { saveChunks } from "@/lib/engine.functions";
import { processChunks } from "@/lib/api/process-chunks.server";

export const Route = createFileRoute("/_dashboard/chunks")({
  component: ChunksPage,
});

function ChunksPage() {
  const saveChunksFn = useServerFn(saveChunks);
  const processChunksFn = useServerFn(processChunks);
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetWords, setTargetWords] = useState<number>(185);


  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .eq("status", "SCRIPT_DONE")
      .not("content", "is", null)
      .neq("content", "")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      toast.error("Failed to fetch scripts");
      return;
    }
    // Dedupe by idea_id (keep latest), fall back to id when idea_id is null
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const s of data || []) {
      const key = s.idea_id ?? `__noidea_${s.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
      if (deduped.length >= 15) break;
    }
    setScripts(deduped);
  };

  useEffect(() => {
    if (selectedScriptId) {
      fetchExistingChunks(selectedScriptId);
    } else {
      setChunks([]);
    }
  }, [selectedScriptId]);

  const fetchExistingChunks = async (scriptId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("script_chunks")
      .select("*")
      .eq("script_id", scriptId)
      .order("chunk_index", { ascending: true });
    
    if (error) {
      toast.error("Failed to fetch existing chunks");
    } else {
      setChunks(data || []);
    }
    setLoading(false);
  };

  const handleGenerateChunks = async () => {
    if (!selectedScriptId) {
      toast.error("Please select a script first");
      return;
    }

    const script = scripts.find(s => s.id === selectedScriptId);
    if (!script) return;

    setGenerating(true);
    try {
      const data = await processChunksFn({
        data: { scriptContent: script.content, targetWords },
      });

      const generatedContents: string[] = data.chunks;
      const newChunks = generatedContents.map((content: string, index: number) => ({
        id: `temp-${index}`,
        chunk_index: index,
        content,
        word_count: content.trim().split(/\s+/).length,
        status: 'PENDING'
      }));

      setChunks(newChunks);

      // AUTO-SAVE: persist immediately so a revisit shows them.
      // saveChunks replaces any previous chunks for this script.
      try {
        await saveChunksFn({
          data: {
            script_id: selectedScriptId,
            chunks: generatedContents,
          }
        });
        toast.success(`Generated & auto-saved ${newChunks.length} chunks`);
        fetchExistingChunks(selectedScriptId);
      } catch (saveErr: any) {
        console.error("Auto-save chunks failed:", saveErr);
        toast.warning(`Generated ${newChunks.length} chunks — auto-save failed, click Save All`);
      }
    } catch (error: any) {
      console.error("Chunking error:", error);
      toast.error(error.message || "Failed to generate chunks");
    } finally {
      setGenerating(false);
    }
  };


  const handleSaveAll = async () => {
    if (!selectedScriptId || chunks.length === 0) return;
    setSaving(true);
    try {
      await saveChunksFn({
        data: {
          script_id: selectedScriptId,
          chunks: chunks.map(c => c.content)
        }
      });
      toast.success("All chunks saved successfully");
      fetchExistingChunks(selectedScriptId);
    } catch (error) {

      toast.error("Failed to save chunks");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateChunkContent = (index: number, content: string) => {
    const updated = [...chunks];
    updated[index] = { ...updated[index], content, word_count: content.trim().split(/\s+/).length };
    setChunks(updated);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] md:text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 2</span>
            <span className="text-[9px] md:text-[10px] text-slate-400 font-medium tracking-wider">• SEGMENTATION ENGINE</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Chunking Engine</h1>
          <p className="text-sm md:text-base text-slate-500">Smart script segmentation for optimized visual matching.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4 w-full md:w-auto">
          <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
            <SelectTrigger className="w-full sm:w-[280px] md:w-[320px] bg-white border-slate-200 h-10 md:h-11">
              <SelectValue placeholder="Select a script to chunk" />
            </SelectTrigger>
            <SelectContent>
              {scripts.length > 0 ? (
                scripts.map((script) => (
                  <SelectItem key={script.id} value={script.id}>
                    {script.title}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>No finished scripts found</SelectItem>
              )}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={handleGenerateChunks} 
            disabled={generating || !selectedScriptId}
            className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 px-6 gap-2 h-10 md:h-11 font-bold text-sm"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            Auto Chunk
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-slate-700">Words per chunk</div>
              <div className="text-xs text-slate-500">AI will aim for ~{targetWords} words per chunk ({Math.max(20, targetWords - 20)}–{targetWords + 20} range).</div>
            </div>
            <div className="text-2xl font-bold text-indigo-600 tabular-nums min-w-[3rem] text-right">{targetWords}</div>
          </div>
          <Slider
            value={[targetWords]}
            onValueChange={(v) => setTargetWords(v[0])}
            min={80}
            max={300}
            step={5}
            disabled={generating}
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
            <span>80</span>
            <span>185 (default)</span>
            <span>300</span>
          </div>
        </CardContent>
      </Card>

      {chunks.length > 0 && (
        <div className="flex justify-between items-center">
          <div className="text-sm font-medium text-slate-500">
            {chunks.length} Chunks Generated
          </div>
          <Button onClick={handleSaveAll} disabled={saving} variant="outline" className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All Chunks
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-24">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500 opacity-50" />
        </div>
      ) : chunks.length > 0 ? (
        <div className="grid gap-6">
          {chunks.map((chunk, index) => (
            <Card key={chunk.id} className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="bg-slate-50/50 py-3 px-6 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">
                    {index + 1}
                  </span>
                  Chunk Content
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 bg-white border px-2 py-0.5 rounded uppercase">
                    {chunk.word_count} words
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                    chunk.status === "DONE" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                  )}>
                    {chunk.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                <Textarea 
                  value={chunk.content}
                  onChange={(e) => handleUpdateChunkContent(index, e.target.value)}
                  className="min-h-[120px] md:min-h-[140px] text-slate-800 leading-relaxed resize-none focus-visible:ring-indigo-500 border-none p-0 focus-visible:ring-0 shadow-none text-sm md:text-base font-telugu bg-transparent"
                  placeholder="Chunk content..."
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="bg-slate-900/50 rounded-3xl border border-dashed border-white/10 p-20 text-center space-y-4">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10">
            <Layers className="h-8 w-8 text-slate-300" />
          </div>
          <div className="max-w-xs mx-auto space-y-2">
            <h3 className="text-lg font-bold text-white">No Chunks Segmented</h3>
            <p className="text-slate-500">Select a finished script, pick your target words per chunk above, then click "Auto Chunk" to split it using AI.</p>
          </div>
        </div>
      )}
    </div>
  );
}
