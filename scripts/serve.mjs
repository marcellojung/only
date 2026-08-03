import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const windows = process.platform === "win32";
const python = path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const dataDir = path.join(root, "data");
const pidFile = path.join(dataDir, "only-family-assets.pid");

if (!existsSync(python)) {
  console.error("FastAPI 가상환경이 없습니다. 먼저 `pnpm setup:backend`를 실행해 주세요.");
  process.exit(1);
}
if (!existsSync(nextCli) || !existsSync(path.join(root, ".next"))) {
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
  } catch {
    unlinkSync(pidFile);
  }
}
writeFileSync(pidFile, String(process.pid));

const backend = spawn(python, ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000"], { cwd: root, stdio: "inherit" });
const frontend = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", "3000"], { cwd: root, stdio: "inherit" });

let stopping = false;
function cleanup() {
  if (existsSync(pidFile)) unlinkSync(pidFile);
}
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  backend.kill(signal);
  frontend.kill(signal);
  cleanup();
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("exit", cleanup);
backend.on("exit", (code) => { stop(); process.exit(code ?? 0); });
frontend.on("exit", (code) => { stop(); process.exit(code ?? 0); });
