import { acceptsMutation, expiredSessionCookie, isSecureRequest, sessionCookie, sessionToken } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path: segments } = await context.params;
  const path = segments.map(encodeURIComponent).join("/");
  const secure = isSecureRequest(request);

  if (path === "auth/logout" && request.method === "POST") {
    if (!acceptsMutation(request)) return Response.json({ detail: "잘못된 요청입니다." }, { status: 403 });
    return Response.json(
      { logged_out: true },
      { headers: { "set-cookie": expiredSessionCookie(secure), "cache-control": "no-store" } },
    );
  }

  if (MUTATING_METHODS.has(request.method) && !acceptsMutation(request)) {
    return Response.json({ detail: "잘못된 요청입니다." }, { status: 403 });
  }

  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const target = new URL(`/api/${path}`, backendUrl);
  target.search = new URL(request.url).search;
  const headers = new Headers({ accept: request.headers.get("accept") || "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const token = sessionToken(request);
  if (token) headers.set("x-app-key", token);
  const clientIp = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  headers.set("x-client-ip", clientIp.slice(0, 80));

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers({
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    });
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) responseHeaders.set("retry-after", retryAfter);

    if (path === "auth/login" && upstream.ok) {
      const result = await upstream.json() as { token: string; viewer: unknown };
      responseHeaders.set("set-cookie", sessionCookie(result.token, secure));
      return Response.json({ viewer: result.viewer }, { status: upstream.status, headers: responseHeaders });
    }
    if (upstream.status === 401 && token) responseHeaders.set("set-cookie", expiredSessionCookie(secure));
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: "자산 서버에 연결하지 못했습니다." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
