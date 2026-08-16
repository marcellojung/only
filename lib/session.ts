export const SESSION_COOKIE = "moa_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export function sessionToken(request: Request): string {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return "";
    }
  }
  return "";
}

export function sessionCookie(token: string, secure: boolean): string {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function expiredSessionCookie(secure: boolean): string {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function isSecureRequest(request: Request): boolean {
  return process.env.NODE_ENV === "production"
    || new URL(request.url).protocol === "https:"
    || request.headers.get("x-forwarded-proto") === "https";
}

export function acceptsMutation(request: Request): boolean {
  return request.headers.get("x-moa-request") === "1";
}
