import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const windows = process.platform === "win32";
const venvPython = path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python");

if (!existsSync(venvPython)) {
  const command = windows ? "py" : "python3";
  const args = windows ? ["-3", "-m", "venv", ".venv"] : ["-m", "venv", ".venv"];
  const created = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (created.status !== 0) process.exit(created.status ?? 1);
}

const installed = spawnSync(venvPython, ["-m", "pip", "install", "-r", "backend/requirements.txt"], { cwd: root, stdio: "inherit" });
process.exit(installed.status ?? 1);
