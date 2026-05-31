import { createFileRoute } from "@tanstack/react-router";
import { ListVideo, Type, Music, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/annotations")({
  component: AnnotationsPage,
});

function AnnotationsPage() {
  const annotations = [
    { id: 1, type: "Text Overlay", content: "Key Concept: AI DNA", time: "00:15" },
    { id: 2, type: "Sound Effect", content: "Whoosh.mp3", time: "00:45" },
    { id: 3, type: "Image", content: "Diagram_01.png", time: "01:20" },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 5</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• ENRICHMENT ENGINE</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Annotations</h1>
          <p className="text-slate-500 mt-1">Dynamic overlays, captions, and auditory cues.</p>
        </div>
        <Button className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-100 px-6 gap-2 h-11 rounded-2xl">
          <Plus className="h-4 w-4" />
          Add Annotation
        </Button>
      </div>

      <div className="grid gap-4">
        {annotations.map((ann) => (
          <div key={ann.id} className="bg-white p-5 rounded-3xl border shadow-sm flex items-center justify-between group hover:border-amber-200 transition-colors">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-500 transition-colors">
                {ann.type === "Text Overlay" && <Type className="h-6 w-6" />}
                {ann.type === "Sound Effect" && <Music className="h-6 w-6" />}
                {ann.type === "Image" && <ImageIcon className="h-6 w-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{ann.type}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-[10px] font-bold text-amber-500">{ann.time}</span>
                </div>
                <p className="font-bold text-slate-900 text-lg">{ann.content}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-rose-500 hover:bg-rose-50">
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}