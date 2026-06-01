// Public URL of the sky-annotations-worker running on Railway.
// This is a public endpoint (CORS-enabled), so it's safe to ship in the client bundle.
export const ANNOTATIONS_WORKER_URL =
  "https://sky-annotations-worker-production.up.railway.app";

export async function workerHealth(): Promise<{ ok: boolean; service?: string }> {
  const res = await fetch(`${ANNOTATIONS_WORKER_URL}/health`);
  if (!res.ok) throw new Error(`Worker health failed: ${res.status}`);
  return res.json();
}
