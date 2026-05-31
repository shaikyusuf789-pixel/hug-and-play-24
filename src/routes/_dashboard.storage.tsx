import { createFileRoute } from "@tanstack/react-router";
import { Database, Folder, HardDrive, Search, MoreVertical, FileIcon, Download, Trash2, BrainCircuit, FileText, Layers, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_dashboard/storage")({
  component: StoragePage,
});

function StoragePage() {
  const files = [
    { id: 1, name: "DNA_Tutorial_Script.pdf", size: "1.2 MB", type: "PDF", date: "2h ago" },
    { id: 2, name: "Intro_Voiceover_Telugu.mp3", size: "4.5 MB", type: "MP3", date: "5h ago" },
    { id: 3, name: "Background_Visual_01.png", size: "8.1 MB", type: "PNG", date: "1d ago" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded uppercase tracking-[0.2em] border border-white/5 backdrop-blur-md">Asset Management</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">App Storage</h1>
          <p className="text-slate-400 mt-1 font-medium">Unified storage for all your generated content and raw assets.</p>
        </div>
        <div className="flex items-center gap-6 bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-2xl shadow-2xl">
           <div className="text-right">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usage</div>
              <div className="font-black text-white text-lg">4.2 GB / 50 GB</div>
           </div>
           <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
              <HardDrive className="h-7 w-7" />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <Input className="pl-12 h-14 bg-white/5 border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus-visible:ring-indigo-500" placeholder="Search cloud assets..." />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
               <div className="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <BrainCircuit className="h-6 w-6" />
               </div>
               <div>
                  <h2 className="text-xl font-black text-white">Neural Storage</h2>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">App Biography & Neural Scheme</p>
               </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               <Card className="bg-white/5 border-white/5 rounded-3xl p-6 hover:border-white/20 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Biography</span>
                     <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/5"><FileText className="h-4 w-4 text-slate-400" /></Button>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">SKY Studio Biography</h3>
                  <p className="text-sm text-slate-400 line-clamp-2">The complete identity and mission of the SKY Studio autonomous ecosystem.</p>
               </Card>
               <Card className="bg-white/5 border-white/5 rounded-3xl p-6 hover:border-white/20 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Neural Scheme</span>
                     <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/5"><Layers className="h-4 w-4 text-slate-400" /></Button>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Database Mapping</h3>
                  <p className="text-sm text-slate-400 line-clamp-2">Logical connections and structural data flow for the production pipeline.</p>
               </Card>
               <Card 
                 className="bg-indigo-600/10 border-indigo-500/20 rounded-3xl p-6 hover:bg-indigo-600/20 transition-all group cursor-pointer"
                 onClick={() => window.location.href = '/history'}
               >
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Brain Archive</span>
                     <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <HistoryIcon className="h-4 w-4 text-indigo-400" />
                     </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Chat History</h3>
                  <p className="text-sm text-slate-400 line-clamp-2">Complete history of all AI assistant interactions and saved neural notes.</p>
               </Card>
            </div>

          </div>
        </div>

        <div className="space-y-4">
          <Button className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[11px] gap-3 shadow-button hover:shadow-white-lg transition-all hover:scale-105 active:scale-95">
            <Folder className="h-4 w-4" />
            New Folder
          </Button>
          <Button variant="outline" className="w-full h-14 rounded-2xl border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all gap-3">
            <Upload className="h-4 w-4" />
            Upload Asset
          </Button>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {files.map((file) => (
          <Card key={file.id} className="rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden bg-white/5 backdrop-blur-2xl transition-all duration-500 group cursor-pointer hover:border-white/30 relative">
            <div className="absolute inset-0 bg-linear-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardContent className="p-8 relative z-10">
              <div className="flex justify-between items-start mb-8">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
                  <FileIcon className="h-7 w-7" />
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-white/5 bg-white/5 hover:bg-white/10">
                  <MoreVertical className="h-5 w-5 text-slate-400" />
                </Button>
              </div>
              <h3 className="text-lg font-black text-white mb-2 truncate group-hover:text-indigo-300 transition-colors">{file.name}</h3>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                 <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">{file.size}</span>
                 <div className="h-1 w-1 bg-indigo-500 rounded-full animate-pulse" />
                 <span className="text-indigo-400">{file.type}</span>
              </div>
              <div className="mt-8 flex gap-3">
                 <Button variant="outline" className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all gap-2">
                    <Download className="h-4 w-4" />
                    Download
                 </Button>
                 <Button variant="ghost" className="h-11 w-11 rounded-xl text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 border border-white/5">
                    <Trash2 className="h-4 w-4" />
                 </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
