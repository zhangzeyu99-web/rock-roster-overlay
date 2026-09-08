import { app, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppState,
  CaptureMode,
  ImportResult,
  PetAsset,
  ProjectCollection,
  ProjectPresetTransferResult,
  RosterProject
} from "../src/types";
import { detectDuplicateNames, validateAssetFileName } from "../src/core/assets";
import { normalizePetName } from "../src/core/matching";
import { createDefaultRosterProject } from "../src/core/project";
import { createProjectPresetFile, parseProjectPresetFile } from "../src/core/projectPresetTransfer";
import { builtinLeftPlayerAvatar, builtinRightPlayerAvatar, builtinRoomTitle, builtinS4RoomTitle } from "../src/core/room";
import {
  activateProjectInCollection,
  getActiveProject,
  normalizeProject,
  normalizeProjectCollection,
  upsertProjectInCollection
} from "../src/core/projectPresets";
import { readLiveState } from "./liveStateStore";
import { isPathWithinRoot } from "./security";

const supportedImageExtensions = new Set([".png", ".webp"]);
const supportedBackgroundExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
let storeReadyPromise: Promise<StorePaths> | undefined;
let assetsCache: PetAsset[] | undefined;
let projectCollectionCache: ProjectCollection | undefined;
let defaultProjectCache: RosterProject | undefined;
const worldPokedexSourceMarkers = ["4399 洛克王国：世界", "BWIKI 精灵图鉴"];

export interface StorePaths {
  dataDir: string;
  assetsDir: string;
  avatarsDir: string;
  backgroundsDir: string;
  hudImagesDir: string;
  dataFile: string;
  projectFile: string;
  projectsFile: string;
  exportDir: string;
}

export function getStorePaths(): StorePaths {
  const documents = app.getPath("documents");
  const dataDir = path.join(documents, "RockRosterOverlay");
  return {
    dataDir,
    assetsDir: path.join(dataDir, "assets", "pets"),
    avatarsDir: path.join(dataDir, "assets", "avatars"),
    backgroundsDir: path.join(dataDir, "assets", "backgrounds"),
    hudImagesDir: path.join(dataDir, "assets", "hud"),
    dataFile: path.join(dataDir, "data", "pets.json"),
    projectFile: path.join(dataDir, "data", "project-default.json"),
    projectsFile: path.join(dataDir, "data", "projects.json"),
    exportDir: path.join(dataDir, "exports")
  };
}

export async function ensureStore(): Promise<StorePaths> {
  if (!storeReadyPromise) {
    storeReadyPromise = initializeStore().catch((error) => {
      storeReadyPromise = undefined;
      throw error;
    });
  }
  return storeReadyPromise;
}

async function initializeStore(): Promise<StorePaths> {
  const paths = getStorePaths();
  await fs.mkdir(paths.assetsDir, { recursive: true });
  await fs.mkdir(paths.avatarsDir, { recursive: true });
  await fs.mkdir(paths.backgroundsDir, { recursive: true });
  await fs.mkdir(paths.hudImagesDir, { recursive: true });
  await fs.mkdir(path.dirname(paths.dataFile), { recursive: true });
  await fs.mkdir(paths.exportDir, { recursive: true });

  if (!(await exists(paths.dataFile))) {
    await writeJson(paths.dataFile, []);
  }
  if (!(await exists(paths.projectFile))) {
    await writeJson(paths.projectFile, createDefaultRosterProject());
  }
  if (!(await exists(paths.projectsFile))) {
    await writeJson(
      paths.projectsFile,
      normalizeProjectCollection(undefined, await readJson<RosterProject>(paths.projectFile, createDefaultRosterProject()))
    );
  }

  await seedWorldPokedexIfNeeded(paths);

  return paths;
}

export async function readState(serverUrl: string): Promise<AppState> {
  const paths = await ensureStore();
  const collection = await readProjectCollection();
  const project = getActiveProject(collection);
  return {
    project,
    projects: collection.projects,
    activeProjectId: collection.activeProjectId,
    assets: await readAssets(),
    liveState: await readLiveState(paths, project.id),
    dataDir: paths.dataDir,
    exportDir: paths.exportDir,
    serverUrl
  };
}

export async function readAssets(): Promise<PetAsset[]> {
  const paths = await ensureStore();
  if (assetsCache) {
    return assetsCache;
  }
  assetsCache = await readJson<PetAsset[]>(paths.dataFile, []);
  return assetsCache;
}

export async function writeAssets(assets: PetAsset[]): Promise<void> {
  const paths = await ensureStore();
  await writeJson(paths.dataFile, assets);
  assetsCache = assets;
}

export async function readProject(): Promise<RosterProject> {
  return getActiveProject(await readProjectCollection());
}

export async function writeProject(project: RosterProject): Promise<RosterProject> {
  const next = upsertProjectInCollection(await readProjectCollection(), project);
  await writeProjectCollection(next);
  return getActiveProject(next);
}

export async function activateProject(projectId: string): Promise<RosterProject> {
  const next = activateProjectInCollection(await readProjectCollection(), projectId);
  await writeProjectCollection(next);
  return getActiveProject(next);
}

export async function exportProjectPresetFromDialog(
  project: RosterProject
): Promise<ProjectPresetTransferResult | undefined> {
  const paths = await ensureStore();
  const preset = createProjectPresetFile(project, { appVersion: app.getVersion() });
  const result = await dialog.showSaveDialog({
    title: "导出项目预设",
    defaultPath: path.join(paths.exportDir, `${sanitizeFileName(preset.project.name)}.rock-roster-preset.json`),
    filters: [{ name: "阵容叠加器预设", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) {
    return undefined;
  }

  await writeJson(result.filePath, preset);
  return { filePath: result.filePath, project: preset.project };
}

export async function importProjectPresetFromDialog(): Promise<ProjectPresetTransferResult | undefined> {
  const result = await dialog.showOpenDialog({
    title: "导入项目预设",
    properties: ["openFile"],
    filters: [{ name: "阵容叠加器预设", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return undefined;
  }

  const filePath = result.filePaths[0];
  const raw = (await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  const importedProject = parseProjectPresetFile(JSON.parse(raw));
  const next = upsertProjectInCollection(await readProjectCollection(), importedProject);
  await writeProjectCollection(next);
  return { filePath, project: getActiveProject(next) };
}

export async function readProjectCollection(): Promise<ProjectCollection> {
  const paths = await ensureStore();
  if (projectCollectionCache) {
    return projectCollectionCache;
  }
  const fallbackProject =
    defaultProjectCache ?? (await readJson<RosterProject>(paths.projectFile, createDefaultRosterProject()));
  defaultProjectCache = fallbackProject;
  projectCollectionCache = normalizeProjectCollection(
    await readJson<ProjectCollection | undefined>(paths.projectsFile, undefined),
    fallbackProject
  );
  return projectCollectionCache;
}

async function writeProjectCollection(collection: ProjectCollection): Promise<void> {
  const paths = await ensureStore();
  const normalized = normalizeProjectCollection(collection);
  const activeProject = getActiveProject(normalized);
  await writeJson(paths.projectsFile, normalized);
  await writeJson(paths.projectFile, activeProject);
  projectCollectionCache = normalized;
  defaultProjectCache = activeProject;
}

export async function importAssetsFromDialog(): Promise<ImportResult | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择精灵透明素材文件夹",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return undefined;
  }

  return importAssetsFromFolder(result.filePaths[0]);
}

export async function importBackgroundFromDialog(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择直播间背景图",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return undefined;
  }

  const paths = await ensureStore();
  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  if (!supportedBackgroundExtensions.has(extension)) {
    throw new Error("背景只支持 PNG/JPG/WebP");
  }

  const fileName = `room-background-${randomUUID()}${extension}`;
  await fs.copyFile(sourcePath, path.join(paths.backgroundsDir, fileName));
  return fileName;
}

export async function importHudImageFromDialog(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择直播间 HUD 图片",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return undefined;
  }

  const paths = await ensureStore();
  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  if (!supportedBackgroundExtensions.has(extension)) {
    throw new Error("HUD 图片只支持 PNG/JPG/WebP");
  }

  const fileName = `room-hud-${randomUUID()}${extension}`;
  await fs.copyFile(sourcePath, path.join(paths.hudImagesDir, fileName));
  return `assets/hud/${fileName}`;
}

export async function exportHudImageFromDialog(
  imagePath: string,
  suggestedName: string | undefined,
  publicRoot: string
): Promise<string | undefined> {
  const paths = await ensureStore();
  const sourcePath = await resolveHudImageFilePath(imagePath, publicRoot);
  if (!sourcePath) {
    throw new Error("当前头像图文件不存在，无法导出");
  }

  const extension = path.extname(sourcePath).toLowerCase() || ".png";
  const baseName = sanitizeFileName(suggestedName || path.basename(sourcePath, extension) || "room-hud-image");
  const result = await dialog.showSaveDialog({
    title: "导出 HUD 图片",
    defaultPath: path.join(paths.exportDir, `${baseName}${extension}`),
    filters: [{ name: "图片", extensions: [extension.replace(/^\./, "")] }]
  });

  if (result.canceled || !result.filePath) {
    return undefined;
  }

  await fs.copyFile(sourcePath, result.filePath);
  return result.filePath;
}

export async function importAssetsFromFolder(folder: string): Promise<ImportResult> {
  const paths = await ensureStore();
  const existing = await readAssets();
  const existingNames = new Set(existing.map((asset) => normalizePetName(asset.name)));
  const imported: PetAsset[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const entries = await fs.readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const validation = validateAssetFileName(entry.name);
    if (!validation.ok) {
      skipped.push(entry.name);
      continue;
    }

    const normalizedName = normalizePetName(validation.derivedName);
    if (existingNames.has(normalizedName)) {
      skipped.push(entry.name);
      warnings.push(`重复名称已跳过：${validation.derivedName}`);
      continue;
    }

    const sourcePath = path.join(folder, entry.name);
    const extension = path.extname(entry.name).toLowerCase();
    const safeFileName = `${validation.derivedName}-${randomUUID()}${extension}`;
    const targetPath = path.join(paths.assetsDir, safeFileName);
    await fs.copyFile(sourcePath, targetPath);

    if (!(await hasTransparencySignal(targetPath))) {
      warnings.push(`可能不是透明底：${validation.derivedName}`);
    }

    const asset: PetAsset = {
      id: randomUUID(),
      name: validation.derivedName,
      aliases: [],
      imagePath: safeFileName,
      updatedAt: new Date().toISOString()
    };
    imported.push(asset);
    existingNames.add(normalizedName);
  }

  const assets = [...existing, ...imported];
  await writeAssets(assets);

  return {
    imported,
    skipped,
    duplicates: detectDuplicateNames(assets),
    warnings
  };
}

export async function getAssetFilePath(fileName: string): Promise<string | undefined> {
  const paths = await ensureStore();
  const resolved = path.resolve(paths.assetsDir, fileName);
  if (!isPathWithinRoot(paths.assetsDir, resolved)) {
    return undefined;
  }
  if (!(await exists(resolved))) {
    return undefined;
  }
  return resolved;
}

export async function getAvatarFilePath(fileName: string): Promise<string | undefined> {
  const paths = await ensureStore();
  const resolved = path.resolve(paths.avatarsDir, fileName.replace(/^assets[\\/]avatars[\\/]/, ""));
  if (!isPathWithinRoot(paths.avatarsDir, resolved)) {
    return undefined;
  }
  if (!(await exists(resolved))) {
    return undefined;
  }
  return resolved;
}

export async function getBackgroundFilePath(fileName: string): Promise<string | undefined> {
  const paths = await ensureStore();
  const resolved = path.resolve(paths.backgroundsDir, fileName);
  if (!isPathWithinRoot(paths.backgroundsDir, resolved)) {
    return undefined;
  }
  if (!(await exists(resolved))) {
    return undefined;
  }
  return resolved;
}

export async function getHudImageFilePath(fileName: string): Promise<string | undefined> {
  const paths = await ensureStore();
  const resolved = path.resolve(paths.hudImagesDir, fileName.replace(/^assets[\\/]hud[\\/]/, ""));
  if (!isPathWithinRoot(paths.hudImagesDir, resolved)) {
    return undefined;
  }
  if (!(await exists(resolved))) {
    return undefined;
  }
  return resolved;
}

export async function getExportPath(mode: CaptureMode): Promise<string> {
  const paths = await ensureStore();
  const fileName =
    mode === "room"
      ? "room-overlay.png"
      : mode === "overlay"
        ? "team-overlay.png"
        : `team-${mode === "left" ? "left" : "right"}.png`;
  return path.join(paths.exportDir, fileName);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = (await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeFileName(name: string): string {
  const sanitized = name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ");
  return sanitized || "rock-roster-preset";
}

async function resolveHudImageFilePath(imagePath: string, publicRoot: string): Promise<string | undefined> {
  const paths = await ensureStore();
  if (imagePath === builtinLeftPlayerAvatar) {
    return path.join(publicRoot, "player-avatars", "roco-player-dimo.png");
  }
  if (imagePath === builtinRightPlayerAvatar) {
    return path.join(publicRoot, "player-avatars", "roco-player-bunny-fit.png");
  }
  if (imagePath === builtinS4RoomTitle) {
    return path.join(publicRoot, "room-titles", "s4-moon-reverie-title.png");
  }
  if (imagePath === builtinRoomTitle) {
    return path.join(publicRoot, "room-titles", "rock-league-title-v1-cutout.png");
  }

  if (/^assets[\\/]hud[\\/]/.test(imagePath)) {
    return getHudImageFilePath(imagePath);
  }
  if (/^assets[\\/]backgrounds[\\/]/.test(imagePath)) {
    return getBackgroundFilePath(imagePath.replace(/^assets[\\/]backgrounds[\\/]/, ""));
  }
  if (/^assets[\\/]avatars[\\/]/.test(imagePath)) {
    return getAvatarFilePath(imagePath);
  }

  const legacyBackgroundPath = path.resolve(paths.backgroundsDir, imagePath);
  if (isPathWithinRoot(paths.backgroundsDir, legacyBackgroundPath) && (await exists(legacyBackgroundPath))) {
    return legacyBackgroundPath;
  }
  const hudPath = path.resolve(paths.hudImagesDir, imagePath);
  if (isPathWithinRoot(paths.hudImagesDir, hudPath) && (await exists(hudPath))) {
    return hudPath;
  }
  return undefined;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasTransparencySignal(filePath: string): Promise<boolean> {
  const extension = path.extname(filePath).toLowerCase();
  if (!supportedImageExtensions.has(extension)) {
    return false;
  }

  const buffer = await fs.readFile(filePath);
  if (extension === ".png") {
    return buffer.length > 25 && (buffer[25] === 4 || buffer[25] === 6);
  }

  if (extension === ".webp") {
    return buffer.includes(Buffer.from("ALPH")) || (buffer[20] & 0b00010000) !== 0;
  }

  return false;
}

async function seedWorldPokedexIfNeeded(paths: StorePaths): Promise<void> {
  const seedRoot = await findSeedDataRoot();
  if (!seedRoot) {
    return;
  }

  const seedDataFile = path.join(seedRoot, "data", "pets.json");
  const seedAssetsDir = path.join(seedRoot, "assets", "pets");
  const seedAvatarsDir = path.join(seedRoot, "assets", "avatars");
  const seedAssets = await readJson<PetAsset[]>(seedDataFile, []);
  if (seedAssets.length === 0 || !(await exists(seedAssetsDir))) {
    return;
  }

  const currentAssets = await readJson<PetAsset[]>(paths.dataFile, []);
  const worldAssetCount = currentAssets.filter(isManagedWorldAsset).length;
  const isEmptyLibrary = currentAssets.length === 0;
  const isOutdatedDefaultLibrary =
    currentAssets.length > 0 && worldAssetCount > 0 && worldAssetCount !== seedAssets.length;
  const isMissingSeedFiles = await hasMissingSeedFiles(seedAssets, paths.assetsDir, paths.avatarsDir);
  const isMissingSeedMetadata = hasMissingSeedMetadata(seedAssets, currentAssets);

  if (!isEmptyLibrary && !isOutdatedDefaultLibrary && !isMissingSeedFiles && !isMissingSeedMetadata) {
    return;
  }

  await copyDirectoryContents(seedAssetsDir, paths.assetsDir);
  if (await exists(seedAvatarsDir)) {
    await copyDirectoryContents(seedAvatarsDir, paths.avatarsDir);
  }
  await copyOptionalSeedReport(seedRoot, paths);

  if (isEmptyLibrary || isOutdatedDefaultLibrary) {
    await writeJson(paths.dataFile, mergeSeedAssets(seedAssets, currentAssets));
    return;
  }

  await writeJson(paths.dataFile, mergeSeedAssets(seedAssets, currentAssets));
}

async function findSeedDataRoot(): Promise<string | undefined> {
  const roots = [
    path.join(process.resourcesPath, "seed-data"),
    path.join(app.getAppPath(), "seed-data"),
    path.join(process.cwd(), "seed-data")
  ];

  for (const root of Array.from(new Set(roots))) {
    if (await exists(path.join(root, "data", "pets.json"))) {
      return root;
    }
  }
  return undefined;
}

async function hasMissingSeedFiles(seedAssets: PetAsset[], assetsDir: string, avatarsDir: string): Promise<boolean> {
  for (const asset of seedAssets) {
    const fileName = asset.imagePath.replace(/^assets\/pets\//, "");
    if (!(await exists(path.join(assetsDir, fileName)))) {
      return true;
    }
    if (asset.avatarPath) {
      const avatarFileName = asset.avatarPath.replace(/^assets\/avatars\//, "");
      if (!(await exists(path.join(avatarsDir, avatarFileName)))) {
        return true;
      }
    }
  }
  return false;
}

function hasMissingSeedMetadata(seedAssets: PetAsset[], currentAssets: PetAsset[]): boolean {
  const currentById = new Map(currentAssets.map((asset) => [asset.id, asset]));
  return seedAssets.some((seedAsset) => {
    if (!seedAsset.avatarPath) {
      return false;
    }
    const current = currentById.get(seedAsset.id);
    return isManagedWorldAsset(current ?? seedAsset) && current?.avatarPath !== seedAsset.avatarPath;
  });
}

function mergeSeedAssets(seedAssets: PetAsset[], currentAssets: PetAsset[]): PetAsset[] {
  const byName = new Set(seedAssets.map((asset) => normalizePetName(asset.name)));
  const customAssets = currentAssets.filter(
    (asset) => !isManagedWorldAsset(asset) && !byName.has(normalizePetName(asset.name))
  );
  return [...seedAssets, ...customAssets];
}

async function copyOptionalSeedReport(seedRoot: string, paths: StorePaths): Promise<void> {
  for (const reportName of ["bwiki-pokedex-report.json", "4399-world-pokedex-report.json", "avatar-manifest.json"]) {
    const reportFile = path.join(seedRoot, "data", reportName);
    if (await exists(reportFile)) {
      await fs.copyFile(reportFile, path.join(path.dirname(paths.dataFile), reportName));
    }
  }
}

function isManagedWorldAsset(asset: PetAsset): boolean {
  return (
    asset.id.startsWith("bwiki-") ||
    asset.id.startsWith("4399-world-") ||
    worldPokedexSourceMarkers.some((marker) => asset.sourceNote?.includes(marker))
  );
}

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContents(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}
