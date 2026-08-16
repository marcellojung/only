import { backendViewer } from "../../../lib/backend-auth";
import { acceptsMutation } from "../../../lib/session";
import { readState, writeState } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  const state = await readState();
  return Response.json({ ...state, protected: true });
}

export async function PUT(request: Request) {
  if (!acceptsMutation(request)) return Response.json({ error: "invalid request" }, { status: 403 });
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  const body = await request.json();
  if (!Array.isArray(body.transactions)) return Response.json({ error: "invalid transactions" }, { status: 400 });
  if (!Array.isArray(body.stockHoldings)) return Response.json({ error: "invalid stock holdings" }, { status: 400 });
  if (!body.portfolio || typeof body.portfolio !== "object") return Response.json({ error: "invalid portfolio" }, { status: 400 });
  return Response.json(await writeState({ transactions: body.transactions.slice(0, 5000), stockHoldings: body.stockHoldings.slice(0, 2000), portfolio: body.portfolio }));
}
