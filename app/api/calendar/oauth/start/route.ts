import { randomBytes } from "node:crypto";
import { backendViewer } from "../../../../../lib/backend-auth";
import { googleOAuthAuthorizationUrl, googleOAuthRedirectUri } from "../../../../../lib/google-calendar";
import { isSecureRequest } from "../../../../../lib/session";

export const runtime = "nodejs";

export async function GET(request:Request) {
  const viewer = await backendViewer(request);
  if (!viewer) return Response.json({error:"unauthorized"},{status:401});
  if (viewer.role!=="admin") return Response.json({error:"admin only"},{status:403});
  try {
    const state = randomBytes(32).toString("base64url");
    const redirectUri = googleOAuthRedirectUri(request);
    const response = Response.redirect(googleOAuthAuthorizationUrl(redirectUri,state));
    response.headers.append("set-cookie",[
      `moa_google_oauth_state=${state}`,
      "Path=/api/calendar/oauth",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=600",
      isSecureRequest(request)?"Secure":"",
    ].filter(Boolean).join("; "));
    return response;
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"Google OAuth 연결을 시작하지 못했습니다."},{status:500});
  }
}
