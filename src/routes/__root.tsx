import { createRootRoute, HeadContent, Scripts, ScrollRestoration, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
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
      { name: "twitter:description", content: "Sky Studio - Professional SaaS Dashboard" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fc62972d-0e28-47c4-b21d-50d21fc111b9/id-preview-8440afb6--44ca71cc-4798-45c1-a2f3-ea11b67ccc44.lovable.app-1780243215151.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fc62972d-0e28-47c4-b21d-50d21fc111b9/id-preview-8440afb6--44ca71cc-4798-45c1-a2f3-ea11b67ccc44.lovable.app-1780243215151.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ScrollRestoration />
          <Outlet />
          <Toaster position="top-right" expand={true} richColors />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
