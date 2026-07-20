import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageInfo = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const evidenceDir = process.env.ROSTER_EVIDENCE_DIR
  ? path.resolve(root, process.env.ROSTER_EVIDENCE_DIR)
  : path.join(root, "release-evidence", `v${packageInfo.version}`);

const requiredScreenshots = [
  {
    file: "desktop-gui.png",
    minWidth: 1200,
    minHeight: 720,
    minVisibleRatio: 0.35
  },
  {
    file: "obs-left-source.png",
    width: 420,
    height: 1080,
    minVisibleRatio: 0.04
  },
  {
    file: "obs-right-source.png",
    width: 420,
    height: 1080,
    minVisibleRatio: 0.04
  },
  {
    file: "obs-both-source.png",
    width: 1920,
    height: 1080,
    minVisibleRatio: 0.035,
    transparentCenter: true
  },
  {
    file: "obs-room-source.png",
    width: 1920,
    height: 1080,
    minVisibleRatio: 0.8
  },
  {
    file: "obs-transparent-window.png",
    width: 1920,
    minHeight: 1000,
    minVisibleRatio: 0.035,
    transparentCenter: true
  },
  {
    file: "floating-control.png",
    minWidth: 360,
    minHeight: 560,
    minVisibleRatio: 0.25
  }
];

const errors = [];
const checks = [];

for (const expected of requiredScreenshots) {
  const filePath = path.join(evidenceDir, expected.file);
  try {
    const buffer = await fs.readFile(filePath);
    const stats = inspectPng(buffer);
    if (expected.width && stats.width !== expected.width) {
      errors.push(`${expected.file} width=${stats.width}, expected=${expected.width}`);
    }
    if (expected.height && stats.height !== expected.height) {
      errors.push(`${expected.file} height=${stats.height}, expected=${expected.height}`);
    }
    if (expected.minWidth && stats.width < expected.minWidth) {
      errors.push(`${expected.file} width=${stats.width}, min=${expected.minWidth}`);
    }
    if (expected.minHeight && stats.height < expected.minHeight) {
      errors.push(`${expected.file} height=${stats.height}, min=${expected.minHeight}`);
    }
    if (stats.visibleRatio < expected.minVisibleRatio) {
      errors.push(
        `${expected.file} visibleRatio=${stats.visibleRatio.toFixed(4)}, min=${expected.minVisibleRatio}`
      );
    }
    if (expected.transparentCenter && stats.centerAlpha !== 0) {
      errors.push(`${expected.file} center alpha=${stats.centerAlpha}, expected=0`);
    }
    checks.push({ file: expected.file, ...stats });
  } catch (error) {
    errors.push(`${expected.file} missing or unreadable: ${error.message}`);
  }
}

const verifyFile = path.join(
  evidenceDir,
  `verify-packaged-v${packageInfo.version.replaceAll(".", "")}.json`
);
try {
  const verify = JSON.parse(await fs.readFile(verifyFile, "utf8"));
  const labels = new Set(verify.checks?.map((entry) => entry[0]) ?? []);
  for (const label of [
    "preview canvas ratio",
    "preview labels readable",
    "asset virtual rows",
    "obs left layout",
    "obs room no text-roster overlap",
    "png export",
    "transparent window cards",
    "floating control controls",
    "floating control obs sync"
  ]) {
    if (!labels.has(label)) {
      errors.push(`verify package record missing check: ${label}`);
    }
  }
} catch (error) {
  errors.push(`verify package record missing or unreadable: ${error.message}`);
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, evidenceDir, errors, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, evidenceDir, checks }, null, 2));

function inspectPng(buffer) {
  const png = PNG.sync.read(buffer);
  const total = png.width * png.height;
  let visible = 0;
  for (let offset = 3; offset < png.data.length; offset += 4) {
    if (png.data[offset] > 8) {
      visible += 1;
    }
  }
  const centerX = Math.floor(png.width / 2);
  const centerY = Math.floor(png.height / 2);
  const centerAlpha = png.data[(centerY * png.width + centerX) * 4 + 3];
  return {
    width: png.width,
    height: png.height,
    visibleRatio: visible / total,
    centerAlpha
  };
}
