import { createFileRoute } from "@tanstack/react-router";
import { Zap, BrainCircuit, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/hook-generator")({
  component: HookEngine,
});

function HookEngine() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
          <Zap className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Hook Engine</h1>
          <p className="text-slate-500">Generate viral hooks for your content.</p>
        </div>
      </div>
      <div className="grid gap-6">
        <div className="bg-white p-6 rounded-3xl border shadow-sm">
          <h3 className="text-lg font-bold mb-4">Generate Hooks</h3>
          <p className="text-muted-foreground mb-4">Input script or topic to generate 10+ high-CTR hooks.</p>
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Wand2 className="mr-2 h-4 w-4" />
            Generate Hooks
          </Button>
        </div>
      </div>
    </div>
  );
}