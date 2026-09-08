import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", "[Environment]::GetFolderPath('MyDocuments')"], { windowsHide: true });
const data = path.join(stdout.trim(), "RockRosterOverlay", "data");
const backup = path.join(root, "tmp", `package-profile-backup-${Date.now()}`);
await fs.mkdir(backup, { recursive: true });
const saved = new Map();
for (const entry of await fs.readdir(data, { withFileTypes: true }).catch((error) => { if (error.code === "ENOENT") return []; throw error; })) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
  const bytes = await fs.readFile(path.join(data, entry.name));
  saved.set(entry.name, bytes);
  await fs.writeFile(path.join(backup, entry.name), bytes);
}
let code;
try {
  code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/verify-packaged-current.mjs")], {
      cwd: root, stdio: "inherit", windowsHide: true,
      env: { ...process.env, ROSTER_QA_USER_DATA: path.join(backup, "userData") }
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
} finally {
  for (const name of await fs.readdir(data)) {
    if (name.endsWith(".json") && !saved.has(name)) await fs.unlink(path.join(data, name));
  }
  for (const [name, bytes] of saved) {
    await fs.writeFile(path.join(data, name), bytes);
    assert.deepEqual(await fs.readFile(path.join(data, name)), bytes, `Restore original ${name}`);
  }
  console.log(JSON.stringify({ profileRestored: true, files: saved.size, backup }));
}
process.exitCode = code ?? 1;
