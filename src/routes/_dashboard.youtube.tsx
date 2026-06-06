import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Youtube, 
  Copy, 
  Wand2, 
  Save, 
  Image as ImageIcon, 
  Type, 
  Search, 
  FileText, 
  RefreshCcw, 
  Download,
  Plus,
  Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getYoutubeSeo, saveYoutubeSeo } from "@/lib/engine.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/youtube")({
  component: YoutubeSeoPage,
});

const FIXED_TAGS = ["sky academy", "appsc", "tspsc", "upsc", "ssc", "rrb", "ias"];

function YoutubeSeoPage() {
  const getSeoFn = useServerFn(getYoutubeSeo);
  const saveSeoFn = useServerFn(saveYoutubeSeo);
  const queryClient = useQueryClient();

  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("seo");
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isGeneratingLines, setIsGeneratingLines] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // SEO State
  const [titles, setTitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [tags, setTags] = useState<string[]>(FIXED_TAGS);
  const [description, setDescription] = useState("");

  // Thumbnail State
  const [thumbnailMode, setThumbnailMode] = useState<"generate" | "upload">("generate");
  const [thumbnailLines, setThumbnailLines] = useState({
    line1: "",
    line2: "",
    line3: "",
    line4: ""
  });
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailModel, setThumbnailModel] = useState("openai/gpt-image-2");

  const { data: scriptsData } = useQuery({
    queryKey: ["done-scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id, title, content")
        .eq("status", "SCRIPT_DONE")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: seoData } = useQuery({
    queryKey: ["youtube-seo", selectedScriptId],
    queryFn: () => getSeoFn({ data: { script_id: selectedScriptId } }),
    enabled: !!selectedScriptId
  });

  useEffect(() => {
    if (seoData?.seo) {
      const seo = seoData.seo;
      setTitles(seo.title_variations || []);
      setSelectedTitle(seo.selected_title || "");
      setTags(seo.tags || FIXED_TAGS);
      setDescription(seo.description || "");
      if (seo.thumbnail_lines) {
        setThumbnailLines(seo.thumbnail_lines as any);
      }
      setThumbnailPrompt(seo.thumbnail_prompt || "");
      setThumbnailUrl(seo.thumbnail_url || "");
    } else {
      setTitles([]);
      setSelectedTitle("");
      setTags(FIXED_TAGS);
      setDescription("");
      setThumbnailLines({ line1: "", line2: "", line3: "", line4: "" });
      setThumbnailPrompt("");
      setThumbnailUrl("");
    }
  }, [seoData]);

  const selectedScript = scriptsData?.find(s => s.id === selectedScriptId);

  const handleGenerateSeo = async () => {
    if (!selectedScript) return;
    setIsGeneratingSeo(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-seo", {
        body: { action: "generate-seo", scriptContent: selectedScript.content }
      });
      if (error) throw error;
      
      setTitles(data.titles || []);
      setTags([...new Set([...FIXED_TAGS, ...(data.tags || [])])]);
      setDescription(data.description || "");
      toast.success("SEO Pack generated!");
    } catch (err: any) {
      toast.error("Failed to generate SEO: " + err.message);
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const handleGenerateLines = async () => {
    if (!selectedScript) return;
    setIsGeneratingLines(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-seo", {
        body: { action: "thumbnail-lines", scriptContent: selectedScript.content }
      });
      if (error) throw error;
      
      setThumbnailLines({
        line1: data.line1 || "",
        line2: data.line2 || "",
        line3: data.line3 || "",
        line4: data.line4 || ""
      });
      setThumbnailPrompt(data.dallePrompt || "");
      toast.success("Thumbnail lines and prompt generated!");
    } catch (err: any) {
      toast.error("Failed to generate lines: " + err.message);
    } finally {
      setIsGeneratingLines(false);
    }
  };

  const handleGenerateThumbnail = async () => {
    if (!thumbnailPrompt) return;
    setIsGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-seo", {
        body: { action: "thumbnail-image", prompt: thumbnailPrompt }
      });
      if (error) throw error;
      
      setThumbnailUrl(data.url);
      toast.success("Thumbnail generated successfully!");
    } catch (err: any) {
      toast.error("Failed to generate image: " + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSave = async () => {
    if (!selectedScriptId) return;
    setIsSaving(true);
    try {
      await saveSeoFn({
        data: {
          script_id: selectedScriptId,
          title_variations: titles,
          selected_title: selectedTitle,
          tags: tags,
          description: description,
          thumbnail_lines: thumbnailLines,
          thumbnail_prompt: thumbnailPrompt,
          thumbnail_url: thumbnailUrl
        }
      });
      toast.success("YouTube metadata saved!");
      queryClient.invalidateQueries({ queryKey: ["youtube-seo", selectedScriptId] });
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 4</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• DISTRIBUTION & SEO</span>
          </div>
          <h1 className="text-3xl font-bold text-white">YouTube Studio</h1>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="w-80">
            <Label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Select Finished Script</Label>
            <select 
              className="w-full h-11 bg-white border border-slate-200 rounded-2xl px-4 text-sm shadow-sm focus:ring-2 focus:ring-rose-500 transition-all outline-hidden"
              value={selectedScriptId}
              onChange={(e) => setSelectedScriptId(e.target.value)}
            >
              <option value="">-- Choose a script --</option>
              {scriptsData?.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={!selectedScriptId || isSaving}
            className="h-11 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg gap-2 mt-5"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {!selectedScriptId ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <Youtube className="h-8 w-8 text-rose-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Select a script to begin</h2>
            <p className="text-slate-500 max-w-sm">
              Choose a script from the dropdown above to generate SEO packs and thumbnails.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-100/50 p-1.5 rounded-3xl mb-8 w-fit border">
            <TabsTrigger value="seo" className="rounded-2xl px-8 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
              <Search className="h-4 w-4" />
              SEO Pack
            </TabsTrigger>
            <TabsTrigger value="thumbnail" className="rounded-2xl px-8 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
              <ImageIcon className="h-4 w-4" />
              Thumbnail
            </TabsTrigger>
          </TabsList>

          <TabsContent value="seo" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
                  <CardHeader className="border-b bg-slate-50/50 px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Type className="h-4 w-4 text-rose-500" />
                      Title Variations
                    </CardTitle>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="rounded-full h-8 px-3 gap-2"
                      onClick={handleGenerateSeo}
                      disabled={isGeneratingSeo}
                    >
                      <Wand2 className={cn("h-3 w-3", isGeneratingSeo && "animate-spin")} />
                      Generate
                    </Button>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {titles.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-4">No titles generated yet</p>
                    ) : (
                      titles.map((t, idx) => (
                        <div 
                          key={idx}
                          className={cn(
                            "group relative flex items-center gap-3 p-2 rounded-2xl border transition-all",
                            selectedTitle === t ? "border-rose-200 bg-rose-50/30 ring-1 ring-rose-100" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <div 
                            className="flex-none w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center cursor-pointer"
                            onClick={() => setSelectedTitle(t)}
                          >
                            {selectedTitle === t && <Check className="h-3 w-3 text-rose-500" />}
                          </div>
                          <Input 
                            value={t}
                            onChange={(e) => {
                              const newTitles = [...titles];
                              newTitles[idx] = e.target.value;
                              setTitles(newTitles);
                              if (selectedTitle === t) setSelectedTitle(e.target.value);
                            }}
                            className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm font-semibold text-slate-700 h-auto py-1 px-0"
                          />
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(t)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
                  <CardHeader className="border-b bg-slate-50/50 px-6 py-4">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Plus className="h-4 w-4 text-rose-500" />
                        Tags
                      </CardTitle>
                      <Badge variant="secondary" className="rounded-full bg-slate-200/50 text-slate-600 font-bold">
                        {tags.length} Tags
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Textarea 
                      value={tags.join(", ")}
                      onChange={(e) => setTags(e.target.value.split(",").map(t => t.trim()))}
                      className="min-h-[120px] rounded-2xl border-slate-200 bg-slate-50/30 resize-none text-sm leading-relaxed"
                      placeholder="Enter tags separated by commas..."
                    />
                    <div className="flex justify-between items-center pt-2">
                      <div className="flex gap-2 flex-wrap">
                        {FIXED_TAGS.map(t => (
                          <Badge key={t} variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500 text-[10px] px-2 py-0">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="rounded-full h-9 gap-2 text-slate-500"
                        onClick={() => copyToClipboard(tags.join(", "))}
                      >
                        <Copy className="h-4 w-4" />
                        Copy Tags
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden h-full">
                  <CardHeader className="border-b bg-slate-50/50 px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-rose-500" />
                      Video Description
                    </CardTitle>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="rounded-full h-9 gap-2 text-slate-500"
                      onClick={() => copyToClipboard(description)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Description
                    </Button>
                  </CardHeader>
                  <CardContent className="p-6 h-[calc(100%-60px)]">
                    <Textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="h-full min-h-[500px] rounded-2xl border-slate-200 bg-slate-50/30 resize-none text-sm leading-relaxed p-6"
                      placeholder="Generated description with timestamps and links will appear here..."
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="thumbnail" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card className="rounded-3xl border-slate-100 shadow-sm">
                  <CardHeader className="border-b border-white/5 bg-white/5 px-6 py-4">
                    <CardTitle className="text-sm font-bold">Thumbnail Creator</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="flex p-1 bg-white/5 rounded-2xl">
                      <button 
                        onClick={() => setThumbnailMode("generate")}
                        className={cn(
                          "flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all",
                          thumbnailMode === "generate" ? "bg-indigo-600 shadow-sm text-white" : "text-slate-400 hover:text-white"
                        )}
                      >
                        AI Generate
                      </button>
                      <button 
                        onClick={() => setThumbnailMode("upload")}
                        className={cn(
                          "flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all",
                          thumbnailMode === "upload" ? "bg-indigo-600 shadow-sm text-white" : "text-slate-400 hover:text-white"
                        )}
                      >
                        Upload Mode
                      </button>
                    </div>

                    {thumbnailMode === "generate" ? (
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase font-bold text-slate-400">Overlay Lines</Label>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="rounded-full h-8 px-3 gap-2"
                              onClick={handleGenerateLines}
                              disabled={isGeneratingLines}
                            >
                              <Wand2 className={cn("h-3 w-3", isGeneratingLines && "animate-spin")} />
                              Auto-Generate Lines
                            </Button>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <Label className="text-[10px] text-rose-500 font-bold">Line 1 — Target Audience</Label>
                              </div>
                              <Input 
                                value={thumbnailLines.line1}
                                onChange={(e) => setThumbnailLines({...thumbnailLines, line1: e.target.value})}
                                className="rounded-xl border-slate-200 bg-slate-50/30 text-rose-600 font-medium"
                                placeholder="e.g. SSC CGL 2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] text-amber-500 font-bold">Line 2 — Main Topic (CAPS)</Label>
                              <Input 
                                value={thumbnailLines.line2}
                                onChange={(e) => setThumbnailLines({...thumbnailLines, line2: e.target.value})}
                                className="rounded-xl border-slate-200 bg-slate-50/30 font-bold uppercase"
                                placeholder="e.g. COMPLETE STRATEGY"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] text-slate-500 font-bold">Line 3 — Supporting Info</Label>
                              <Input 
                                value={thumbnailLines.line3}
                                onChange={(e) => setThumbnailLines({...thumbnailLines, line3: e.target.value})}
                                className="rounded-xl border-slate-200 bg-slate-50/30 text-slate-600"
                                placeholder="e.g. Telugu Medium Roadmap"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] text-emerald-500 font-bold">Line 4 — Hook Line</Label>
                              <Input 
                                value={thumbnailLines.line4}
                                onChange={(e) => setThumbnailLines({...thumbnailLines, line4: e.target.value})}
                                className="rounded-xl border-slate-200 bg-slate-50/30 text-emerald-600 font-medium italic"
                                placeholder="e.g. Secret to Success"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase font-bold text-slate-400">DALL·E 3 Prompt</Label>
                            <span className="text-[10px] text-slate-400">{thumbnailPrompt.length}/4000</span>
                          </div>
                          <Textarea 
                            value={thumbnailPrompt}
                            onChange={(e) => setThumbnailPrompt(e.target.value.slice(0, 4000))}
                            className="min-h-[100px] rounded-2xl border-slate-200 bg-slate-50/30 resize-none text-xs"
                            placeholder="Visual prompt for AI image generation..."
                          />
                        </div>

                        <Button 
                          onClick={handleGenerateThumbnail} 
                          disabled={!thumbnailPrompt || isGeneratingImage}
                          className="w-full h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white gap-2 shadow-lg"
                        >
                          {isGeneratingImage ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                          {isGeneratingImage ? "Generating Visual..." : "Generate Thumbnail Image"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer group">
                          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border mb-4 group-hover:scale-110 transition-transform">
                            <Plus className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-sm font-bold text-slate-600">Click to upload image</p>
                          <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 10MB</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-3">
                <Card className="rounded-3xl border-slate-100 shadow-sm h-full overflow-hidden">
                  <CardHeader className="border-b bg-slate-50/50 px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold">Visual Preview</CardTitle>
                    {thumbnailUrl && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="rounded-full h-8 px-3 gap-2"
                          onClick={handleGenerateThumbnail}
                          disabled={isGeneratingImage}
                        >
                          <RefreshCcw className={cn("h-3 w-3", isGeneratingImage && "animate-spin")} />
                          Regenerate
                        </Button>
                        <Button 
                          size="sm" 
                          className="rounded-full h-8 px-3 gap-2 bg-slate-900 text-white"
                          onClick={() => window.open(thumbnailUrl, '_blank')}
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="relative aspect-video rounded-2xl bg-slate-100 overflow-hidden border shadow-inner flex flex-col items-center justify-center">
                      {thumbnailUrl ? (
                        <>
                          <img 
                            src={thumbnailUrl} 
                            alt="Generated Thumbnail" 
                            className="w-full h-full object-cover"
                          />
                          {/* Live Overlay Preview */}
                          <div className="absolute inset-0 p-8 flex flex-col justify-end text-white bg-linear-to-t from-black/60 to-transparent">
                            <div className="space-y-1">
                              <p className="text-xs font-bold uppercase tracking-wider text-rose-400">{thumbnailLines.line1}</p>
                              <h3 className="text-3xl font-black leading-tight drop-shadow-lg uppercase italic text-amber-400">{thumbnailLines.line2}</h3>
                              <p className="text-base font-bold text-slate-200">{thumbnailLines.line3}</p>
                              <p className="text-sm font-bold text-emerald-400 mt-2 bg-black/40 w-fit px-3 py-1 rounded-lg backdrop-blur-sm">{thumbnailLines.line4}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-center">
                          <ImageIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                          <p className="text-sm text-slate-400">Generate an image to see the preview</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Live Preview Overlay Details</h4>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Audience Label</p>
                          <p className="text-sm font-semibold text-rose-500">{thumbnailLines.line1 || "Not set"}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Main Headline</p>
                          <p className="text-sm font-black text-amber-500 uppercase italic">{thumbnailLines.line2 || "Not set"}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Subtitle</p>
                          <p className="text-sm font-semibold text-slate-600">{thumbnailLines.line3 || "Not set"}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Hook CTA</p>
                          <p className="text-sm font-bold text-emerald-600">{thumbnailLines.line4 || "Not set"}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}