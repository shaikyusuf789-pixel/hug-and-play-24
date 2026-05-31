import { createFileRoute } from "@tanstack/react-router";
import { Meta, Scripts, ScrollRestoration, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export const Route = createFileRoute("__root")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sky Studio" },
      { name: "description", content: "Sky Studio - Professional SaaS Dashboard" },
      { name: "author", content: "Sky Studio" },
      { property: "og:title", content: "Sky Studio" },
      { property: "og:description", content: "Sky Studio - Professional SaaS Dashboard" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@SkyStudio" },
      { name: "twitter:title", content: "Sky Studio" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <ScrollRestoration />
        <Outlet />
        <Toaster position="top-right" expand={true} richColors />
        <Scripts />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
