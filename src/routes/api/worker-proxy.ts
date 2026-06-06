import { createFileRoute } from "@tanstack/react-router";

const WORKER_URL = "https://sky-annotations-worker-production.up.railway.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/worker-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path");
        if (!path || !path.startsWith("/")) {
          return new Response(JSON.stringify({ detail: "Missing or invalid ?path=" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const body = await request.text();
        try {
          const upstream = await fetch(`${WORKER_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "application/json",
              ...CORS,
            },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ detail: `Worker proxy upstream failed: ${e?.message || e}` }),
            { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path");
        if (!path || !path.startsWith("/")) {
          return new Response(JSON.stringify({ detail: "Missing or invalid ?path=" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        try {
          const upstream = await fetch(`${WORKER_URL}${path}`);
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "application/json",
              ...CORS,
            },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ detail: `Worker proxy upstream failed: ${e?.message || e}` }),
            { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});
