export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const backend = await response.json();
    const ready = response.ok && backend.ok && backend.app === "only-family-assets";
    return Response.json({ app: "only-family-assets", ready: Boolean(ready) }, { status: ready ? 200 : 503 });
  } catch {
    return Response.json({ app: "only-family-assets", ready: false }, { status: 503 });
  }
}
