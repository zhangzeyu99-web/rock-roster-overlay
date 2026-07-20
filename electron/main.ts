import { BrowserWindow, Menu, app, ipcMain, screen, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CaptureMode, RosterProject, SlotHealth, TeamSide } from "../src/types";
import { createAsyncGate } from "../src/core/asyncGate";
import { getCaptureCanvasSize } from "../src/core/captureGeometry";
import { getCaptureWindowOptions } from "../src/core/captureWindow";
import {
  activateProject,
  ensureStore,
  exportProjectPresetFromDialog,
  exportHudImageFromDialog,
  getExportPath,
  importAssetsFromDialog,
  importBackgroundFromDialog,
  importHudImageFromDialog,
  importProjectPresetFromDialog,
  readProject,
  readState,
  writeProject,
  type StorePaths
} from "./dataStore";
import { startHttpServer, type ExportMode, type HttpServerHandle } from "./httpServer";
import { flushLiveState, resetLiveHealth, writeSlotHealth } from "./liveStateStore";
import { RuntimeCacheMonitor } from "./runtimeMonitor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appRoot = app.isPackaged ? app.getAppPath() : path.join(__dirname, "..");
const rendererRoot = isDev ? path.join(__dirname, "../dist") : path.join(appRoot, "dist");
const publicRoot = isDev ? path.join(__dirname, "../public") : rendererRoot;

let mainWindow: BrowserWindow | undefined;
let obsWindow: BrowserWindow | undefined;
let obsWindowMode: ExportMode | undefined;
let controlWindow: BrowserWindow | undefined;
let controlWindowAlwaysOnTop = true;
let server: HttpServerHandle | undefined;
let runtimeCacheMonitor: RuntimeCacheMonitor | undefined;
let storePaths: StorePaths | undefined;
const runObsWindowOpenExclusive = createAsyncGate();
const runControlWindowOpenExclusive = createAsyncGate();

async function createWindow() {
  const preload = path.join(__dirname, "preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: "阵容叠加器",
    backgroundColor: "#f7f9fc",
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

async function loadRendererRoute(window: BrowserWindow, route: string): Promise<void> {
  if (isDev) {
    const target = new URL(route, process.env.VITE_DEV_SERVER_URL!);
    await window.loadURL(target.toString());
    return;
  }
  await window.loadFile(path.join(__dirname, "../dist/index.html"), { hash: route });
}

async function exportPng(mode: ExportMode): Promise<string> {
  if (!server) {
    throw new Error("本地服务尚未启动");
  }

  const [project] = await Promise.all([readState(server.origin)]);
  const canvasSize = getCaptureCanvasSize(mode, project.project.style.resolution);
  const width = canvasSize.width;
  const height = canvasSize.height;
  const filePath = await getExportPath(mode);
  const exportWindow = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    paintWhenInitiallyHidden: true,
    transparent: true,
    frame: false,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  const url = `${server.origin}/overlay/default?mode=${mode}&export=1`;
  try {
    exportWindow.setContentSize(width, height);
    await exportWindow.loadURL(url);
    await waitForOverlayReady(exportWindow);
    const image = await exportWindow.webContents.capturePage();
    await fs.writeFile(filePath, image.toPNG());
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
  return filePath;
}

async function openObsWindow(mode: ExportMode = "overlay"): Promise<void> {
  return runObsWindowOpenExclusive(() => openObsWindowUnlocked(mode));
}

async function openControlWindow(): Promise<void> {
  return runControlWindowOpenExclusive(openControlWindowUnlocked);
}

async function openControlWindowUnlocked(): Promise<void> {
  const preload = path.join(__dirname, "preload.cjs");
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.show();
    controlWindow.focus();
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const width = clamp(Math.round(workArea.width * 0.22), 390, 460);
  const height = clamp(Math.round(workArea.height * 0.74), 700, 820);
  const nextWindow = new BrowserWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 620,
    useContentSize: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: controlWindowAlwaysOnTop,
    backgroundColor: "#00000000",
    title: "直播快捷控制",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  controlWindow = nextWindow;
  nextWindow.setPosition(workArea.x + workArea.width - width - 28, workArea.y + Math.round((workArea.height - height) / 2));
  nextWindow.setAlwaysOnTop(controlWindowAlwaysOnTop, "screen-saver");
  nextWindow.on("closed", () => {
    if (controlWindow === nextWindow) {
      controlWindow = undefined;
    }
  });

  await loadRendererRoute(nextWindow, "/control");
}

function broadcastRendererStateChanged(): void {
  mainWindow?.webContents.send("state-changed");
  controlWindow?.webContents.send("state-changed");
}

function broadcastRuntimeCacheChanged(): void {
  const status = runtimeCacheMonitor?.getStatus();
  if (!status) {
    return;
  }
  mainWindow?.webContents.send("runtime-cache-changed", status);
  controlWindow?.webContents.send("runtime-cache-changed", status);
}

async function releaseRendererMemory(): Promise<void> {
  const windows = [mainWindow, controlWindow, obsWindow].filter(
    (window): window is BrowserWindow => Boolean(window && !window.isDestroyed())
  );
  await Promise.all(
    windows.map((window) =>
      window.webContents
        .executeJavaScript('window.dispatchEvent(new Event("rock-roster-release-memory")); true', true)
        .catch(() => undefined)
    )
  );
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
}

async function openObsWindowUnlocked(mode: ExportMode = "overlay"): Promise<void> {
  if (!server) {
    throw new Error("Local HTTP server is not ready");
  }

  if (obsWindow && !obsWindow.isDestroyed() && obsWindowMode !== mode) {
    obsWindow.destroy();
    obsWindow = undefined;
    obsWindowMode = undefined;
  }

  if (obsWindow && !obsWindow.isDestroyed()) {
    await syncObsWindowOptions();
    obsWindow.show();
    obsWindow.focus();
    return;
  }

  const project = await readProject();
  const windowOptions = getCaptureWindowOptions(mode, project.style.obsWindow, project.style.resolution);

  const nextWindow = new BrowserWindow({
    width: windowOptions.width,
    height: windowOptions.height,
    minWidth: 240,
    minHeight: 360,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: windowOptions.alwaysOnTop,
    backgroundColor: "#00000000",
    title: "OBS Roster Capture",
    webPreferences: {
      backgroundThrottling: false
    }
  });

  obsWindow = nextWindow;
  obsWindow.setIgnoreMouseEvents(windowOptions.ignoreMouseEvents, { forward: true });
  obsWindowMode = mode;
  nextWindow.on("closed", () => {
    if (obsWindow === nextWindow) {
      obsWindow = undefined;
      obsWindowMode = undefined;
    }
  });
  nextWindow.webContents.on("context-menu", () => {
    if (obsWindow !== nextWindow || nextWindow.isDestroyed()) {
      return;
    }
    Menu.buildFromTemplate([
      {
        label: "临时开启鼠标穿透",
        click: () => nextWindow.setIgnoreMouseEvents(true, { forward: true })
      },
      {
        label: "关闭采集窗口",
        click: () => nextWindow.close()
      }
    ]).popup({ window: nextWindow });
  });

  await nextWindow.loadURL(`${server.origin}/overlay/default?mode=${mode}&export=1&capture=window`);
}

async function syncObsWindowOptions(): Promise<void> {
  if (!obsWindow || obsWindow.isDestroyed()) {
    return;
  }

  const project = await readProject();
  const mode = obsWindowMode ?? "overlay";
  const windowOptions = getCaptureWindowOptions(mode, project.style.obsWindow, project.style.resolution);
  obsWindow.setContentSize(windowOptions.width, windowOptions.height);
  obsWindow.setAlwaysOnTop(windowOptions.alwaysOnTop, "screen-saver");
  obsWindow.setIgnoreMouseEvents(windowOptions.ignoreMouseEvents, { forward: true });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const paths = await ensureStore();
  storePaths = paths;
  server = await startHttpServer({
    paths,
    publicRoot,
    rendererRoot,
    getMainWindow: () => mainWindow,
    exportPng
  });

  ipcMain.handle("state:get", () => readState(server!.origin));
  ipcMain.handle("project:save", async (_event, project: RosterProject) => {
    const saved = await writeProject(project);
    broadcastRendererStateChanged();
    server?.broadcastStateChanged();
    await syncObsWindowOptions().catch(() => undefined);
    return saved;
  });
  ipcMain.handle("project:activate", async (_event, projectId: string) => {
    const active = await activateProject(projectId);
    broadcastRendererStateChanged();
    server?.broadcastStateChanged();
    await syncObsWindowOptions().catch(() => undefined);
    return active;
  });
  ipcMain.handle("assets:import", async () => {
    const result = await importAssetsFromDialog();
    broadcastRendererStateChanged();
    server?.broadcastStateChanged();
    return result;
  });
  ipcMain.handle("background:import", () => importBackgroundFromDialog());
  ipcMain.handle("hud-image:import", () => importHudImageFromDialog());
  ipcMain.handle("hud-image:export", (_event, payload: { imagePath: string; suggestedName?: string }) =>
    exportHudImageFromDialog(payload.imagePath, payload.suggestedName, publicRoot)
  );
  ipcMain.handle("png:export", (_event, mode: CaptureMode) => exportPng(mode));
  ipcMain.handle("project-preset:export", (_event, project: RosterProject) =>
    exportProjectPresetFromDialog(project)
  );
  ipcMain.handle("project-preset:import", async () => {
    const result = await importProjectPresetFromDialog();
    if (result) {
      broadcastRendererStateChanged();
      server?.broadcastStateChanged();
      await syncObsWindowOptions().catch(() => undefined);
    }
    return result;
  });
  ipcMain.handle(
    "live-state:update-health",
    async (
      _event,
      payload: { projectId?: string; side: TeamSide; index: number; health: Partial<SlotHealth> }
    ) => {
      if (!storePaths) {
        throw new Error("Store is not ready");
      }
      const project = await readProject();
      const liveState = await writeSlotHealth(
        storePaths,
        payload.projectId || project.id,
        payload.side,
        payload.index,
        payload.health
      );
      broadcastRendererStateChanged();
      server?.broadcastStateChanged();
      return liveState;
    }
  );
  ipcMain.handle("live-state:reset-health", async (_event, projectId?: string) => {
    if (!storePaths) {
      throw new Error("Store is not ready");
    }
    const project = await readProject();
    const liveState = await resetLiveHealth(storePaths, projectId || project.id);
    broadcastRendererStateChanged();
    server?.broadcastStateChanged();
    return liveState;
  });
  ipcMain.handle("obs-window:open", (_event, mode: CaptureMode) => openObsWindow(mode));
  ipcMain.handle("obs-window:close", () => {
    obsWindow?.close();
  });
  ipcMain.handle("control-window:open", () => openControlWindow());
  ipcMain.handle("control-window:set-always-on-top", (_event, alwaysOnTop: boolean) => {
    controlWindowAlwaysOnTop = alwaysOnTop;
    controlWindow?.setAlwaysOnTop(alwaysOnTop, "screen-saver");
  });
  ipcMain.handle("control-window:focus-main", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  ipcMain.handle("control-window:minimize", () => {
    controlWindow?.minimize();
  });
  ipcMain.handle("control-window:close", () => {
    controlWindow?.close();
  });
  ipcMain.handle("runtime-cache:get", () => runtimeCacheMonitor?.getStatus());
  ipcMain.handle("runtime-cache:clear", () => runtimeCacheMonitor?.clearNow("manual"));
  ipcMain.handle("path:reveal", async (_event, filePath: string) => {
    const targetPath = path.resolve(filePath);
    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        const openError = await shell.openPath(targetPath);
        if (openError) {
          throw new Error(openError);
        }
        return;
      }
    } catch {
      // Missing files still fall through to the shell reveal behavior.
    }
    shell.showItemInFolder(targetPath);
  });

  await createWindow();
  runtimeCacheMonitor = new RuntimeCacheMonitor(() => broadcastRuntimeCacheChanged(), undefined, releaseRendererMemory);
  runtimeCacheMonitor.start();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  runtimeCacheMonitor?.stop();
  obsWindow?.destroy();
  controlWindow?.destroy();
  if (storePaths) {
    await flushLiveState(storePaths).catch(() => undefined);
  }
  await server?.close().catch(() => undefined);
});

async function waitForOverlayReady(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const timeout = window.setTimeout(finish, 10000);
      const waitCards = () => new Promise((cardsResolve) => {
        if (document.querySelector(".roster-card, .room-scene")) {
          cardsResolve(undefined);
          return;
        }
        const observer = new MutationObserver(() => {
          if (document.querySelector(".roster-card, .room-scene")) {
            observer.disconnect();
            cardsResolve(undefined);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      const waitImages = () => Promise.all(
        Array.from(document.querySelectorAll("img.pet-art, img.room-background-image")).map(async (image) => {
          if (image.complete && image.naturalWidth > 0) {
            await image.decode?.().catch(() => undefined);
            return;
          }
          await new Promise((imageResolve) => {
            image.addEventListener("load", imageResolve, { once: true });
            image.addEventListener("error", imageResolve, { once: true });
          });
          await image.decode?.().catch(() => undefined);
        })
      );
      const waitFonts = () => document.fonts?.ready ?? Promise.resolve();
      waitCards().then(waitImages).then(() => {
        return waitFonts();
      }).then(() => {
        void document.body.offsetHeight;
        window.clearTimeout(timeout);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.setTimeout(finish, 1200);
        }));
      }).catch(finish);
    })
  `);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
