import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { addSource, deleteSource, bulkAddSources } from "@/lib/engine.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_dashboard/sources")({
  component: SourcesPage,
  head: () => ({ meta: [{ title: "Sources — Sky Intel" }] }),
});

function SourcesPage() {
  const qc = useQueryClient();
  const [channelName, setChannelName] = useState("");
  const [url, setUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources_master")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addFn = useServerFn(addSource);
  const delFn = useServerFn(deleteSource);
  const bulkAddFn = useServerFn(bulkAddSources);

  const add = useMutation({
    mutationFn: () => addFn({ data: { type: "youtube", channel_name: channelName, source_url: url } }),
    onSuccess: () => {
      toast.success("Source added");
      setChannelName("");
      setUrl("");
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const bulkAdd = useMutation({
    mutationFn: (data: any[]) => bulkAddFn({ data }),
    onSuccess: (res) => {
      toast.success(`Successfully imported ${res.count} sources`);
      setIsImporting(false);
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (e: any) => {
      toast.error(e.message);
      setIsImporting(false);
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n");
      const data: any[] = [];

      // Skip header if present (assuming name,url or channel_name,source_url)
      const startIdx = lines[0].toLowerCase().includes("url") ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try comma or semicolon
        const parts = line.includes(",") ? line.split(",") : line.split(";");
        if (parts.length >= 2) {
          const name = parts[0].trim().replace(/^["']|["']$/g, "");
          const sourceUrl = parts[1].trim().replace(/^["']|["']$/g, "");
          
          if (name && sourceUrl && sourceUrl.startsWith("http")) {
            data.push({
              channel_name: name,
              source_url: sourceUrl,
              type: "youtube",
            });
          }
        }
      }

      if (data.length === 0) {
        toast.error("No valid data found in CSV. Use format: Channel Name, URL");
        setIsImporting(false);
      } else {
        bulkAdd.mutate(data);
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.onerror = () => {
      toast.error("Error reading file");
      setIsImporting(false);
    };
    reader.readAsText(file);
  };

  const downloadSampleCSV = () => {
    const headers = "Channel Name,URL";
    const rows = [
      "Gagan Pratap,https://www.youtube.com/@MathsByGaganPratap",
      "Aditya Ranjan,https://www.youtube.com/@AdityaRanjanTalks"
    ].join("\n");
    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "sample_sources.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-2xl font-semibold">Sources</h1>
        <p className="text-sm text-muted-foreground">YouTube channels we scrape to generate ideas.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a channel</CardTitle>
            <CardDescription>Manually add a single YouTube channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="name">Channel name</Label>
                <Input id="name" value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Gagan Pratap" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="url">Channel URL</Label>
                <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/@MathsByGaganPratap" required />
              </div>
              <Button type="submit" disabled={add.isPending} className="w-full">Add Source</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bulk Import</CardTitle>
            <CardDescription>Upload a CSV file with channel names and links.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center space-y-4 py-8 border-2 border-dashed rounded-lg bg-muted/30">
            <div className="rounded-full bg-primary/10 p-3">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">CSV Format: Name, URL</p>
              <p className="text-xs text-muted-foreground">Example: Gagan Pratap, https://youtube.com/@...</p>
              <button 
                onClick={downloadSampleCSV}
                className="text-xs text-primary hover:underline block mt-1"
              >
                Download sample sheet
              </button>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isImporting ? "Importing..." : "Choose CSV File"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All sources ({sources.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No sources yet.
                  </TableCell>
                </TableRow>
              )}
              {sources.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.channel_name}</TableCell>
                  <TableCell>
                    <a href={s.source_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {s.source_url}
                    </a>
                  </TableCell>
                  <TableCell>{s.type}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}