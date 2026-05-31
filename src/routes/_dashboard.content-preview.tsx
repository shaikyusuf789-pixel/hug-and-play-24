import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIdeas } from "@/lib/engine.functions";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/content-preview")({
  component: ContentPreviewPage,
  head: () => ({ meta: [{ title: "Content Preview — Sky Intel" }] }),
});

function ContentPreviewPage() {
  const fetchFn = useServerFn(getIdeas);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ideas-preview"],
    queryFn: () => fetchFn({ data: { status: undefined } }),
  });

  const ideas = data?.ideas || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "Rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "Priority": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "Done": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-slate-500/10 text-slate-500 border-slate-500/20";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Preview</h1>
          <p className="text-muted-foreground">Detailed overview of generated content ideas.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-muted-foreground hover:text-foreground px-4 py-2 rounded-full bg-card border border-border inline-flex items-center gap-2 disabled:opacity-50 transition-all hover:shadow-md"
        >
          {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[60px]">S.No</TableHead>
              <TableHead className="min-w-[300px]">Original Title</TableHead>
              <TableHead className="min-w-[200px]">Proposed Title</TableHead>
              <TableHead className="min-w-[300px]">Summary Points</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading content...
                  </div>
                </TableCell>
              </TableRow>
            ) : ideas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No ideas found. Run the engine to generate some!
                </TableCell>
              </TableRow>
            ) : (
              ideas.map((idea: any, index: number) => (
                <TableRow key={idea.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="max-w-[300px]" title={idea.original_title}>
                    <div className="line-clamp-2">
                      "{idea.original_title}" {idea.sources_master?.channel_name && (
                        <span className="text-muted-foreground text-xs font-normal ml-1">
                          by {idea.sources_master.channel_name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] font-medium text-foreground" title={idea.proposed_title}>
                    {idea.proposed_title}
                  </TableCell>
                  <TableCell>
                    <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                      {(idea.summary_points || []).slice(0, 4).map((point: string, i: number) => (
                        <li key={i} className="line-clamp-1">{point}</li>
                      ))}
                      {(!idea.summary_points || idea.summary_points.length === 0) && (
                        <span className="italic">No summary available</span>
                      )}
                    </ul>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-medium", getStatusColor(idea.status))}>
                      {idea.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
