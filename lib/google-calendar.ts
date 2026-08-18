import { createSign } from "node:crypto";
import {
  readGoogleCalendarOAuthStore,
  saveGoogleCalendarSelection,
  saveGoogleOAuthRefreshToken,
} from "./google-calendar-oauth-store";

type NewCalendarEvent = { title:string; date:string; time?:string; owner?:string };
type CalendarAuthMode = "oauth" | "service_account";
type CalendarAuth = { token:string; mode:CalendarAuthMode };

export type GoogleCalendarChoice = {
  id:string;
  summary:string;
  primary:boolean;
  accessRole:string;
  backgroundColor:string;
  selected:boolean;
  writable:boolean;
};

export type CalendarConnectionStatus = {
  configured:boolean;
  connected:boolean;
  message:string;
  calendarName?:string;
  calendarId?:string;
  authMode?:CalendarAuthMode;
  oauthConfigured?:boolean;
  calendars?:GoogleCalendarChoice[];
  selectedCalendarIds?:string[];
  writeCalendarId?:string;
};

type CalendarListApiEntry = {
  id?:string;
  summary?:string;
  primary?:boolean;
  selected?:boolean;
  accessRole?:string;
  backgroundColor?:string;
};

type GoogleCalendarEvent = {
  id?:string;
  summary?:string;
  description?:string;
  htmlLink?:string;
  start?:{ date?:string; dateTime?:string };
};

const eventColors = ["blue","mint","pink","violet","amber"];
const readableRoles = new Set(["reader","writer","owner"]);
const writableRoles = new Set(["writer","owner"]);

function oauthSettings() {
  return {
    clientId:process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "",
    clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "",
  };
}

export function googleOAuthConfigured() {
  const settings = oauthSettings();
  return Boolean(settings.clientId && settings.clientSecret);
}

export function googleOAuthRedirectUri(request:Request) {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":","");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  return `${protocol}://${host}/api/calendar/oauth/callback`;
}

function base64Url(value:string) {
  return Buffer.from(value).toString("base64url");
}

function addCalendarDays(date:string,days:number) {
  const [year,month,day] = date.split("-").map(Number);
  return new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10);
}

function seoulDateTime(value:string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US",{
      timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",
    }).formatToParts(date).map((part)=>[part.type,part.value]),
  );
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}

async function serviceAccountAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "";
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.trim() || "";
  if (!email || !rawKey) return null;
  const key = rawKey.replace(/\\n/g,"\n");
  const now = Math.floor(Date.now()/1000);
  const header = base64Url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload = base64Url(JSON.stringify({iss:email,scope:"https://www.googleapis.com/auth/calendar",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(key,"base64url");
  const response = await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${header}.${payload}.${signature}`}),
    cache:"no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as {error_description?:string};
    throw new Error(result.error_description || `Google 서비스 계정 인증 실패 (${response.status})`);
  }
  return (await response.json() as {access_token:string}).access_token;
}

async function oauthAccessToken() {
  if (!googleOAuthConfigured()) return null;
  const store = await readGoogleCalendarOAuthStore();
  if (!store.refreshToken) return null;
  const settings = oauthSettings();
  const response = await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:settings.clientId,client_secret:settings.clientSecret,refresh_token:store.refreshToken,grant_type:"refresh_token"}),
    cache:"no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as {error_description?:string;error?:string};
    throw new Error(result.error_description || result.error || `Google OAuth 갱신 실패 (${response.status})`);
  }
  return (await response.json() as {access_token:string}).access_token;
}

async function calendarAuth():Promise<CalendarAuth|null> {
  let oauthError:unknown = null;
  let oauthToken:string|null = null;
  try { oauthToken = await oauthAccessToken(); } catch(error) { oauthError = error; }
  if (oauthToken) return {token:oauthToken,mode:"oauth"};
  const serviceToken = await serviceAccountAccessToken();
  if (serviceToken) return {token:serviceToken,mode:"service_account"};
  if (oauthError) throw oauthError;
  return null;
}

async function googleJson<T>(auth:CalendarAuth,url:string,init:RequestInit={}) {
  const response = await fetch(url,{
    ...init,
    headers:{authorization:`Bearer ${auth.token}`,...(init.body?{"content-type":"application/json"}:{}),...init.headers},
    cache:"no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as {error?:{message?:string}};
    throw new Error(result.error?.message || `Google Calendar 요청 실패 (${response.status})`);
  }
  return response.status===204 ? null as T : await response.json() as T;
}

async function availableCalendars(auth:CalendarAuth) {
  if (auth.mode==="service_account") {
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "";
    if (!calendarId) return [];
    const calendar = await googleJson<{id?:string;summary?:string}>(auth,`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`);
    return [{id:calendar.id||calendarId,summary:calendar.summary||"공유 캘린더",primary:false,selected:true,accessRole:"writer",backgroundColor:"#4285f4"}];
  }

  const calendars:Required<CalendarListApiEntry>[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({maxResults:"250",showHidden:"true"});
    if (pageToken) params.set("pageToken",pageToken);
    const result = await googleJson<{items?:CalendarListApiEntry[];nextPageToken?:string}>(auth,`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`);
    for (const item of result.items||[]) {
      if (!item.id||!readableRoles.has(item.accessRole||"")) continue;
      calendars.push({id:item.id,summary:item.summary||"이름 없는 캘린더",primary:Boolean(item.primary),selected:Boolean(item.selected),accessRole:item.accessRole||"reader",backgroundColor:item.backgroundColor||"#4285f4"});
    }
    pageToken = result.nextPageToken||"";
  } while (pageToken);
  return calendars.sort((a,b)=>Number(b.primary)-Number(a.primary)||a.summary.localeCompare(b.summary,"ko"));
}

async function resolvedCalendarSettings(auth:CalendarAuth) {
  const calendars = await availableCalendars(auth);
  const store = await readGoogleCalendarOAuthStore();
  const availableIds = new Set(calendars.map((calendar)=>calendar.id));
  let selectedCalendarIds = store.selectedCalendarIds.filter((id)=>availableIds.has(id));
  if (auth.mode==="service_account") selectedCalendarIds = calendars.map((calendar)=>calendar.id);
  if (!selectedCalendarIds.length&&!store.selectionInitialized&&auth.mode==="oauth") {
    const legacyId = process.env.GOOGLE_CALENDAR_ID?.trim()||"";
    const defaultCalendar = calendars.find((calendar)=>calendar.id===legacyId)||calendars.find((calendar)=>calendar.primary);
    if (defaultCalendar) selectedCalendarIds = [defaultCalendar.id];
  }
  const writableSelected = calendars.filter((calendar)=>selectedCalendarIds.includes(calendar.id)&&writableRoles.has(calendar.accessRole));
  const writeCalendarId = writableSelected.some((calendar)=>calendar.id===store.writeCalendarId)
    ? store.writeCalendarId
    : store.selectionInitialized&&auth.mode==="oauth" ? "" : writableSelected[0]?.id||"";
  const choices:GoogleCalendarChoice[] = calendars.map((calendar)=>({id:calendar.id,summary:calendar.summary,primary:calendar.primary,accessRole:calendar.accessRole,backgroundColor:calendar.backgroundColor,selected:selectedCalendarIds.includes(calendar.id),writable:writableRoles.has(calendar.accessRole)}));
  return {choices,selectedCalendarIds,writeCalendarId};
}

export function googleOAuthAuthorizationUrl(redirectUri:string,state:string) {
  const settings = oauthSettings();
  if (!settings.clientId||!settings.clientSecret) throw new Error("Google OAuth 클라이언트 설정이 필요합니다.");
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id:settings.clientId,redirect_uri:redirectUri,response_type:"code",scope:"https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",access_type:"offline",prompt:"consent",include_granted_scopes:"true",state})}`;
}

export async function exchangeGoogleOAuthCode(code:string,redirectUri:string) {
  const settings = oauthSettings();
  if (!settings.clientId||!settings.clientSecret) throw new Error("Google OAuth 클라이언트 설정이 필요합니다.");
  const response = await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:settings.clientId,client_secret:settings.clientSecret,code,redirect_uri:redirectUri,grant_type:"authorization_code"}),
    cache:"no-store",
  });
  const result = await response.json().catch(()=>({})) as {refresh_token?:string;error_description?:string;error?:string};
  if (!response.ok||!result.refresh_token) throw new Error(result.error_description||result.error||"Google OAuth refresh token을 받지 못했습니다.");
  await saveGoogleOAuthRefreshToken(result.refresh_token);
}

export async function updateGoogleCalendarSelection(selectedCalendarIds:string[],writeCalendarId:string) {
  const auth = await calendarAuth();
  if (!auth) throw new Error("Google Calendar 연결이 필요합니다.");
  if (auth.mode!=="oauth") throw new Error("공유 캘린더 선택은 Google OAuth 연결 후 사용할 수 있습니다.");
  const calendars = await availableCalendars(auth);
  const calendarById = new Map(calendars.map((calendar)=>[calendar.id,calendar]));
  const selected = [...new Set(selectedCalendarIds)].filter((id)=>calendarById.has(id));
  if (writeCalendarId) {
    const writeCalendar = calendarById.get(writeCalendarId);
    if (!writeCalendar||!writableRoles.has(writeCalendar.accessRole)||!selected.includes(writeCalendarId)) throw new Error("새 일정 저장 캘린더는 선택된 쓰기 가능 캘린더여야 합니다.");
  }
  await saveGoogleCalendarSelection(selected,writeCalendarId);
  return checkCalendarConnection();
}

export async function checkCalendarConnection():Promise<CalendarConnectionStatus> {
  const serviceConfigured = Boolean(process.env.GOOGLE_CALENDAR_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY);
  const oauthConfigured = googleOAuthConfigured();
  if (!serviceConfigured&&!oauthConfigured) return {configured:false,connected:false,oauthConfigured:false,message:"Google OAuth 또는 서비스 계정 환경설정이 필요합니다."};
  try {
    const auth = await calendarAuth();
    if (!auth) return {configured:true,connected:false,oauthConfigured,message:oauthConfigured?"Google 계정을 연결해 주세요.":"서비스 계정 인증 정보를 확인해 주세요."};
    const resolved = await resolvedCalendarSettings(auth);
    const selectedNames = resolved.choices.filter((calendar)=>calendar.selected).map((calendar)=>calendar.summary);
    return {configured:true,connected:true,oauthConfigured,authMode:auth.mode,message:auth.mode==="oauth"?`공유 캘린더 ${resolved.choices.length}개를 불러왔습니다.`:"서비스 계정으로 연결되었습니다.",calendarName:selectedNames.length===1?selectedNames[0]:selectedNames.length?`${selectedNames.length}개 캘린더 선택됨`:"선택된 캘린더 없음",calendarId:resolved.writeCalendarId||resolved.selectedCalendarIds[0]||"",calendars:resolved.choices,selectedCalendarIds:resolved.selectedCalendarIds,writeCalendarId:resolved.writeCalendarId};
  } catch(error) {
    return {configured:true,connected:false,oauthConfigured,message:error instanceof Error?error.message:"Google Calendar 연결 확인 실패"};
  }
}

function googleEventReference(calendarId:string,eventId:string) {
  return `${calendarId}::${eventId}`;
}

function parseGoogleEventReference(reference:string,fallbackCalendarId:string) {
  const separator = reference.lastIndexOf("::");
  return separator<0?{calendarId:fallbackCalendarId,eventId:reference}:{calendarId:reference.slice(0,separator),eventId:reference.slice(separator+2)};
}

async function eventsForCalendar(auth:CalendarAuth,calendar:GoogleCalendarChoice,timeMin:string,timeMax:string,color:string) {
  const params = new URLSearchParams({timeMin,timeMax,timeZone:"Asia/Seoul",singleEvents:"true",orderBy:"startTime",maxResults:"2500"});
  const result = await googleJson<{items?:GoogleCalendarEvent[]}>(auth,`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`);
  return (result.items||[]).flatMap((item)=>{
    if (!item.id) return [];
    const start = item.start?.dateTime?seoulDateTime(item.start.dateTime):item.start?.date?{date:item.start.date,time:""}:null;
    if (!start) return [];
    return [{id:`google:${calendar.id}:${item.id}`,googleEventId:googleEventReference(calendar.id,item.id),googleCalendarId:calendar.id,calendarName:calendar.summary,calendarWritable:calendar.writable,title:item.summary||"제목 없는 일정",date:start.date,time:start.time,owner:item.description?.match(/모아 앱에서 추가 · (공통|성근|지우|윤재)/)?.[1]||"공통",color,source:"google",htmlLink:item.htmlLink||""}];
  });
}

export async function listCalendarEvents(timeMin:string,timeMax:string) {
  const auth = await calendarAuth();
  if (!auth) return {configured:false,connected:false,events:[]};
  const resolved = await resolvedCalendarSettings(auth);
  const selected = resolved.choices.filter((calendar)=>calendar.selected);
  const results = await Promise.allSettled(selected.map((calendar,index)=>eventsForCalendar(auth,calendar,timeMin,timeMax,eventColors[index%eventColors.length])));
  const events = results.flatMap((result)=>result.status==="fulfilled"?result.value:[]).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const failures = results.filter((result):result is PromiseRejectedResult=>result.status==="rejected");
  if (failures.length===results.length&&failures.length) throw failures[0].reason;
  return {configured:true,connected:true,events,warnings:failures.map((failure)=>failure.reason instanceof Error?failure.reason.message:String(failure.reason))};
}

export async function createCalendarEvent(event:NewCalendarEvent) {
  const auth = await calendarAuth();
  if (!auth) return {configured:false};
  const resolved = await resolvedCalendarSettings(auth);
  const calendarId = resolved.writeCalendarId;
  if (!calendarId) throw new Error("새 일정을 저장할 캘린더를 선택해 주세요.");
  const calendar = resolved.choices.find((item)=>item.id===calendarId);
  if (!calendar?.writable) throw new Error("선택한 캘린더에는 일정 쓰기 권한이 없습니다.");
  const timed = Boolean(event.time);
  const start = timed?`${event.date}T${event.time}:00+09:00`:event.date;
  const end = timed?new Date(new Date(start).getTime()+60*60*1000).toISOString():addCalendarDays(event.date,1);
  const created = await googleJson<GoogleCalendarEvent>(auth,`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,{method:"POST",body:JSON.stringify({summary:event.title,description:`모아 앱에서 추가 · ${event.owner||"공통"}`,start:timed?{dateTime:start,timeZone:"Asia/Seoul"}:{date:start},end:timed?{dateTime:end,timeZone:"Asia/Seoul"}:{date:end}})});
  if (!created.id) throw new Error("Google 일정 ID를 받지 못했습니다.");
  return {configured:true,connected:true,event:{...created,calendarId,calendarName:calendar.summary,ref:googleEventReference(calendarId,created.id)}};
}

export async function deleteCalendarEvent(eventReference:string) {
  const auth = await calendarAuth();
  if (!auth) return {configured:false,deleted:false};
  const resolved = await resolvedCalendarSettings(auth);
  const fallbackCalendarId = resolved.writeCalendarId||resolved.selectedCalendarIds[0]||process.env.GOOGLE_CALENDAR_ID||"";
  const {calendarId,eventId} = parseGoogleEventReference(eventReference,fallbackCalendarId);
  if (!calendarId||!eventId) throw new Error("삭제할 Google 일정 정보를 찾지 못했습니다.");
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,{method:"DELETE",headers:{authorization:`Bearer ${auth.token}`},cache:"no-store"});
  if (response.status===404) return {configured:true,deleted:true,alreadyDeleted:true};
  if (!response.ok) {
    const result = await response.json().catch(()=>({})) as {error?:{message?:string}};
    throw new Error(result.error?.message||`Google 일정 삭제 실패 (${response.status})`);
  }
  return {configured:true,deleted:true};
}
