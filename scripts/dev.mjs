import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const windows = process.platform === "win32";
const python = path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python");

if (!existsSync(python)) {
  console.error("FastAPI 가상환경이 없습니다. 먼저 `pnpm setup:backend`를 실행해 주세요.");
  process.exit(1);
}

const backend = spawn(python, ["-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], { cwd: root, stdio: "inherit" });
const frontend = spawn(windows ? "pnpm.cmd" : "pnpm", ["dev"], { cwd: root, stdio: "inherit" });

function stop(signal = "SIGTERM") {
  backend.kill(signal);
  frontend.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
backend.on("exit", (code) => { frontend.kill(); process.exit(code ?? 0); });
frontend.on("exit", (code) => { backend.kill(); process.exit(code ?? 0); });
