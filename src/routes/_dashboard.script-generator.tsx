import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
// Tabs removed — page now shows a single full script with no segments.
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Wand2, FileText, CheckCircle2, X, Save, Edit3, RotateCcw, StickyNote, History, ShieldCheck, AlertTriangle, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIdeas, saveScript, getRecentScripts, updateScript } from "@/lib/engine.functions";
import { cn } from "@/lib/utils";
// pdfjsLib will be imported dynamically to avoid SSR issues
let pdfjsLib: any = null;
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const scriptSearchSchema = z.object({
  transcript: z.string().optional(),
  topic: z.string().optional(),
  ideaId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_dashboard/script-generator")({
  validateSearch: scriptSearchSchema,
  component: ScriptGenerator,
});

function ScriptGenerator() {
  const search = useSearch({ from: "/_dashboard/script-generator" });
  const getIdeasFn = useServerFn(getIdeas);
  const saveScriptFn = useServerFn(saveScript);
  const getRecentScriptsFn = useServerFn(getRecentScripts);
  const updateScriptFn = useServerFn(updateScript);
  const queryClient = useQueryClient();

  const [videoType, setVideoType] = useState<"subjective" | "general">("general");
  const [inputMode, setInputMode] = useState<"topic" | "transcript" | "pdf" | "idea">(
    search.ideaId ? "idea" : search.transcript ? "transcript" : "idea"
  );
  const [topic, setTopic] = useState(search.topic || "");
  const [chapterContext, setChapterContext] = useState("");
  const [content, setContent] = useState(search.transcript || "");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [wordCount, setWordCount] = useState(660);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scriptText, setScriptText] = useState<string>("");
  const [provider, setProvider] = useState("lovable-gemini");
  const [model, setModel] = useState("google/gemini-3.1-pro-preview");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string>(search.ideaId || "");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryScriptId, setSelectedHistoryScriptId] = useState<string>("");
  const [isFromHistory, setIsFromHistory] = useState(false);
  const [existingScriptId, setExistingScriptId] = useState<string | null>(null);
  const [isExistingScript, setIsExistingScript] = useState(false);

  // Fact-checking AI
  type FactFinding = { claim: string; issue: string; correction: string; source: string; severity?: "high" | "medium" | "low" };
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [factFindings, setFactFindings] = useState<FactFinding[]>([]);

  const [factCheckRan, setFactCheckRan] = useState(false);
  const [isApplyingFacts, setIsApplyingFacts] = useState(false);
  const [factCheckedAgainst, setFactCheckedAgainst] = useState<string>("");

  const handleFactCheck = async () => {
    if (!scriptText.trim()) return;
    setIsFactChecking(true);
    setFactFindings([]);
    setFactCheckRan(false);
    try {
      const res = await supabase.functions.invoke("fact-check-script", {
        body: { script: scriptText },
      });
      if (res.error) throw res.error;
      const findings: FactFinding[] = res.data?.findings || [];
      setFactFindings(findings);
      setFactCheckRan(true);
      setFactCheckedAgainst(scriptText);
      toast.success(findings.length === 0 ? "No factual issues found ✓" : `${findings.length} factual issue(s) found`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Fact-check failed");
    } finally {
      setIsFactChecking(false);
    }
  };

  const updateFinding = (idx: number, patch: Partial<FactFinding>) => {
    setFactFindings((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const removeFinding = (idx: number) => {
    setFactFindings((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleApproveFacts = async () => {
    if (!scriptText.trim() || factFindings.length === 0) return;
    setIsApplyingFacts(true);
    try {
      const res = await supabase.functions.invoke("apply-fact-corrections", {
        body: { script: scriptText, findings: factFindings },
      });
      if (res.error) throw res.error;
      const corrected = res.data?.corrected_script;
      if (!corrected) throw new Error("No corrected script returned");
      setScriptText(corrected);
      setFactFindings([]);
      setFactCheckRan(false);
      toast.success("Facts merged into script ✓");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to apply corrections");
    } finally {
      setIsApplyingFacts(false);
    }
  };

  const handleEnhanceScript = async () => {
    if (!scriptText.trim()) return;
    setIsEnhancing(true);
    try {
      const res = await supabase.functions.invoke("enhance-script", {
        body: { script: scriptText },
      });
      if (res.error) throw res.error;
      const enhanced = res.data?.enhancedScript;
      if (!enhanced) throw new Error("No enhanced script returned");
      setScriptText(enhanced);
      toast.success("Script enhanced with punctuations and emotions! ✓");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Enhancement failed");
    } finally {
      setIsEnhancing(false);
    }
  };


  const liveWordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).filter(Boolean).length : 0;
  const liveCharCount = scriptText.length;

  // Regenerate confirmation dialog
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);

  // Fetch last 15 priority-marked topics (includes ones already moved to
  // "Script Done"), most recent first. Then look up which of them already
  // have a saved script so the dropdown can mark them ✓.
  const { data: priorityIdeasData } = useQuery({
    queryKey: ["priority-ideas-recent-15"],
    queryFn: async () => {
      const { data: ideas, error } = await supabase
        .from("raw_content")
        .select("*")
        .in("status", ["Priority", "Script Done"])
        .order("updated_at", { ascending: false })
        .limit(15);
      if (error) throw error;

      const ids = (ideas || []).map((i: any) => i.id);
      let scriptMap: Record<string, { id: string; updated_at: string }> = {};
      if (ids.length > 0) {
        const { data: scripts } = await supabase
          .from("scripts")
          .select("id, idea_id, updated_at")
          .in("idea_id", ids);
        for (const s of scripts || []) {
          if (s.idea_id) scriptMap[s.idea_id] = { id: s.id, updated_at: s.updated_at ?? "" };
        }
      }
      return { ideas: ideas || [], scriptMap };
    },
    refetchInterval: 10000,
  });

  const approvedIdeas = (priorityIdeasData?.ideas || []) as any[];
  const scriptMap = (priorityIdeasData?.scriptMap || {}) as Record<string, { id: string; updated_at: string }>;

  // Autosave logic
  useEffect(() => {
    if (!scriptText.trim() || isGenerating || isEnhancing || isSaving) return;

    const timer = setTimeout(() => {
      handleSaveScript();
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(timer);
  }, [scriptText]);

  useEffect(() => {

    if (search.ideaId && approvedIdeas.length > 0) {
      handleIdeaSelect(search.ideaId);
    }
  }, [search.ideaId, approvedIdeas.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const loadPdfJs = async () => {
        try {
          // @ts-ignore - dynamic import for pdfjs-dist
          const mod = await import("pdfjs-dist");
          pdfjsLib = mod;
          pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
          console.log("PDF.js loaded successfully");
        } catch (error) {
          console.error("Failed to load PDF.js:", error);
        }
      };
      loadPdfJs();
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log("File selected:", file?.name, file?.type);
    if (!file) return;

    setIsUploading(true);
    setFileName(file.name);

    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();
      console.log("Processing file type:", fileType);
      
      if (fileType === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        
        // Ensure pdfjsLib is loaded
        if (!pdfjsLib && typeof window !== 'undefined') {
          try {
            // @ts-ignore - dynamic import of pdfjs-dist
            const mod = await import("pdfjs-dist");
            pdfjsLib = mod;
            pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
          } catch (e) {
            console.error("Delayed PDF.js load failed:", e);
            throw new Error("Could not initialize PDF reader. Please try refreshing.");
          }
        }

        if (!pdfjsLib) throw new Error("PDF library not ready");

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => (item as any).str).join(" ");
          fullText += pageText + "\n";
        }
        setContent(fullText);
        console.log("PDF text extracted, length:", fullText.length);
      } else if (fileType === 'md' || fileType === 'json' || fileType === 'txt') {
        const text = await file.text();
        setContent(text);
        console.log("Text file content read, length:", text.length);
      } else {
        toast.error("Unsupported file type. Please upload PDF, MD, or JSON.");
        setFileName(null);
      }
      
      toast.success(`${file.name} uploaded and processed!`);
    } catch (error) {
      console.error("File upload error:", error);
      toast.error("Failed to process file. Check console for details.");
      setFileName(null);
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const removeFile = () => {
    setFileName(null);
    setContent("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleIdeaSelect = async (ideaId: string) => {
    const idea = approvedIdeas.find(i => i.id === ideaId);
    if (!idea) return;
    
    setSelectedIdeaId(ideaId);
    setIsFromHistory(false);
    setSelectedHistoryScriptId("");
    setTopic(idea.proposed_title || idea.original_title || "");
    
    // Check if script already exists for this idea
    try {
      // Pick the latest script that actually has content. Earlier broken
      // streams may have left empty placeholder rows behind -- skip those.
      const { data: existingScripts, error } = await supabase
        .from("scripts")
        .select("*")
        .eq("idea_id", ideaId)
        .neq("content", "")
        .not("content", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (existingScripts && existingScripts.length > 0) {
        const script = existingScripts[0];
        setExistingScriptId(script.id);
        setIsExistingScript(true);
        setScriptText(script.content || "");

        // Hydrate fact-check findings saved by the async generator so the
        // user immediately sees the "wrong statements only" preview on revisit.
        const savedFindings = Array.isArray((script as any).fact_check_findings)
          ? ((script as any).fact_check_findings as FactFinding[])
          : [];
        setFactFindings(savedFindings);
        setFactCheckRan(savedFindings.length > 0 || (script as any).status === "FACT_CHECKED");
        setFactCheckedAgainst(script.content || "");

        // Also look up chunks + audio progress for this script so the
        // user sees "where they left off" on revisit.
        const { data: chunkRows } = await supabase
          .from("script_chunks")
          .select("id, audio_url")
          .eq("script_id", script.id);

        const totalChunks = chunkRows?.length || 0;
        const audioDone = (chunkRows || []).filter((c: any) => !!c.audio_url).length;

        const parts = ["✓ Script already generated"];
        if (savedFindings.length > 0) parts.push(`⚠ ${savedFindings.length} fact-check issue${savedFindings.length === 1 ? "" : "s"}`);
        else if ((script as any).status === "FACT_CHECKED") parts.push("✓ facts verified");
        if (totalChunks > 0) parts.push(`✓ ${totalChunks} chunks saved`);
        else parts.push("• chunks not yet generated");
        if (totalChunks > 0) {
          if (audioDone === totalChunks) parts.push(`✓ all ${audioDone} audio ready`);
          else if (audioDone > 0) parts.push(`• audio ${audioDone}/${totalChunks}`);
          else parts.push("• audio not yet generated");
        }

        toast.info(parts.join("  |  "), { duration: 6000 });
      } else {
        setExistingScriptId(null);
        setIsExistingScript(false);
        setScriptText("");
        setFactFindings([]);
        setFactCheckRan(false);
      }


    } catch (err) {
      console.error("Error checking for existing script:", err);
    }
    
    // Combine outline and summary points for the Topic/Outline box
    const outline = idea.video_outline;
    const summaryArr = Array.isArray(idea.summary_points) ? idea.summary_points : [];
    const summary = summaryArr.map((p: string) => `• ${p}`).join("\n");
    const hooksArr = Array.isArray(idea.core_hooks) ? idea.core_hooks : [];
    const hooks = hooksArr.map((h: string) => `Hook: ${h}`).join("\n");
    
    const combinedContent = `TITLE: ${idea.proposed_title}\n\nOUTLINE:\n${outline?.hook || ""}\n${outline?.intro || ""}\n${outline?.body || ""}\n\nSUMMARY POINTS:\n${summary}\n\nCORE HOOKS:\n${hooks}`;
    
    setChapterContext(combinedContent);
    // Switch to PDF/Idea mode which uses chapterContext + content
    if (idea.original_summary) {
      setContent(idea.original_summary);
    }
  };

  const handleSaveScript = async () => {
    if (!scriptText.trim()) return;
    setIsSaving(true);
    try {
      const fullScript = scriptText;
      
      
      if (isFromHistory && selectedHistoryScriptId) {
        await updateScriptFn({ 
          data: {
            id: selectedHistoryScriptId,
            content: fullScript,
          } 
        });
        toast.success("Script updated successfully!");
        queryClient.invalidateQueries({ queryKey: ["recent-scripts"] }); queryClient.invalidateQueries({ queryKey: ["priority-ideas-recent-15"] });
      } else {
        await saveScriptFn({ 
          data: {
            idea_id: selectedIdeaId || undefined,
            title: topic || "Untitled Script",
            content: fullScript,
            word_count: wordCount,
            video_type: videoType,
            model: model,
          } 
        });

        // Update idea status to Script Done when script is saved
        if (selectedIdeaId) {
          await supabase
            .from("raw_content")
            .update({ status: "Script Done" })
            .eq("id", selectedIdeaId);
          
          toast.success("Script saved and shifted to script_Done phase!");
        } else {
          toast.success("Script saved to database!");
        }
        queryClient.invalidateQueries({ queryKey: ["recent-scripts"] }); queryClient.invalidateQueries({ queryKey: ["priority-ideas-recent-15"] });
      }
    } catch (err: any) {
      toast.error("Failed to save script: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const { data: recentScriptsData } = useQuery({
    queryKey: ["recent-scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return { scripts: data || [] };
    },
    enabled: showHistory,
  });

  const recentScripts = (recentScriptsData?.scripts || []) as any[];

  const handleHistorySelect = (scriptId: string) => {
    const script = recentScripts.find(s => s.id === scriptId);
    if (!script) return;

    setSelectedHistoryScriptId(scriptId);
    setTopic(script.title);
    setIsFromHistory(true);

    setScriptText(script.content || "");

    // Hydrate fact-check findings stored by async generator (wrong-statements
    // preview only — never re-render the full script as findings).
    const savedFindings: FactFinding[] = Array.isArray((script as any).fact_check_findings)
      ? (script as any).fact_check_findings
      : [];
    setFactFindings(savedFindings);
    setFactCheckRan(savedFindings.length > 0 || (script as any).status === "FACT_CHECKED");
    setFactCheckedAgainst(script.content || "");

    if (savedFindings.length > 0) {
      toast.info(`Loaded script + ${savedFindings.length} fact-check issue${savedFindings.length === 1 ? "" : "s"}`);
    } else {
      toast.info("Loaded script from history");
    }
  };


  const handleGenerate = async () => {
    if (!topic && inputMode === "topic") {
      toast.error("Please enter a topic");
      return;
    }
    if (!content && (inputMode === "transcript" || inputMode === "pdf")) {
      toast.error(`Please enter the ${inputMode} content`);
      return;
    }

    setIsGenerating(true);
    setIsFromHistory(false);
    setSelectedHistoryScriptId("");
    setScriptText("");
    setFactFindings([]);
    setFactCheckRan(false);
    try {
      // Stream tokens live (Gemini-chat style) via SSE from our edge function.
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || SUPABASE_KEY;

      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-script-stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            topic,
            content,
            chapterContext,
            videoType,
            inputMode,
            wordCount,
            specialInstructions,
            model,
            idea_id: selectedIdeaId || null,
            title: topic || "Untitled Script",
          }),
        },
      );

      if (!resp.ok || !resp.body) {
        const errTxt = await resp.text().catch(() => "");
        throw new Error(`Stream start failed (${resp.status}): ${errTxt.slice(0, 300)}`);
      }

      toast.info("Generating live…");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let scriptId: string | null = null;
      let accumulated = "";
      let streamDone = false;

      while (!streamDone) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events separated by blank line
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          const lines = evt.split("\n");
          let eventName = "message";
          let dataStr = "";
          for (const ln of lines) {
            if (ln.startsWith("event:")) eventName = ln.slice(6).trim();
            else if (ln.startsWith("data:")) dataStr += ln.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr);
            if (eventName === "meta") {
              scriptId = payload.script_id;
              if (scriptId) {
                setExistingScriptId(scriptId);
                setIsExistingScript(true);
              }
            } else if (eventName === "token") {
              accumulated += payload.t || "";
              setScriptText(accumulated);
            } else if (eventName === "done") {
              streamDone = true;
            } else if (eventName === "error") {
              throw new Error(payload.message || "stream error");
            }
          } catch (e) {
            if (eventName === "error") throw e;
            // ignore parse errors on partial chunks
          }
        }
      }

      // Final cleanup of any stray ```json envelope.
      let finalText = accumulated.trim();
      finalText = finalText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      try {
        const obj = JSON.parse(finalText);
        if (typeof obj?.script === "string") finalText = obj.script.trim();
      } catch (_) {}
      setScriptText(finalText);
      setFactCheckedAgainst(finalText);

      if (selectedIdeaId) {
        await supabase
          .from("raw_content")
          .update({ status: "Script Done" })
          .eq("id", selectedIdeaId);
      }
      queryClient.invalidateQueries({ queryKey: ["recent-scripts"] }); queryClient.invalidateQueries({ queryKey: ["priority-ideas-recent-15"] });
      toast.success("Script generated ✓ — fact-checking in background…");

      // Poll for fact-check completion (runs in background on the server).
      if (scriptId) {
        setIsFactChecking(true);
        const deadline = Date.now() + 3 * 60 * 1000;
        (async () => {
          try {
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 4000));
              const { data: row } = await supabase
                .from("scripts")
                .select("status, fact_check_findings")
                .eq("id", scriptId!)
                .single();
              if (
                row?.status === "FACT_CHECKED" ||
                row?.status === "FACT_CHECK_FAILED"
              ) {
                const fcf: any = row.fact_check_findings;
                const findings: FactFinding[] = Array.isArray(fcf?.findings)
                  ? fcf.findings
                  : Array.isArray(fcf)
                    ? fcf
                    : [];
                setFactFindings(findings);
                setFactCheckRan(true);
                toast.info(
                  findings.length === 0
                    ? "Fact-check: no issues ✓"
                    : `Fact-check: ${findings.length} issue(s) flagged`,
                );
                break;
              }
            }
          } finally {
            setIsFactChecking(false);
          }
        })();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate script");
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.md,.json,.txt"
        className="hidden"
        id="pdf-upload-hidden"
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 md:mb-6">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
            <StickyNote className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[9px] md:text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 1</span>
              <span className="text-[9px] md:text-[10px] text-slate-400 font-medium tracking-wider">• sky academy DNA v4.1</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Script Generation</h1>
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
            {showHistory ? "Hide History" : "View History"}
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] md:text-xs font-bold border border-emerald-100 whitespace-nowrap">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            DNA Active
          </div>
        </div>
      </div>

      {showHistory && (
        <Card className="mb-6 bg-indigo-50/50 border-indigo-100">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="history-select" className="text-xs font-bold text-indigo-600 mb-1 block uppercase">Recent 10 Scripts</Label>
              <select
                id="history-select"
                className="w-full border border-indigo-200 rounded-md p-2 text-sm bg-white"
                value={selectedHistoryScriptId}
                onChange={(e) => handleHistorySelect(e.target.value)}
              >
                <option value="">-- Select a script from history --</option>
                {recentScripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.title} ({new Date(script.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="mt-5 text-indigo-400 hover:text-indigo-600"
              onClick={() => setShowHistory(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Script Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <select
                      className="w-full border rounded-md p-2 text-sm"
                      value={provider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        setProvider(newProvider);
                        if (newProvider === "lovable-gemini") {
                          setModel("google/gemini-3.1-pro-preview");
                        } else if (newProvider === "anthropic") {
                          setModel("claude-sonnet-4-5");
                        } else if (newProvider === "poe") {
                          setModel("claude-3-5-sonnet");
                        } else if (newProvider === "google") {
                          setModel("gemini-1.5-pro");
                        } else if (newProvider === "openai") {
                          setModel("gpt-4o");
                        }
                      }}
                    >
                      <option value="lovable-gemini">Sky Studio Gemini</option>
                      <option value="anthropic">Claude (Anthropic)</option>
                      <option value="poe">Poe.com (Multi-Model)</option>
                      <option value="openai">OpenAI (GPT)</option>
                      <option value="google">Google (External Gemini)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <select
                      className="w-full border rounded-md p-2 text-sm"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    >
                      {provider === "lovable-gemini" ? (
                        <>
                          <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro (Most Capable)</option>
                          <option value="google/gemini-3.5-flash">Gemini 3.5 Flash (Fastest)</option>
                        </>
                      ) : provider === "anthropic" ? (
                        <>
                          <optgroup label="Claude 4.x (Latest)">
                            <option value="claude-sonnet-4-5">Claude Sonnet 4.5 (Recommended)</option>
                            <option value="claude-opus-4-1">Claude Opus 4.1 (Most Capable)</option>
                            <option value="claude-opus-4">Claude Opus 4</option>
                            <option value="claude-sonnet-4">Claude Sonnet 4</option>
                          </optgroup>
                          <optgroup label="Claude 3.x">
                            <option value="claude-3-7-sonnet">Claude 3.7 Sonnet</option>
                            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                            <option value="claude-3-5-haiku">Claude 3.5 Haiku (Fastest)</option>
                            <option value="claude-3-opus">Claude 3 Opus</option>
                          </optgroup>
                        </>
                      ) : provider === "poe" ? (
                        <>
                          <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                          <option value="claude-3-opus">Claude 3 Opus</option>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        </>
                      ) : provider === "google" ? (
                        <>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        </>
                      ) : (
                        <>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                        </>
                      )}
                    </select>
                  </div>

                </div>
              </div>

              <div className="space-y-3">
                <Label>Video Type</Label>
                <RadioGroup 
                  value={videoType} 
                  onValueChange={(v: any) => setVideoType(v)}
                  className="grid grid-cols-2 gap-4"
                >
                  <div
                    className={cn(
                      "flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors",
                      videoType === "subjective"
                        ? "bg-orange-50 border-orange-300 hover:bg-orange-100"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <RadioGroupItem value="subjective" id="subjective" />
                    <Label htmlFor="subjective" className="flex-1 cursor-pointer">
                      <div className={cn("font-semibold text-sm", videoType === "subjective" && "text-orange-700")}>Subjective</div>
                      <div className={cn("text-[10px] uppercase", videoType === "subjective" ? "text-orange-500" : "text-muted-foreground")}>Deep Teaching</div>
                    </Label>
                  </div>
                  <div
                    className={cn(
                      "flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors",
                      videoType === "general"
                        ? "bg-teal-50 border-teal-300 hover:bg-teal-100"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <RadioGroupItem value="general" id="general" />
                    <Label htmlFor="general" className="flex-1 cursor-pointer">
                      <div className={cn("font-semibold text-sm", videoType === "general" && "text-teal-700")}>General</div>
                      <div className={cn("text-[10px] uppercase", videoType === "general" ? "text-teal-600" : "text-muted-foreground")}>Motivation / Strategy</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3 pt-2">
                <Label>Input Mode</Label>
                <RadioGroup 
                  value={inputMode} 
                  onValueChange={(v: any) => setInputMode(v)}
                  className="space-y-2"
                >
                  <div
                    className={cn(
                      "flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors",
                      inputMode === "idea"
                        ? "bg-emerald-50 border-emerald-300 hover:bg-emerald-100"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setInputMode("idea")}
                  >
                    <RadioGroupItem value="idea" id="mode-idea" />
                    <Label htmlFor="mode-idea" className="flex-1 cursor-pointer">
                      <div className={cn("font-semibold text-sm", inputMode === "idea" && "text-emerald-700")}>Priority List</div>
                      <div className={cn("text-[10px] uppercase", inputMode === "idea" ? "text-emerald-600" : "text-muted-foreground")}>Marked from Idea Cards</div>
                    </Label>
                  </div>
                  <div
                    className={cn(
                      "flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors",
                      inputMode === "topic"
                        ? "bg-amber-50 border-amber-300 hover:bg-amber-100"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setInputMode("topic")}
                  >
                    <RadioGroupItem value="topic" id="mode-topic" />
                    <Label htmlFor="mode-topic" className="flex-1 cursor-pointer">
                      <div className={cn("font-semibold text-sm", inputMode === "topic" && "text-amber-700")}>Topic Name</div>
                      <div className={cn("text-[10px] uppercase", inputMode === "topic" ? "text-amber-600" : "text-muted-foreground")}>Generate from scratch</div>
                    </Label>
                  </div>
                  <div
                    className={cn(
                      "flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors",
                      inputMode === "transcript"
                        ? "bg-sky-50 border-sky-300 hover:bg-sky-100"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setInputMode("transcript")}
                  >
                    <RadioGroupItem value="transcript" id="mode-transcript" />
                    <Label htmlFor="mode-transcript" className="flex-1 cursor-pointer">
                      <div className={cn("font-semibold text-sm", inputMode === "transcript" && "text-sky-700")}>Competitor Transcripts</div>
                      <div className={cn("text-[10px] uppercase", inputMode === "transcript" ? "text-sky-600" : "text-muted-foreground")}>Reference from transcript</div>
                    </Label>
                  </div>
                  <div
                    className={cn(
                      "flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors",
                      inputMode === "pdf"
                        ? "bg-violet-50 border-violet-300 hover:bg-violet-100"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setInputMode("pdf")}
                  >
                    <RadioGroupItem value="pdf" id="mode-pdf" />
                    <Label htmlFor="mode-pdf" className="flex-1 cursor-pointer">
                      <div className={cn("font-semibold text-sm", inputMode === "pdf" && "text-violet-700")}>Book / PDF Section</div>
                      <div className={cn("text-[10px] uppercase", inputMode === "pdf" ? "text-violet-600" : "text-muted-foreground")}>Convert to SKY Style</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {inputMode === "idea" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="idea-select">Select Priority Idea</Label>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Last 15 priority topics · ✓ = script ready
                    </span>
                  </div>
                  <select
                    id="idea-select"
                    className="w-full border rounded-md p-2 text-sm bg-white"
                    value={selectedIdeaId}
                    onChange={(e) => handleIdeaSelect(e.target.value)}
                  >
                    <option value="">-- Choose an idea --</option>
                    {approvedIdeas.map((idea) => {
                      const hasScript = !!scriptMap[idea.id];
                      const marker = hasScript ? "✓" : "○";
                      const title = idea.proposed_title || idea.original_title;
                      return (
                        <option key={idea.id} value={idea.id}>
                          {marker} {title} {hasScript ? "— script ready" : "— no script yet"}
                        </option>
                      );
                    })}
                  </select>
                  {selectedIdeaId && scriptMap[selectedIdeaId] && (
                    <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5 font-medium">
                      ✓ This topic already has a saved script. Edit it in the preview, or click <b>Regenerate</b> for a fresh version with current settings.
                    </div>
                  )}
                </div>
              )}



              {inputMode === "pdf" && (
                <div className="space-y-4">
                  <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
                    <p className="text-green-800 text-sm font-medium">
                      PDF Mode -- Upload a book chapter or study notes PDF. SKY Engine transforms it into Telugu lipi voiceover.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="chapterContext">Topic / Chapter context (optional)</Label>
                    <Input
                      id="chapterContext"
                      placeholder="e.g. Chapter 3: Directive Principles..."
                      value={chapterContext}
                      onChange={(e) => setChapterContext(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pdf-upload-hidden" className="cursor-pointer">UPLOAD SOURCE FILE (PDF, MD, JSON)</Label>
                    {/* Hidden input removed from here and moved to component root */}
                    <div className="border-2 border-dashed rounded-lg p-6 bg-slate-50 flex flex-col items-center justify-center space-y-3">
                      {fileName ? (
                        <div className="flex flex-col w-full space-y-3">
                          <div className="flex items-center justify-between w-full bg-white p-3 rounded-md border">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-5 w-5 text-blue-600" />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium truncate max-w-[150px]">{fileName}</span>
                                <span className="text-[10px] text-green-600 flex items-center">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Ready for generation
                                </span>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive"
                              onClick={removeFile}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {content && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase">Content Preview (First 500 chars)</Label>
                              <div className="p-3 bg-white border rounded-md text-[11px] font-mono whitespace-pre-wrap max-h-[100px] overflow-y-auto">
                                {content.substring(0, 500)}
                                {content.length > 500 ? "..." : ""}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center space-x-4">
                          <Button 
                            variant="default" 
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={(e) => {
                              e.preventDefault();
                              console.log("Upload button clicked, triggering file input:", fileInputRef.current);
                              if (fileInputRef.current) {
                                fileInputRef.current.click();
                              } else {
                                // Fallback using DOM ID
                                document.getElementById('pdf-upload-hidden')?.click();
                              }
                            }}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="mr-2 h-4 w-4" />
                            )}
                            Select File
                          </Button>
                          <span className="text-xs text-muted-foreground">200MB per file • PDF, MD, JSON</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {inputMode === "topic" && (
                <div className="space-y-2">
                  <Label htmlFor="topic">Topic / Subject *</Label>
                  <Textarea
                    id="topic"
                    placeholder="e.g. Panchayati Raj – 73rd Amendment"
                    className="min-h-[100px]"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
              )}

              {inputMode === "transcript" && (
                <div className="space-y-2">
                  <Label htmlFor="content">Competitor Transcript *</Label>
                  <Textarea
                    id="content"
                    placeholder="Paste the transcript here..."
                    className="min-h-[150px]"
                    value={content}
                    onChange={(setContent as any)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="wordCount">Approximate Total Script Words</Label>
                <Input
                  id="wordCount"
                  type="number"
                  value={wordCount}
                  onChange={(e) => setWordCount(parseInt(e.target.value))}
                  min={150}
                  step={165}
                />
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest pt-1">
                  ~{Math.ceil(wordCount / 165)} segments · 150-180w each
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructions">Special Instructions (optional)</Label>
                <Textarea
                  id="instructions"
                  placeholder="Focus on memory tricks..."
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                />
              </div>

              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 h-12" 
                onClick={() => {
                  if (isExistingScript) setRegenConfirmOpen(true);
                  else handleGenerate();
                }}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Script...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    {isExistingScript ? "Regenerate Script" : "Generate Script"}
                  </>
                )}
              </Button>

              {isExistingScript && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center gap-3 mt-6">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-indigo-900 font-bold">Previous version found</p>
                    <p className="text-[10px] text-indigo-600 font-medium">This script was already generated and is saved in your pipeline.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] font-bold bg-white"
                    onClick={() => setRegenConfirmOpen(true)}
                    disabled={isGenerating}
                  >
                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    Regenerate
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="min-h-[600px] flex flex-col">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b py-4">
              <div className="flex items-center flex-wrap gap-2">
                <CardTitle className="text-lg">Script Preview</CardTitle>
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-700 border-blue-500/20 font-bold tabular-nums"
                  title="Live word and character count of the generated script"
                >
                  {liveWordCount.toLocaleString()} words · {liveCharCount.toLocaleString()} chars
                </Badge>
                {scriptText && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "border font-bold tabular-nums",
                      Math.abs(liveWordCount - wordCount) <= 50
                        ? "bg-green-500/10 text-green-700 border-green-500/20"
                        : "bg-amber-500/10 text-amber-700 border-amber-500/20",
                    )}
                    title={`Target ${wordCount} ± 50 words`}
                  >
                    target {wordCount} · diff {liveWordCount - wordCount >= 0 ? "+" : ""}{liveWordCount - wordCount}
                  </Badge>
                )}
              </div>
              {scriptText && (
                <div className="flex items-center flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEnhanceScript}
                    disabled={isEnhancing || isGenerating}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    {isEnhancing ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    Script Enhancer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRegenConfirmOpen(true)}
                    disabled={isGenerating}
                  >
                    <RotateCcw className={cn("w-4 h-4 mr-1", isGenerating && "animate-spin")} />
                    Regenerate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFactCheck}
                    disabled={isFactChecking}
                    className="border-purple-300 text-purple-700 hover:bg-purple-50"
                  >
                    {isFactChecking ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 mr-1" />
                    )}
                    Fact Check
                  </Button>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-500 uppercase tracking-tight italic">
                    {isSaving ? (
                      <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving...</>
                    ) : (
                      <>✓ Autosaved</>
                    )}
                  </div>
                </div>

              )}
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {scriptText ? (
                <div className="p-6 space-y-4 h-full">
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-xl text-slate-900">Entire Production Script</h3>
                  </div>
                  <Textarea
                    className="p-6 bg-white rounded-2xl border border-slate-200 leading-relaxed text-lg font-telugu min-h-[500px] whitespace-pre-wrap text-slate-800 focus:ring-2 focus:ring-blue-500"
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    placeholder="Enter or edit your script here..."
                  />

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <Wand2 className="w-8 h-8 opacity-20" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">No script generated yet</p>
                    <p className="text-sm">Configure your topic and settings on the left to start generating content.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fact-Checking AI panel */}
          {scriptText && (factCheckRan || isFactChecking || factFindings.length > 0) && (
            <Card className="border-purple-200">
              <CardHeader className="border-b py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className="w-5 h-5 text-purple-600" />
                  <CardTitle className="text-lg">Fact-Check Findings</CardTitle>
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-bold">
                    {isFactChecking ? "scanning…" : `${factFindings.length} issue${factFindings.length === 1 ? "" : "s"}`}
                  </Badge>
                  {scriptText !== factCheckedAgainst && factCheckRan && !isFactChecking && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      script edited — re-run
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleFactCheck} disabled={isFactChecking}>
                    {isFactChecking ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Re-check
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6 space-y-4">
                {isFactChecking && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Researching facts against authoritative sources…
                  </div>
                )}

                {!isFactChecking && factCheckRan && factFindings.length === 0 && (
                  <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-semibold">All facts verified. Nothing to correct.</span>
                  </div>
                )}

                {factFindings.map((f, idx) => (
                  <div key={idx} className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <AlertTriangle className={cn(
                          "w-4 h-4",
                          f.severity === "high" ? "text-red-600" : f.severity === "medium" ? "text-amber-600" : "text-yellow-600",
                        )} />
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          {f.severity || "issue"} · {f.source}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeFinding(idx)} className="h-7 px-2 text-slate-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-600">Claim in script</Label>
                      <div className="mt-1 p-3 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 italic">
                        “{f.claim}”
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-600">Issue</Label>
                      <Textarea
                        className="mt-1 min-h-[60px] text-sm"
                        value={f.issue}
                        onChange={(e) => updateFinding(idx, { issue: e.target.value })}
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-green-700">Correction (editable — this is what will be merged)</Label>
                      <Textarea
                        className="mt-1 min-h-[70px] text-sm border-green-300 focus-visible:ring-green-400"
                        value={f.correction}
                        onChange={(e) => updateFinding(idx, { correction: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Source</Label>
                        <Input
                          className="mt-1 text-sm"
                          value={f.source}
                          onChange={(e) => updateFinding(idx, { source: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {factFindings.length > 0 && (
                  <div className="pt-2 border-t flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Approving will merge ONLY these corrections into the script, preserving original tone & style. Original is otherwise untouched.
                    </p>
                    <Button
                      onClick={handleApproveFacts}
                      disabled={isApplyingFacts}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold"
                    >
                      {isApplyingFacts ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Facts Approved — Merge into Script
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate script?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the existing script for this topic with a fresh
              generation using the current word count, special instructions, and
              model settings. The previous version will be overwritten.
              <br /><br />
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRegenConfirmOpen(false);
                handleGenerate();
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ScriptGenerator;