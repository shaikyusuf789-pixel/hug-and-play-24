import { createFileRoute } from "@tanstack/react-router";
import { Database, Folder, HardDrive, Search, MoreVertical, FileIcon, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Asset Management</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Cloud Storage</h1>
          <p className="text-slate-500 mt-1">Unified storage for all your generated content and raw assets.</p>
        </div>
        <div className="flex items-center gap-6 bg-white p-4 rounded-2xl border shadow-sm">
           <div className="text-right">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Usage</div>
              <div className="font-bold text-slate-900 text-sm">4.2 GB / 50 GB</div>
           </div>
           <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <HardDrive className="h-6 w-6" />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-11 h-12 bg-white border-slate-200 rounded-2xl" placeholder="Search files..." />
        </div>
        <Button className="h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Folder className="h-4 w-4" />
          New Folder
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {files.map((file) => (
          <div key={file.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <FileIcon className="h-6 w-6" />
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
            <h3 className="font-bold text-slate-900 mb-1 truncate">{file.name}</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400 font-medium uppercase tracking-wider">
               <span>{file.size}</span>
               <span className="w-1 h-1 bg-slate-200 rounded-full" />
               <span>{file.type}</span>
            </div>
            <div className="mt-6 flex gap-2">
               <Button variant="outline" className="flex-1 h-10 rounded-xl border-slate-100 text-[11px] font-bold uppercase tracking-widest gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Get
               </Button>
               <Button variant="ghost" className="h-10 w-10 rounded-xl text-rose-500 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
               </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}