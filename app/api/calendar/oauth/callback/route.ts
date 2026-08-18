import { exchangeGoogleOAuthCode, googleOAuthRedirectUri } from "../../../../../lib/google-calendar";
import { isSecureRequest } from "../../../../../lib/session";

export const runtime = "nodejs";

function cookieValue(request:Request,name:string) {
  for (const part of (request.headers.get("cookie")||"").split(";")) {
    const [key,...value] = part.trim().split("=");
    if (key===name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function finish(request:Request,result:"connected"|"error") {
  const destination = new URL("/",request.url);
  destination.searchParams.set("calendarOAuth",result);
  const response = Response.redirect(destination);
  response.headers.append("set-cookie",[
    "moa_google_oauth_state=",
    "Path=/api/calendar/oauth",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isSecureRequest(request)?"Secure":"",
  ].filter(Boolean).join("; "));
  return response;
}

export async function GET(request:Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")||"";
  const expectedState = cookieValue(request,"moa_google_oauth_state");
  const code = url.searchParams.get("code")||"";
  if (!state||!expectedState||state!==expectedState||!code||url.searchParams.has("error")) return finish(request,"error");
  try {
    await exchangeGoogleOAuthCode(code,googleOAuthRedirectUri(request));
    return finish(request,"connected");
  } catch {
    return finish(request,"error");
  }
}
