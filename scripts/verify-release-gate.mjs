import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageInfo = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const strict = process.argv.includes("--strict");
const errors = [];
const warnings = [];
const checks = [];

const requiredScripts = [
  "assets:quality",
  "visual:evidence",
  "release:gate",
  "release:bot",
  "test",
  "lint",
  "e2e",
  "build",
  "dist",
  "verify:package"
];

for (const name of requiredScripts) {
  if (!packageInfo.scripts?.[name]) {
    errors.push(`package script missing: ${name}`);
  }
}
checks.push(["package scripts", requiredScripts.length]);

await assertTextFile("docs/feishu-delivery.md", [
  "安装包默认不分包",
  "drive +upload",
  "drive +inspect",
  "链接读回校验"
]);
await assertTextFile("README.md", ["OBS", "PNG", "直播间", "透明窗口"]);
await assertTextFile("scripts/verify-packaged-current.mjs", [
  "assertPreviewCanvasRatio",
  "assertRoomTextDoesNotOverlapRoster",
  "assertElementIconGeometry",
  "assertTransparentCenter"
]);

const evidenceDir = path.join(root, "release-evidence", `v${packageInfo.version}`);
const evidenceExists = await exists(evidenceDir);
if (!evidenceExists) {
  const message = `visual evidence dir missing: ${evidenceDir}`;
  strict ? errors.push(message) : warnings.push(message);
} else {
  for (const fileName of [
    "desktop-gui.png",
    "obs-left-source.png",
    "obs-right-source.png",
    "obs-both-source.png",
    "obs-room-source.png",
    "obs-transparent-window.png",
    "floating-control.png",
    `verify-packaged-v${packageInfo.version.replaceAll(".", "")}.json`
  ]) {
    const filePath = path.join(evidenceDir, fileName);
    if (!(await exists(filePath))) {
      const message = `visual evidence file missing: ${filePath}`;
      strict ? errors.push(message) : warnings.push(message);
    }
  }
  checks.push(["visual evidence dir", evidenceDir]);
}

const installerPath =
  process.env.ROSTER_INSTALLER_PATH ||
  path.join(
    "D:\\rock-roster-overlay-release",
    `v${packageInfo.version}`,
    `阵容叠加器 Setup ${packageInfo.version}.exe`
  );
if (await exists(installerPath)) {
  const stat = await fs.stat(installerPath);
  const hash = await sha256File(installerPath);
  if (stat.size < 140 * 1024 * 1024) {
    errors.push(`installer too small: ${stat.size} bytes`);
  }
  checks.push(["installer", installerPath]);
  checks.push(["installer size", `${(stat.size / 1024 / 1024).toFixed(2)} MB`]);
  checks.push(["installer sha256", hash]);
} else {
  const message = `installer missing: ${installerPath}`;
  strict ? errors.push(message) : warnings.push(message);
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, version: packageInfo.version, errors, warnings, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, version: packageInfo.version, warnings, checks }, null, 2));

async function assertTextFile(relativePath, needles) {
  const filePath = path.join(root, relativePath);
  let text;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    errors.push(`${relativePath} missing: ${error.message}`);
    return;
  }
  for (const needle of needles) {
    if (!text.includes(needle)) {
      errors.push(`${relativePath} missing text: ${needle}`);
    }
  }
  checks.push([relativePath, "ok"]);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex").toUpperCase();
}
