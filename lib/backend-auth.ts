import { sessionToken } from "./session";

export type BackendViewer = { owner:string; role:"admin"|"guest" };

export async function backendViewer(request:Request):Promise<BackendViewer|null> {
  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${backendUrl}/api/auth/me`, {
      headers:{ "x-app-key":sessionToken(request) || request.headers.get("x-app-key") || "" }, cache:"no-store",
    });
    return response.ok ? await response.json() as BackendViewer : null;
  } catch {
    return null;
  }
}
