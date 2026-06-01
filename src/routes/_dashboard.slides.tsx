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

const GAMMA_THEMES = [
  "Oasis","Aurora","Night Sky","Bubble Gum","Marina","Stargazer","Atmosphere",
  "Sketch","Sleek","Sapphire","Vintage","Blueberry","Chisel","Chalkboard",
  "Crimson","Daydream","Dynamic","Finesse","Flow","Icebreaker","Keynote",
  "Linen","Lux","Mint","Mocha","Moss","Nightfall","Peach","Piano","Prism",
  "Rose","Serene","Slate","Stellar","Sunset","Verdant","Vortex"
];

function SlideMaker() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [gammaTheme, setGammaTheme] = useState<string>("Oasis");

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
      const { data, error } = await supabase.functions.invoke("generate-slides", {
        body: { chunkId, action: "generate-slide", themeName: gammaTheme },
      });

      if (error) throw error;
      if (data?.slide_url) {
        setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, slide_url: data.slide_url, status: "slide_generated" } : c));
      }
      toast.success("Gamma slide generated!");
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
        <div className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-orange-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Chunk-wise Slide Generation</h2>
              <p className="text-[10px] text-slate-400">Each chunk → Individual Gamma slide</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
              <SelectTrigger className="w-full md:w-[250px] bg-slate-50 border-slate-200 h-9 text-xs rounded-lg">
                <SelectValue placeholder="Select Script" />
              </SelectTrigger>
              <SelectContent>
                {scripts.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={gammaTheme} onValueChange={setGammaTheme}>
              <SelectTrigger className="w-full md:w-[170px] bg-orange-50 border-orange-200 h-9 text-xs rounded-lg font-bold text-orange-700">
                <SelectValue placeholder="Gamma Theme" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {GAMMA_THEMES.map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="flex gap-2 shrink-0">
              <Button 
                variant="outline" 
                className="h-9 text-[10px] font-bold gap-2 border-purple-200 text-purple-600 hover:bg-purple-50"
                disabled={isProcessingAll || !!processingId}
                onClick={async () => {
                  if (chunks.length === 0) return;
                  setIsProcessingAll(true);
                  toast.info("Queueing outlines...");
                  for (const chunk of chunks) await generateSlidePrompt(chunk.id);
                  toast.success("All outlines generated!");
                  setIsProcessingAll(false);
                }}
              >
                {isProcessingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />}
                All Outlines
              </Button>
              <Button 
                className="h-9 text-[10px] font-bold gap-2 bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-100"
                disabled={isProcessingAll || !!processingId}
                onClick={async () => {
                  if (chunks.length === 0) return;
                  setIsProcessingAll(true);
                  toast.info("Queueing slides...");
                  for (const chunk of chunks) if (chunk.slide_prompt) await generateGammaSlide(chunk.id);
                  toast.success("All slides generated!");
                  setIsProcessingAll(false);
                }}
              >
                {isProcessingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layout className="h-3.5 w-3.5" />}
                Generate All Slides
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-6">
        <p className="text-[10px] text-slate-500 font-medium">
          Each row has 3 columns: <span className="font-bold">Chunk Text</span> (source) → <span className="font-bold">Slide Outline</span> (editable, AI-generated) → <span className="font-bold">Gamma Slide</span> (1-slide Gamma deck). Use <span className="font-bold text-orange-600">Generate All Slides</span> to process everything automatically.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {chunks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
      {/* Column 1: Chunk Preview */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-purple-600 text-white flex items-center justify-center rounded text-[9px] font-bold">
            {idx + 1}
          </div>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Chunk Text</span>
        </div>
        
        <div className={cn(
          "relative p-2.5 bg-white rounded-lg border border-slate-200 text-[10px] text-slate-600 leading-relaxed overflow-hidden shadow-sm",
          showFullContent ? "max-h-none" : "max-h-[120px]"
        )}>
          {chunk.content}
          {!showFullContent && isContentLong && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
          )}
        </div>
        
        {isContentLong && (
          <button 
            className="text-[9px] text-purple-600 font-bold uppercase w-fit hover:underline"
            onClick={() => setShowFullContent(!showFullContent)}
          >
            {showFullContent ? "See Less" : "See More"}
          </button>
        )}

        <Button 
          className="w-full h-8 text-[9px] font-bold uppercase bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm"
          onClick={() => generateSlidePrompt(chunk.id)}
          disabled={processingId === `${chunk.id}-prompt`}
        >
          {processingId === `${chunk.id}-prompt` ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Type className="h-3 w-3 mr-1.5" />
          )}
          {chunk.slide_prompt ? "Regenerate Outline" : "Generate Outline"}
        </Button>
      </div>

      {/* Column 2: Prompt Preview */}
      <div className="flex flex-col space-y-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Slide Outline</span>
        <div className={cn(
          "relative transition-all duration-200 shadow-sm rounded-lg border border-slate-200",
          showFullPrompt ? "h-auto" : "h-[120px]"
        )}>
          <Textarea 
            className="w-full h-full bg-white border-none text-[10px] resize-none p-2.5 rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Generate outline first →"
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={() => updatePrompt(chunk.id, localPrompt)}
          />
        </div>
        {isPromptLong && (
          <button 
            className="text-[9px] text-purple-600 font-bold uppercase w-fit hover:underline"
            onClick={() => setShowFullPrompt(!showFullPrompt)}
          >
            {showFullPrompt ? "See Less" : "See More"}
          </button>
        )}
      </div>

      <div className="flex flex-col space-y-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Gamma Slide</span>
        <div className="aspect-video bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-slate-200 overflow-hidden relative shadow-sm flex items-center justify-center">
          {chunk.slide_url && chunk.slide_url !== "https://gamma.app/placeholder" ? (
            <a
              href={chunk.slide_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-2 w-full h-full hover:bg-orange-100/40 transition-colors p-3 text-center"
            >
              <Layout className="h-8 w-8 text-orange-500" />
              <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Gamma Slide Ready</span>
              <span className="text-[9px] text-slate-500 underline break-all line-clamp-2">{chunk.slide_url}</span>
              <span className="text-[8px] text-slate-400">Click to open in new tab ↗</span>
            </a>
          ) : (
            <div className="text-[9px] text-slate-400 font-bold uppercase">No slide yet</div>
          )}
        </div>
        <Button 
          variant="outline"
          className="w-full h-8 text-[9px] font-bold uppercase border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg shadow-sm"
          onClick={() => generateGammaSlide(chunk.id)}
          disabled={!localPrompt || processingId === `${chunk.id}-slide`}
        >
          {processingId === `${chunk.id}-slide` ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Layout className="h-3 w-3 mr-1.5" />
          )}
          {chunk.slide_url ? "Update Slide" : "Generate Slide"}
        </Button>
      </div>
    </div>
  );
}

