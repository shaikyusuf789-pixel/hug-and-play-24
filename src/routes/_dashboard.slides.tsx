import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { 
  FileVideo, 
  Loader2, 
  Settings, 
  RefreshCcw, 
  Eye,
  Type,
  Layout,
  Play,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dashboard/slides")({
  component: SlideMaker,
});

function SlideMaker() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchScripts();
  }, []);

  useEffect(() => {
    if (selectedScriptId) {
      fetchChunks(selectedScriptId);
    }
  }, [selectedScriptId]);

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

  const generateSlidePrompt = async (chunkId: string) => {
    setProcessingId(`${chunkId}-prompt`);
    try {
      const { error } = await supabase.functions.invoke("generate-slides", {
        body: { chunkId, action: "generate-prompt" },
      });

      if (error) throw error;
      toast.success("Slide prompt generated with GPT-4o");
      fetchChunks(selectedScriptId);
    } catch (error: any) {
      toast.error("Prompt generation failed: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const generateGammaSlide = async (chunkId: string) => {
    setProcessingId(`${chunkId}-slide`);
    try {
      const { error } = await supabase.functions.invoke("generate-slides", {
        body: { chunkId, action: "generate-slide" },
      });

      if (error) throw error;
      toast.success("Gamma slide generated successfully!");
      fetchChunks(selectedScriptId);
    } catch (error: any) {
      toast.error("Gamma generation failed: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const updatePrompt = async (chunkId: string, prompt: string) => {
    const { error } = await supabase
      .from("script_chunks")
      .update({ slide_prompt: prompt })
      .eq("id", chunkId);
    
    if (error) {
      toast.error("Failed to update prompt: " + error.message);
    } else {
      toast.success("Prompt saved");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6 md:space-y-8 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2 md:p-3 bg-rose-100 text-rose-600 rounded-2xl">
            <FileVideo className="h-6 w-6 md:h-8 md:w-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Slide Maker</h1>
            <p className="text-sm md:text-base text-slate-500">AI Slide generation using Gamma & GPT-4o.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
            <SelectTrigger className="w-full sm:w-[280px] bg-white">
              <SelectValue placeholder="Select Script" />
            </SelectTrigger>
            <SelectContent>
              {scripts.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="bg-white">
            <Settings className="h-4 w-4 mr-2" />
            Gamma Config
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:gap-8">
        {chunks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed">
            <p className="text-slate-400">Select a script to start generating slides</p>
          </div>
        ) : (
          chunks.map((chunk, idx) => (
            <SlideChunkCard 
              key={chunk.id} 
              chunk={chunk} 
              idx={idx} 
              processingId={processingId}
              generateSlidePrompt={generateSlidePrompt}
              generateGammaSlide={generateGammaSlide}
              updatePrompt={updatePrompt}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SlideChunkCard({ 
  chunk, 
  idx, 
  processingId, 
  generateSlidePrompt, 
  generateGammaSlide, 
  updatePrompt 
}: { 
  chunk: any, 
  idx: number, 
  processingId: string | null,
  generateSlidePrompt: (id: string) => Promise<void>,
  generateGammaSlide: (id: string) => Promise<void>,
  updatePrompt: (id: string, prompt: string) => Promise<void>
}) {
  const [showFullContent, setShowFullContent] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(chunk.slide_prompt || "");

  useEffect(() => {
    setLocalPrompt(chunk.slide_prompt || "");
  }, [chunk.slide_prompt]);

  const isContentLong = chunk.content.length > 150;
  const isPromptLong = (localPrompt || "").length > 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 bg-white p-4 md:p-6 rounded-3xl border shadow-sm">
      {/* Column 1: Chunk Preview */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded uppercase">
            Chunk {idx + 1}
          </span>
          <div className="text-[10px] text-slate-400 font-medium">
            {chunk.content.split(' ').length} words
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`relative p-3 bg-slate-50 rounded-2xl border text-sm text-slate-600 leading-relaxed overflow-hidden transition-all duration-300 ${showFullContent ? 'max-h-none' : 'max-h-[100px]'}`}>
            {chunk.content}
            {!showFullContent && isContentLong && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
            )}
          </div>
          {isContentLong && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="mt-1 h-7 text-[10px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/50 flex items-center gap-1"
              onClick={() => setShowFullContent(!showFullContent)}
            >
              {showFullContent ? <><ChevronUp className="h-3 w-3" /> See Less</> : <><ChevronDown className="h-3 w-3" /> See More</>}
            </Button>
          )}
        </div>

        <Button 
          className="w-full bg-indigo-600 hover:bg-indigo-700 h-9 text-xs"
          onClick={() => generateSlidePrompt(chunk.id)}
          disabled={processingId === `${chunk.id}-prompt`}
        >
          {processingId === `${chunk.id}-prompt` ? (
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          ) : (
            <Type className="h-3 w-3 mr-2" />
          )}
          Generate GPT-4o Prompt
        </Button>
      </div>

      {/* Column 2: Prompt Preview */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center gap-2">
          <Type className="h-3 w-3 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase text-slate-400">GPT-4o Slide Content</span>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`relative transition-all duration-300 ${showFullPrompt ? 'h-auto min-h-[150px]' : 'h-[100px]'}`}>
            <Textarea 
              className="w-full h-full bg-indigo-50/30 border-indigo-100 text-xs font-medium resize-none focus-visible:ring-indigo-500"
              placeholder="Slide prompt will appear here..."
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              onBlur={() => updatePrompt(chunk.id, localPrompt)}
            />
          </div>
          {isPromptLong && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="mt-1 h-7 text-[10px] text-indigo-600 hover:bg-indigo-50/50 flex items-center gap-1"
              onClick={() => setShowFullPrompt(!showFullPrompt)}
            >
              {showFullPrompt ? <><ChevronUp className="h-3 w-3" /> Minimize</> : <><ChevronDown className="h-3 w-3" /> Expand</>}
            </Button>
          )}
        </div>

        <Button 
          variant="outline"
          className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 h-9 text-xs"
          onClick={() => generateGammaSlide(chunk.id)}
          disabled={!localPrompt || processingId === `${chunk.id}-slide`}
        >
          {processingId === `${chunk.id}-slide` ? (
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          ) : (
            <Layout className="h-3 w-3 mr-2" />
          )}
          Create Gamma Slide
        </Button>
      </div>

      {/* Column 3: Generated Slide Preview */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-3 w-3 text-rose-500" />
          <span className="text-[10px] font-bold uppercase text-slate-400">Gamma Preview</span>
        </div>
        <div className="aspect-video bg-slate-900 rounded-2xl border-2 md:border-4 border-slate-800 shadow-inner overflow-hidden relative group">
          {chunk.slide_url ? (
            <iframe 
              src={chunk.slide_url} 
              className="w-full h-full border-none"
              title={`Slide ${idx + 1}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
              <Layout className="h-6 w-6 mb-1 opacity-20" />
              <p className="text-[10px] font-medium">No slide yet</p>
            </div>
          )}
          
          {chunk.slide_url && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button variant="secondary" size="sm" className="h-8 text-[10px]" asChild>
                <a href={chunk.slide_url} target="_blank" rel="noreferrer">
                  Open in Gamma
                </a>
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-[10px] h-8">
            <RefreshCcw className="h-3 w-3 mr-1" /> Regenerate
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-[10px] h-8">
            <Play className="h-3 w-3 mr-1" /> Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
