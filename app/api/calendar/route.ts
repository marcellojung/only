import { checkCalendarConnection, createCalendarEvent } from "../../../lib/google-calendar";
import { isAuthorized } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await checkCalendarConnection());
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.title || !body.date) return Response.json({ error: "title and date are required" }, { status: 400 });
    const result = await createCalendarEvent(body);
    return Response.json(result, { status: result.configured ? 201 : 202 });
  } catch {
    return Response.json({ error: "calendar sync failed" }, { status: 502 });
  }
}
