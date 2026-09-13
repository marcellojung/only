import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const windows = process.platform === "win32";
const python = path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const dataDir = process.env.APP_DATA_DIR || path.join(root, "data");
const pidFile = path.join(dataDir, "only-family-assets.pid");
const instanceFile = path.join(dataDir, "only-launcher.json");
const stopFile = path.join(dataDir, "only-stop.json");
const instance = randomUUID();

if (!existsSync(python)) {
  console.error("FastAPI 가상환경이 없습니다. 먼저 `pnpm setup:backend`를 실행해 주세요.");
  process.exit(1);
}
if (!existsSync(nextCli) || !existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.error("운영 빌드가 없습니다. 먼저 `pnpm install`과 `pnpm build`를 실행해 주세요.");
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
if (existsSync(pidFile)) {
  const previousPid = Number(readFileSync(pidFile, "utf8"));
  try {
    process.kill(previousPid, 0);
    console.error(`이미 실행 중입니다. PID: ${previousPid}`);
    process.exit(1);
  } catch (error) {
    if (error.code !== "ESRCH" && error.code !== "ERR_INVALID_ARG_TYPE") {
      console.error("기존 실행 관리자 상태를 확인할 수 없습니다."); process.exit(1);
    }
    unlinkSync(pidFile);
  }
}
try { writeFileSync(pidFile, String(process.pid), { flag: "wx" }); }
catch { console.error("다른 실행 요청이 진행 중입니다."); process.exit(1); }
writeFileSync(instanceFile, JSON.stringify({ pid: process.pid, root, instance, startedAt: new Date().toISOString() }));

const backendPort = process.env.ONLY_BACKEND_PORT || "8000";
const frontendPort = process.env.ONLY_FRONTEND_PORT || "3000";
const backend = spawn(python, ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", backendPort], { cwd: root, stdio: "inherit", windowsHide: true });
const frontend = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", frontendPort], { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${backendPort}` } });

let stopping = false;
function cleanup() {
  try { if (Number(readFileSync(pidFile, "utf8")) === process.pid) unlinkSync(pidFile); } catch {}
  try { if (JSON.parse(readFileSync(instanceFile, "utf8")).instance === instance) unlinkSync(instanceFile); } catch {}
  try { if (JSON.parse(readFileSync(stopFile, "utf8")).instance === instance) unlinkSync(stopFile); } catch {}
}
function stopChild(child) {
  return new Promise(resolve => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return resolve();
    if (windows) {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("exit", resolve); killer.once("error", resolve);
    } else { child.once("exit", resolve); child.kill("SIGTERM"); }
  });
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(control);
  await Promise.all([stopChild(backend), stopChild(frontend)]);
  cleanup(); process.exit(code);
}

const control = setInterval(() => {
  try { if (JSON.parse(readFileSync(stopFile, "utf8")).instance === instance) void stop(); } catch {}
}, 500);
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("exit", cleanup);
for (const child of [backend, frontend]) {
  child.on("error", error => { console.error(error.message); void stop(1); });
  child.on("exit", code => { if (!stopping) void stop(code || 1); });
}
