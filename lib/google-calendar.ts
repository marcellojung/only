import { createSign } from "node:crypto";

type NewCalendarEvent = { title: string; date: string; time?: string; owner?: string };

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  const key = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${payload}.${signature}` }) });
  if (!response.ok) throw new Error("Google token request failed");
  return (await response.json() as { access_token: string }).access_token;
}

export async function createCalendarEvent(event: NewCalendarEvent) {
  const token = await accessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return { configured: false };
  const timed = Boolean(event.time);
  const start = timed ? `${event.date}T${event.time}:00+09:00` : event.date;
  const endDate = new Date(`${event.date}T00:00:00+09:00`);
  endDate.setDate(endDate.getDate() + 1);
  const timedEnd = timed ? new Date(start) : null;
  timedEnd?.setHours(timedEnd.getHours() + 1);
  const end = timedEnd ? timedEnd.toISOString() : endDate.toISOString().slice(0,10);
  const body = {
    summary: event.title,
    description: `모아 앱에서 추가 · ${event.owner || "공통"}`,
    start: timed ? { dateTime: start, timeZone: "Asia/Seoul" } : { date: start },
    end: timed ? { dateTime: end, timeZone: "Asia/Seoul" } : { date: end },
  };
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Google event creation failed");
  return { configured: true, event: await response.json() };
}
