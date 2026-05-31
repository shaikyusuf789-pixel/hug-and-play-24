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
  ChevronUp,
  History,
  CheckCircle2,
  StickyNote
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/slides")({
  component: SlideMaker,
});

function SlideMaker() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
      if (data && data.length > 0 && !selectedScriptId) {
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
      const { data, error } = await supabase.functions.invoke("generate-slides", {
        body: { chunkId, action: "generate-prompt" },
      });

      if (error) throw error;
      
      toast.success("Slide prompt generated with GPT-4o");
      
      // Update the specific chunk in the state immediately to reflect the change
      if (data && data.prompt) {
        setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, slide_prompt: data.prompt } : c));
      } else {
        await fetchChunks(selectedScriptId);
      }
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
      // Update local state to ensure it's synced
      setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, slide_prompt: prompt } : c));
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
      {/* Header section matching Script Generator atmosphere */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 md:mb-6">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
            <StickyNote className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[9px] md:text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 2</span>
              <span className="text-[9px] md:text-[10px] text-slate-400 font-medium tracking-wider">• SKY Academy DNA v4.1</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Slide Maker</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 md:flex-none flex items-center gap-2 text-[11px] md:text-xs h-9 md:h-10"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
            {showHistory ? "Hide History" : "View Scripts"}
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] md:text-xs font-bold border border-emerald-100 whitespace-nowrap">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            DNA Active
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {scripts.map(script => (
            <button
              key={script.id}
              onClick={() => {
                setSelectedScriptId(script.id);
                setShowHistory(false);
              }}
              className={cn(
                "flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all hover:shadow-md",
                selectedScriptId === script.id 
                  ? "border-rose-500 bg-rose-50/50" 
                  : "border-slate-100 bg-white hover:border-rose-200"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <FileVideo className={cn("h-4 w-4", selectedScriptId === script.id ? "text-rose-600" : "text-slate-400")} />
                <span className="text-xs font-bold truncate max-w-[200px]">{script.title}</span>
              </div>
              <span className="text-[10px] text-slate-500">{new Date(script.created_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}

      {!showHistory && (
        <div className="flex items-center gap-4 mb-6">
          <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
            <SelectTrigger className="w-full md:w-[400px] bg-white border-slate-200 h-10 rounded-xl shadow-sm focus:ring-rose-500">
              <SelectValue placeholder="Select Script to generate slides" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 shadow-lg">
              {scripts.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-sm font-medium">
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full h-10 w-10">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {chunks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
            <div className="p-4 bg-slate-50 rounded-full mb-4">
              <Layout className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-slate-400 font-medium">Select a script to start generating slides</p>
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

  const isContentLong = chunk.content.length > 120;
  const isPromptLong = (localPrompt || "").length > 80;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 bg-white p-4 md:p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* Column 1: Chunk Preview */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-slate-900 text-white flex items-center justify-center rounded-md text-[10px] font-bold">
              {idx + 1}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Script Chunk
            </span>
          </div>
          <div className="text-[10px] text-slate-300 font-bold uppercase tracking-tight">
            {chunk.content.split(' ').length} WORDS
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
          <div className={cn(
            "relative p-3 bg-slate-50/50 rounded-xl border border-slate-100 text-[11px] md:text-xs text-slate-600 leading-relaxed overflow-hidden transition-all duration-300",
            showFullContent ? "max-h-none" : "max-h-[80px]"
          )}>
            {chunk.content}
            {!showFullContent && isContentLong && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
            )}
          </div>
          {isContentLong && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="mt-1 h-6 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50/50 flex items-center justify-start gap-1 p-0 px-2 w-fit font-bold uppercase tracking-wider"
              onClick={() => setShowFullContent(!showFullContent)}
            >
              {showFullContent ? <><ChevronUp className="h-3 w-3" /> LESS</> : <><ChevronDown className="h-3 w-3" /> MORE</>}
            </Button>
          )}
        </div>

        <Button 
          className={cn(
            "w-full h-8 text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all",
            chunk.slide_prompt ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200"
          )}
          onClick={() => generateSlidePrompt(chunk.id)}
          disabled={processingId === `${chunk.id}-prompt`}
        >
          {processingId === `${chunk.id}-prompt` ? (
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          ) : (
            <Type className="h-3 w-3 mr-2" />
          )}
          {chunk.slide_prompt ? "Regenerate Prompt" : "Generate Prompt"}
        </Button>
      </div>

      {/* Column 2: Prompt Preview */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center gap-2">
          <Type className="h-3 w-3 text-rose-500" />
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">GPT-4o Slide Content</span>
          {chunk.slide_prompt && <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-auto" />}
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
          <div className={cn(
            "relative transition-all duration-300",
            showFullPrompt ? "h-auto min-h-[120px]" : "h-[80px]"
          )}>
            <Textarea 
              className="w-full h-full bg-rose-50/20 border-rose-100/50 text-[11px] md:text-xs font-medium resize-none focus-visible:ring-rose-500 p-2.5 rounded-xl placeholder:text-slate-300"
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
              className="mt-1 h-6 text-[10px] text-rose-600 hover:bg-rose-50/50 flex items-center justify-start gap-1 p-0 px-2 w-fit font-bold uppercase tracking-wider"
              onClick={() => setShowFullPrompt(!showFullPrompt)}
            >
              {showFullPrompt ? <><ChevronUp className="h-3 w-3" /> MINIMIZE</> : <><ChevronDown className="h-3 w-3" /> EXPAND</>}
            </Button>
          )}
        </div>

        <Button 
          variant="outline"
          className={cn(
            "w-full h-8 text-[11px] font-bold uppercase tracking-wider border-slate-200",
            chunk.slide_url ? "bg-slate-50 text-slate-500" : "bg-white text-rose-600 hover:bg-rose-50 border-rose-200"
          )}
          onClick={() => generateGammaSlide(chunk.id)}
          disabled={!localPrompt || processingId === `${chunk.id}-slide`}
        >
          {processingId === `${chunk.id}-slide` ? (
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          ) : (
            <Layout className="h-3 w-3 mr-2" />
          )}
          {chunk.slide_url ? "Update Slide" : "Create Slide"}
        </Button>
      </div>

      {/* Column 3: Generated Slide Preview */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-3 w-3 text-rose-500" />
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Gamma Preview</span>
        </div>
        <div className="aspect-video bg-slate-900 rounded-xl border-2 border-slate-100 shadow-inner overflow-hidden relative group">
          {chunk.slide_url ? (
            <iframe 
              src={chunk.slide_url} 
              className="w-full h-full border-none scale-100"
              title={`Slide ${idx + 1}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-700 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950">
              <Layout className="h-6 w-6 mb-1 opacity-20 text-white" />
              <p className="text-[10px] font-bold text-slate-500 tracking-tighter uppercase">NO SLIDE YET</p>
            </div>
          )}
          
          {chunk.slide_url && (
            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" className="h-7 text-[10px] font-bold uppercase bg-white text-slate-900 hover:bg-slate-100" asChild>
                <a href={chunk.slide_url} target="_blank" rel="noreferrer">
                  Open
                </a>
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-[9px] font-bold uppercase h-7 border-slate-200 text-slate-500 hover:bg-slate-50"
            onClick={() => generateGammaSlide(chunk.id)}
            disabled={!localPrompt || processingId === `${chunk.id}-slide`}
          >
            <RefreshCcw className="h-2.5 w-2.5 mr-1" /> Regenerate
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-[9px] font-bold uppercase h-7 border-slate-200 text-slate-500 hover:bg-slate-50">
            <Play className="h-2.5 w-2.5 mr-1" /> Preview
          </Button>
        </div>
      </div>
    </div>
  );
}

