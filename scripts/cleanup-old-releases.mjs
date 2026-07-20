import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageInfo = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const currentVersionDir = `v${packageInfo.version}`;
const execute = process.argv.includes("--yes");

const releaseRoot = path.resolve(process.env.ROSTER_RELEASE_ROOT || "D:\\rock-roster-overlay-release");
const evidenceRoot = path.join(root, "release-evidence");
const appDataRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, "rock-roster-overlay")
  : undefined;

const cacheDirNames = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "blob_storage",
  "Shared Dictionary"
];

const targets = [
  ...(await oldVersionDirs(releaseRoot)),
  ...(await oldVersionDirs(evidenceRoot)),
  ...(appDataRoot ? cacheDirNames.map((name) => path.join(appDataRoot, name)) : [])
];

const planned = [];
const deleted = [];
const missing = [];

for (const target of targets) {
  const allowedRoot = allowedRootFor(target);
  if (!allowedRoot) {
    throw new Error(`Refusing to clean outside known roots: ${target}`);
  }
  if (!(await exists(target))) {
    missing.push(target);
    continue;
  }
  assertInsideRoot(target, allowedRoot);
  if (execute) {
    await fs.rm(target, { recursive: true, force: true });
    deleted.push(target);
  } else {
    planned.push(target);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun: !execute,
      currentVersion: packageInfo.version,
      kept: [path.join(releaseRoot, currentVersionDir), path.join(evidenceRoot, currentVersionDir)],
      planned,
      deleted,
      missing
    },
    null,
    2
  )
);

async function oldVersionDirs(parent) {
  if (!(await exists(parent))) {
    return [];
  }
  const entries = await fs.readdir(parent, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name) && name !== currentVersionDir)
    .map((name) => path.join(parent, name));
}

function allowedRootFor(target) {
  const roots = [releaseRoot, evidenceRoot, appDataRoot].filter(Boolean);
  return roots.find((candidate) => isInsideRoot(target, candidate));
}

function assertInsideRoot(target, rootPath) {
  if (!isInsideRoot(target, rootPath)) {
    throw new Error(`Refusing to clean ${target}; expected it under ${rootPath}`);
  }
}

function isInsideRoot(target, rootPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
