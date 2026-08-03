import { isAuthorized, readState, writeState } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const state = await readState();
  return Response.json({ ...state, protected: Boolean(process.env.APP_ACCESS_KEY) });
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!Array.isArray(body.transactions)) return Response.json({ error: "invalid transactions" }, { status: 400 });
  if (!Array.isArray(body.stockHoldings)) return Response.json({ error: "invalid stock holdings" }, { status: 400 });
  return Response.json(await writeState({ transactions: body.transactions.slice(0, 5000), stockHoldings: body.stockHoldings.slice(0, 2000) }));
}
