import { execFileSync } from "node:child_process";
import packageInfo from "../../../package.json";
import { backendViewer } from "../../../lib/backend-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = new Date().toISOString();

function currentRevision() {
  const environmentRevision = process.env.APP_REVISION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.RAILWAY_GIT_COMMIT_SHA;
  if (environmentRevision) return environmentRevision.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const runningRevision = currentRevision();

export async function GET(request: Request) {
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  return Response.json(
    { version: packageInfo.version, revision: runningRevision, started_at: startedAt },
    { headers: { "cache-control": "no-store" } },
  );
}
