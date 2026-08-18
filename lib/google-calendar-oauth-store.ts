import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type GoogleCalendarOAuthStore = {
  refreshToken: string;
  selectedCalendarIds: string[];
  writeCalendarId: string;
  connectedAt: string;
  selectionInitialized: boolean;
};

const emptyStore:GoogleCalendarOAuthStore = {
  refreshToken:"",
  selectedCalendarIds:[],
  writeCalendarId:"",
  connectedAt:"",
  selectionInitialized:false,
};

function dataDirectory() {
  const configured = process.env.APP_DATA_DIR?.trim() || "";
  if (!configured || (process.platform !== "win32" && /^[a-zA-Z]:\\/.test(configured))) {
    return path.join(process.cwd(),"data");
  }
  return path.resolve(/* turbopackIgnore: true */ configured);
}

function storePath() {
  return path.join(dataDirectory(),"google-calendar-oauth.json");
}

export async function readGoogleCalendarOAuthStore():Promise<GoogleCalendarOAuthStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath(),"utf8")) as Partial<GoogleCalendarOAuthStore>;
    return {
      refreshToken:typeof parsed.refreshToken === "string" ? parsed.refreshToken : "",
      selectedCalendarIds:Array.isArray(parsed.selectedCalendarIds) ? parsed.selectedCalendarIds.filter((id):id is string=>typeof id === "string") : [],
      writeCalendarId:typeof parsed.writeCalendarId === "string" ? parsed.writeCalendarId : "",
      connectedAt:typeof parsed.connectedAt === "string" ? parsed.connectedAt : "",
      selectionInitialized:parsed.selectionInitialized===true,
    };
  } catch {
    return {...emptyStore};
  }
}

export async function writeGoogleCalendarOAuthStore(store:GoogleCalendarOAuthStore) {
  const directory = dataDirectory();
  await mkdir(directory,{recursive:true});
  const target = storePath();
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary,`${JSON.stringify(store,null,2)}\n`,{encoding:"utf8",mode:0o600});
  await rename(temporary,target);
  await chmod(target,0o600).catch(()=>undefined);
}

export async function saveGoogleOAuthRefreshToken(refreshToken:string) {
  const current = await readGoogleCalendarOAuthStore();
  await writeGoogleCalendarOAuthStore({
    ...current,
    refreshToken,
    connectedAt:new Date().toISOString(),
  });
}

export async function saveGoogleCalendarSelection(selectedCalendarIds:string[],writeCalendarId:string) {
  const current = await readGoogleCalendarOAuthStore();
  await writeGoogleCalendarOAuthStore({...current,selectedCalendarIds,writeCalendarId,selectionInitialized:true});
}
