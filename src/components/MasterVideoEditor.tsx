import React, { useState, useRef, useEffect } from "react";
import { 
  Play, Pause, SkipBack, SkipForward, Scissors, MousePointer2, 
  ZoomIn, ZoomOut, Upload, Plus, Save, Trash2, Type, 
  Image as ImageIcon, Film, ChevronLeft, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TrackItem {
  id: string;
  type: 'video' | 'image' | 'text';
  start: number; // in seconds
  duration: number;
  content: string; // URL or text
  layer: number;
  metadata?: any;
}

interface MasterVideoEditorProps {
  videoUrl: string;
  title: string;
  onSave?: (data: any) => void;
  onBack?: () => void;
}

export function MasterVideoEditor({ videoUrl, title, onSave, onBack }: MasterVideoEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(10); // pixels per second
  const [tool, setTool] = useState<'select' | 'razor'>('select');
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [footerText, setFooterText] = useState("");
  const [footerBg, setFooterBg] = useState("#00000088");
  const [recentFooters, setRecentFooters] = useState<string[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onLoadedMetadata = () => {
      setDuration(v.duration);
      // Initialize with the main video track
      if (tracks.length === 0) {
        setTracks([{
          id: 'main-video',
          type: 'video',
          start: 0,
          duration: v.duration,
          content: videoUrl,
          layer: 0
        }]);
      }
    };

    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [videoUrl]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (val: number[]) => {
    const time = val[0];
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const time = x / zoom;
    if (videoRef.current) videoRef.current.currentTime = Math.min(time, duration);
  };

  const addAsset = (type: 'image' | 'video', url: string) => {
    const newItem: TrackItem = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      start: currentTime,
      duration: 5, // default 5s for images
      content: url,
      layer: tracks.length + 1
    };
    setTracks([...tracks, newItem]);
    toast.success(`Added ${type} to timeline`);
  };

  const handleSave = () => {
    const data = {
      title,
      tracks,
      footer: { text: footerText, background: footerBg },
      exportDate: new Date().toISOString()
    };
    if (onSave) onSave(data);
    toast.success("Project saved successfully");
    if (footerText && !recentFooters.includes(footerText)) {
      setRecentFooters([footerText, ...recentFooters].slice(0, 5));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/5 bg-[#111114]">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Master Editor</span>
            <h1 className="text-sm font-bold truncate max-w-[300px]">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/5 h-9" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" /> Save Project
          </Button>
          <Button size="sm" className="rounded-xl bg-indigo-600 hover:bg-indigo-700 h-9">
            <Download className="h-4 w-4 mr-2" /> Export MP4
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Assets & Tools */}
        <div className="w-80 border-r border-white/5 bg-[#111114] flex flex-col">
          <Tabs defaultValue="assets" className="flex flex-col h-full">
            <TabsList className="grid grid-cols-2 bg-transparent border-b border-white/5 rounded-none h-12">
              <TabsTrigger value="assets" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-indigo-400 rounded-none">Assets</TabsTrigger>
              <TabsTrigger value="footer" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-indigo-400 rounded-none">Footer</TabsTrigger>
            </TabsList>
            
            <TabsContent value="assets" className="flex-1 m-0 p-4 space-y-4 overflow-hidden flex flex-col">
              <div className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center hover:bg-white/5 transition-colors cursor-pointer group">
                <Upload className="h-8 w-8 mx-auto mb-2 text-slate-500 group-hover:text-indigo-400" />
                <p className="text-xs font-medium text-slate-400">Drag & Drop or Click to Upload</p>
                <p className="text-[10px] text-slate-600 mt-1">MP4, PNG, JPG supported</p>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Gallery</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="aspect-video bg-white/5 rounded-lg overflow-hidden border border-white/5 relative group cursor-pointer hover:border-indigo-500/50">
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/60 transition-opacity">
                          <Plus className="h-6 w-6 text-white" onClick={() => addAsset('image', `https://picsum.photos/seed/${i}/400/225`)} />
                        </div>
                        <img src={`https://picsum.photos/seed/${i}/400/225`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="footer" className="flex-1 m-0 p-4 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Footer Text</label>
                <textarea 
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Enter text to overlay..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 h-24 resize-none"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Background Color</label>
                <div className="flex gap-2">
                  {['#00000088', '#1a1a1aee', '#312e81aa', '#991b1baa'].map(color => (
                    <button 
                      key={color} 
                      className={cn("w-8 h-8 rounded-full border-2 transition-transform", footerBg === color ? "border-white scale-110" : "border-transparent")}
                      style={{ backgroundColor: color }}
                      onClick={() => setFooterBg(color)}
                    />
                  ))}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center cursor-pointer">
                    <Plus className="h-4 w-4" />
                  </div>
                </div>
              </div>

              {recentFooters.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recent Footers</label>
                  <div className="space-y-2">
                    {recentFooters.map((f, i) => (
                      <button 
                        key={i} 
                        onClick={() => setFooterText(f)}
                        className="w-full text-left text-xs bg-white/5 hover:bg-white/10 p-2 rounded-lg border border-white/5 truncate"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Content: Player & Timeline */}
        <div className="flex-1 flex flex-col bg-black">
          {/* Player Area */}
          <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden min-h-0">
            <div className="relative aspect-video h-full max-h-full max-w-full bg-[#111114] shadow-2xl rounded-lg overflow-hidden border border-white/5">
              <video 
                ref={videoRef}
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain bg-black"
              />
              
              {/* Overlay Preview */}
              {footerText && (
                <div 
                  className="absolute bottom-10 left-0 right-0 p-4 text-center text-white font-bold text-2xl"
                  style={{ backgroundColor: footerBg }}
                >
                  {footerText}
                </div>
              )}
            </div>
          </div>

          {/* Timeline Section */}
          <div className="h-80 bg-[#111114] border-t border-white/5 flex flex-col">
            {/* Toolbar */}
            <div className="h-12 border-b border-white/5 px-4 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button 
                  variant={tool === 'select' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setTool('select')}
                  className="rounded-lg h-9 w-9 p-0"
                >
                  <MousePointer2 className="h-4 w-4" />
                </Button>
                <Button 
                  variant={tool === 'razor' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setTool('razor')}
                  className="rounded-lg h-9 w-9 p-0"
                >
                  <Scissors className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-white/10 mx-2" />
                <Button variant="ghost" size="sm" className="rounded-lg h-9 w-9 p-0 text-slate-400 hover:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => videoRef.current && (videoRef.current.currentTime -= 5)}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={togglePlay}
                    className="h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => videoRef.current && (videoRef.current.currentTime += 5)}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-sm font-mono text-indigo-400 w-32 text-center bg-black/40 py-1 rounded-lg border border-white/5">
                  {formatTime(currentTime)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ZoomOut className="h-4 w-4 text-slate-500" />
                <Slider 
                  value={[zoom]} 
                  onValueChange={(val) => setZoom(val[0])} 
                  min={1} 
                  max={100} 
                  step={1}
                  className="w-32" 
                />
                <ZoomIn className="h-4 w-4 text-slate-500" />
              </div>
            </div>

            {/* Tracks */}
            <ScrollArea className="flex-1">
              <div 
                ref={timelineRef}
                className="relative min-h-full p-4 select-none"
                style={{ width: `${duration * zoom + 100}px` }}
                onClick={handleTimelineClick}
              >
                {/* Time indicators */}
                <div className="h-6 border-b border-white/5 flex items-end mb-4 pointer-events-none">
                  {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                    <div 
                      key={i} 
                      className="absolute border-l border-white/10 h-2 flex flex-col justify-end"
                      style={{ left: `${i * zoom + 16}px` }}
                    >
                      {i % 5 === 0 && (
                        <span className="text-[8px] text-slate-500 -ml-2 mb-2">{i}s</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Track Layers */}
                <div className="space-y-2">
                  {[0, 1, 2].map(layerIndex => (
                    <div key={layerIndex} className="h-12 bg-white/5 rounded-lg border border-white/5 relative">
                      {tracks.filter(t => t.layer === layerIndex).map(item => (
                        <div
                          key={item.id}
                          className={cn(
                            "absolute top-1 bottom-1 rounded-md border flex items-center px-2 text-[10px] font-medium transition-all cursor-move",
                            selectedItemId === item.id 
                              ? "bg-indigo-500/40 border-indigo-400 z-10 shadow-lg shadow-indigo-500/20" 
                              : "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                          )}
                          style={{
                            left: `${item.start * zoom}px`,
                            width: `${item.duration * zoom}px`
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItemId(item.id);
                          }}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {item.type === 'video' ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                            <span className="truncate">{item.type === 'video' ? 'Main Sequence' : `Asset ${item.id.slice(0, 4)}`}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Playhead */}
                <div 
                  className="absolute top-0 bottom-0 w-px bg-rose-500 z-20 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                  style={{ left: `${currentTime * zoom + 16}px` }}
                >
                  <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-rose-500 rounded-full border-2 border-white" />
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
