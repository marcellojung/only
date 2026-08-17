import { createSign } from "node:crypto";

type NewCalendarEvent = { title: string; date: string; time?: string; owner?: string };
export type CalendarConnectionStatus = {
  configured: boolean;
  connected: boolean;
  message: string;
  calendarName?: string;
  calendarId?: string;
};

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function addCalendarDays(date:string, days:number) {
  const [year,month,day] = date.split("-").map(Number);
  return new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10);
}

function seoulDateTime(value:string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone:"Asia/Seoul",
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      hourCycle:"h23",
    }).formatToParts(date).map((part)=>[part.type,part.value]),
  );
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
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
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as { error_description?:string };
    throw new Error(result.error_description || `Google 인증 실패 (${response.status})`);
  }
  return (await response.json() as { access_token: string }).access_token;
}

function missingCalendarSettings() {
  const missing:string[] = [];
  if (!process.env.GOOGLE_CALENDAR_ID) missing.push("GOOGLE_CALENDAR_ID");
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!process.env.GOOGLE_PRIVATE_KEY) missing.push("GOOGLE_PRIVATE_KEY");
  return missing;
}

export async function checkCalendarConnection():Promise<CalendarConnectionStatus> {
  const missing = missingCalendarSettings();
  if (missing.length) {
    return { configured:false, connected:false, message:`환경변수 입력 필요: ${missing.join(", ")}` };
  }
  try {
    const token = await accessToken();
    const calendarId = process.env.GOOGLE_CALENDAR_ID as string;
    if (!token) return { configured:true, connected:false, message:"서비스 계정 인증 토큰을 만들지 못했습니다." };
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`, {
      headers:{ authorization:`Bearer ${token}` }, cache:"no-store",
    });
    if (!response.ok) {
      const result = await response.json().catch(()=>({})) as { error?:{ message?:string } };
      return { configured:true, connected:false, message:result.error?.message || `캘린더 접근 실패 (${response.status})` };
    }
    const calendar = await response.json() as { id?:string; summary?:string };
    return { configured:true, connected:true, message:"Google Calendar 연결 성공", calendarName:calendar.summary||"공유 캘린더", calendarId:calendar.id||calendarId };
  } catch(error) {
    return { configured:true, connected:false, message:error instanceof Error?error.message:"Google Calendar 연결 확인 실패" };
  }
}

type GoogleCalendarEvent = {
  id?:string;
  summary?:string;
  description?:string;
  htmlLink?:string;
  start?:{ date?:string; dateTime?:string };
};

export async function listCalendarEvents(timeMin:string,timeMax:string) {
  const token = await accessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return { configured:false, connected:false, events:[] };
  const params = new URLSearchParams({timeMin,timeMax,timeZone:"Asia/Seoul",singleEvents:"true",orderBy:"startTime",maxResults:"2500"});
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers:{authorization:`Bearer ${token}`},cache:"no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as { error?:{ message?:string } };
    throw new Error(result.error?.message || `Google 일정 조회 실패 (${response.status})`);
  }
  const result = await response.json() as { items?:GoogleCalendarEvent[] };
  const events = (result.items||[]).flatMap((item)=>{
    if (!item.id) return [];
    const start = item.start?.dateTime ? seoulDateTime(item.start.dateTime) : item.start?.date ? {date:item.start.date,time:""} : null;
    if (!start) return [];
    const owner = item.description?.match(/모아 앱에서 추가 · (공통|성근|지우|윤재)/)?.[1] || "공통";
    return [{
      id:`google:${item.id}`,
      googleEventId:item.id,
      title:item.summary || "제목 없는 일정",
      date:start.date,
      time:start.time,
      owner,
      color:"blue",
      source:"google",
      htmlLink:item.htmlLink || "",
    }];
  });
  return {configured:true,connected:true,events};
}

export async function createCalendarEvent(event: NewCalendarEvent) {
  const token = await accessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return { configured: false };
  const timed = Boolean(event.time);
  const start = timed ? `${event.date}T${event.time}:00+09:00` : event.date;
  const end = timed ? new Date(new Date(start).getTime()+60*60*1000).toISOString() : addCalendarDays(event.date,1);
  const body = {
    summary: event.title,
    description: `모아 앱에서 추가 · ${event.owner || "공통"}`,
    start: timed ? { dateTime: start, timeZone: "Asia/Seoul" } : { date: start },
    end: timed ? { dateTime: end, timeZone: "Asia/Seoul" } : { date: end },
  };
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as { error?:{ message?:string } };
    throw new Error(result.error?.message || `Google 일정 추가 실패 (${response.status})`);
  }
  return { configured: true, connected:true, event: await response.json() };
}

export async function deleteCalendarEvent(eventId:string) {
  const token = await accessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return { configured:false, deleted:false };
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method:"DELETE", headers:{ authorization:`Bearer ${token}` },
  });
  if (response.status === 404) return { configured:true, deleted:true, alreadyDeleted:true };
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as { error?:{ message?:string } };
    throw new Error(result.error?.message || `Google 일정 삭제 실패 (${response.status})`);
  }
  return { configured:true, deleted:true };
}
