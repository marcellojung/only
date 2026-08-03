import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const windows = process.platform === "win32";
const python = path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python");

if (!existsSync(python)) {
  console.error("FastAPI 가상환경이 없습니다. 먼저 `pnpm setup:backend`를 실행해 주세요.");
  process.exit(1);
}

const result = spawnSync(python, ["-m", "pytest", "backend/tests", "-q"], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
