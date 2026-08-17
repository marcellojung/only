import { checkCalendarConnection, createCalendarEvent, deleteCalendarEvent, listCalendarEvents } from "../../../lib/google-calendar";
import { backendViewer } from "../../../lib/backend-auth";
import { acceptsMutation } from "../../../lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  const url = new URL(request.url);
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  try {
    if (timeMin && timeMax) {
      const status = await checkCalendarConnection();
      if (!status.connected) return Response.json({...status,events:[]});
      return Response.json({...status,...await listCalendarEvents(timeMin,timeMax)});
    }
    return Response.json(await checkCalendarConnection());
  } catch(error) {
    return Response.json({configured:true,connected:false,error:error instanceof Error?error.message:"calendar read failed"}, { status:502 });
  }
}

export async function POST(request: Request) {
  if (!acceptsMutation(request)) return Response.json({ error: "invalid request" }, { status: 403 });
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.title || !body.date) return Response.json({ error: "title and date are required" }, { status: 400 });
    const result = await createCalendarEvent(body);
    return Response.json(result, { status: result.configured ? 201 : 202 });
  } catch(error) {
    return Response.json({ error:error instanceof Error?error.message:"calendar sync failed" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  if (!acceptsMutation(request)) return Response.json({ error: "invalid request" }, { status: 403 });
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.eventId) return Response.json({ error: "eventId is required" }, { status: 400 });
    return Response.json(await deleteCalendarEvent(String(body.eventId)));
  } catch(error) {
    return Response.json({ error:error instanceof Error?error.message:"calendar delete failed" }, { status: 502 });
  }
}
