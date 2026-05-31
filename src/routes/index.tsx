import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sky Intel Studio — YouTube Idea Engine" },
      { name: "description", content: "Scrape competitor YouTube channels and generate AI-powered video ideas." },
      { property: "og:title", content: "Sky Intel Studio" },
      { property: "og:description", content: "AI-powered YouTube content intelligence for Indian exam prep creators." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Sky Intel Studio</h1>
        <p className="max-w-xl text-muted-foreground">
          Your YouTube idea engine. Scrape competitor channels, generate AI-powered video ideas,
          and ship better content for Indian exam prep audiences.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/pipeline">Open dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
