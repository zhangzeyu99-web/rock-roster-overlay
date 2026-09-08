import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { extractFile } from "@electron/asar";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const info = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const release = path.join(root, "release", `s4-${info.version}`);
const resources = path.join(release, "win-unpacked", "resources");
const archive = path.join(resources, "app.asar");
const evidence = path.join(root, "release-evidence", "s4-development");
const runtime = JSON.parse(await fs.readFile(path.join(evidence, "native-runtime-qa.json"), "utf8"));
assert.equal(runtime.ok, true);
assert.equal(runtime.version, info.version);
const hash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
let filesChecked = 0;
for (const folder of ["dist", "dist-electron"]) {
  for (const file of await filesUnder(path.join(root, folder))) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const expected = hash(await fs.readFile(file));
    assert.equal(hash(extractFile(archive, relative.split("/").join(path.sep))), expected, relative);
    if (runtime.buildHashes[relative]) assert.equal(runtime.buildHashes[relative], expected, `native evidence ${relative}`);
    filesChecked++;
  }
}
const packagedInfo = JSON.parse(extractFile(archive, "package.json").toString("utf8"));
assert.equal(packagedInfo.version, info.version);
for (const file of await filesUnder(path.join(root, "seed-data"))) {
  const relative = path.relative(path.join(root, "seed-data"), file);
  assert.equal(hash(await fs.readFile(path.join(resources, "seed-data", relative))), hash(await fs.readFile(file)), relative);
  filesChecked++;
}
const installer = path.join(release, `阵容叠加器 Setup ${info.version}.exe`);
const buffer = await fs.readFile(installer);
assert.equal(buffer.subarray(0, 2).toString(), "MZ");
assert.ok(buffer.length > 140 * 1024 * 1024);
const result = { ok: true, version: info.version, filesChecked, installer, bytes: buffer.length,
  sha256: hash(buffer), nativeRuntimeChecks: runtime.checks.length,
  boundary: "Packaged payload matches the build verified in isolated Electron. Installer installation is not performed." };
await fs.writeFile(path.join(evidence, "package-qa.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));

async function filesUnder(folder) {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}
