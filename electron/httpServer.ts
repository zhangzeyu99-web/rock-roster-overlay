import express from "express";
import type { Response } from "express";
import type { BrowserWindow } from "electron";
import http from "node:http";
import path from "node:path";
import type { CaptureMode, SlotHealth, TeamSide } from "../src/types";
import { resolveRosterProject } from "../src/core/project";
import {
  activateProject,
  getAssetFilePath,
  getAvatarFilePath,
  getBackgroundFilePath,
  getHudImageFilePath,
  readAssets,
  readProject,
  writeProject,
  type StorePaths
} from "./dataStore";
import { readLiveState, resetLiveHealth, writeSlotHealth } from "./liveStateStore";

export type ExportMode = CaptureMode;

export interface HttpServerHandle {
  port: number;
  origin: string;
  broadcastStateChanged: () => void;
  close: () => Promise<void>;
}

export interface HttpServerOptions {
  paths: StorePaths;
  publicRoot: string;
  rendererRoot: string;
  getMainWindow: () => BrowserWindow | undefined;
  exportPng: (mode: ExportMode) => Promise<string>;
}

export async function startHttpServer(options: HttpServerOptions): Promise<HttpServerHandle> {
  const serverApp = express();
  const eventClients = new Set<Response>();
  const removeEventClient = (client: Response) => {
    eventClients.delete(client);
  };
  const broadcastStateChanged = () => {
    const payload = JSON.stringify({ projectId: "default", updatedAt: new Date().toISOString() });
    for (const client of eventClients) {
      try {
        client.write(`event: state-changed\ndata: ${payload}\n\n`);
      } catch {
        removeEventClient(client);
        client.end();
      }
    }
  };
  const heartbeatTimer = setInterval(() => {
    for (const client of eventClients) {
      try {
        client.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        removeEventClient(client);
        client.end();
      }
    }
  }, 30000);
  heartbeatTimer.unref?.();

  serverApp.use(express.json({ limit: "1mb" }));
  serverApp.use((_request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  serverApp.get("/api/state/:projectId", async (_request, response, next) => {
    try {
      const [project, assets] = await Promise.all([readProject(), readAssets()]);
      const liveState = await readLiveState(options.paths, project.id);
      response.json(resolveRosterProject(project, assets, liveState));
    } catch (error) {
      next(error);
    }
  });

  serverApp.get("/api/events/:projectId", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();
    response.write(`event: ready\ndata: {"projectId":"${request.params.projectId}"}\n\n`);
    while (eventClients.size >= maxEventClients) {
      const oldestClient = eventClients.values().next().value;
      if (!oldestClient) {
        break;
      }
      removeEventClient(oldestClient);
      oldestClient.end();
    }
    eventClients.add(response);
    response.on("close", () => removeEventClient(response));
    request.on("close", () => {
      removeEventClient(response);
    });
  });

  serverApp.put("/api/project/:projectId", async (request, response, next) => {
    try {
      response.json(await writeProject(request.body));
      options.getMainWindow()?.webContents.send("state-changed");
      broadcastStateChanged();
    } catch (error) {
      next(error);
    }
  });

  serverApp.post("/api/project/:projectId/activate", async (request, response, next) => {
    try {
      response.json(await activateProject(request.params.projectId));
      options.getMainWindow()?.webContents.send("state-changed");
      broadcastStateChanged();
    } catch (error) {
      next(error);
    }
  });

  serverApp.patch("/api/live-state/:projectId/health", async (request, response, next) => {
    try {
      const { side, index, health } = request.body as {
        side?: TeamSide;
        index?: number;
        health?: Partial<SlotHealth>;
      };
      if ((side !== "left" && side !== "right") || typeof index !== "number" || index < 0 || index > 5) {
        response.status(400).json({ error: "invalid slot" });
        return;
      }
      const project = await readProject();
      const liveState = await writeSlotHealth(
        options.paths,
        request.params.projectId || project.id,
        side,
        index,
        health ?? {}
      );
      response.json(liveState);
      options.getMainWindow()?.webContents.send("state-changed");
      broadcastStateChanged();
    } catch (error) {
      next(error);
    }
  });

  serverApp.post("/api/live-state/:projectId/reset", async (request, response, next) => {
    try {
      const project = await readProject();
      const liveState = await resetLiveHealth(options.paths, request.params.projectId || project.id);
      response.json(liveState);
      options.getMainWindow()?.webContents.send("state-changed");
      broadcastStateChanged();
    } catch (error) {
      next(error);
    }
  });

  serverApp.post("/api/export/:projectId", async (request, response, next) => {
    try {
      const mode = parseExportMode(String(request.query.mode ?? "overlay"));
      const filePath = await options.exportPng(mode);
      response.json({ filePath });
    } catch (error) {
      next(error);
    }
  });

  serverApp.get("/assets/pets/:fileName", async (request, response, next) => {
    try {
      const filePath = await getAssetFilePath(request.params.fileName);
      if (!filePath) {
        response.status(404).end();
        return;
      }
      setImmutableCacheHeaders(response);
      response.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  serverApp.get("/assets/avatars/:fileName", async (request, response, next) => {
    try {
      const filePath = await getAvatarFilePath(request.params.fileName);
      if (!filePath) {
        response.status(404).end();
        return;
      }
      setImmutableCacheHeaders(response);
      response.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  serverApp.get("/assets/backgrounds/:fileName", async (request, response, next) => {
    try {
      const filePath = await getBackgroundFilePath(request.params.fileName);
      if (!filePath) {
        response.status(404).end();
        return;
      }
      setImmutableCacheHeaders(response);
      response.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  serverApp.get("/assets/hud/:fileName", async (request, response, next) => {
    try {
      const filePath = await getHudImageFilePath(request.params.fileName);
      if (!filePath) {
        response.status(404).end();
        return;
      }
      setImmutableCacheHeaders(response);
      response.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  serverApp.use("/element-icons", cachedStatic(path.join(options.publicRoot, "element-icons")));
  serverApp.use("/room-backgrounds", cachedStatic(path.join(options.publicRoot, "room-backgrounds")));
  serverApp.use("/room-titles", cachedStatic(path.join(options.publicRoot, "room-titles")));
  serverApp.use("/overlay/room-titles", cachedStatic(path.join(options.publicRoot, "room-titles")));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  serverApp.get("/overlay/:projectId", (request, response) => {
    if (devUrl) {
      const target = new URL(`/overlay/${request.params.projectId}`, devUrl);
      const serverOrigin = `http://${request.headers.host ?? "127.0.0.1:51735"}`;
      target.search = new URLSearchParams({
        ...Object.fromEntries(new URLSearchParams(request.url.split("?")[1] ?? "")),
        server: serverOrigin
      }).toString();
      response.redirect(target.toString());
      return;
    }

    response.sendFile(path.join(options.rendererRoot, "index.html"));
  });

  serverApp.use("/overlay/assets", cachedStatic(path.join(options.rendererRoot, "assets")));
  serverApp.use(express.static(options.rendererRoot));
  serverApp.use((_request, response) => {
    response.sendFile(path.join(options.rendererRoot, "index.html"));
  });

  const server = http.createServer(serverApp);
  const port = await listenOnAvailablePort(server, 51735);
  const origin = `http://127.0.0.1:${port}`;

  return {
    port,
    origin,
    broadcastStateChanged,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(heartbeatTimer);
        for (const client of eventClients) {
          client.end();
        }
        eventClients.clear();
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      })
  };
}

const maxEventClients = 32;
const immutableCacheOptions = { maxAge: "365d", immutable: true };

function cachedStatic(root: string) {
  return express.static(root, immutableCacheOptions);
}

function setImmutableCacheHeaders(response: Response): void {
  response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
}

function parseExportMode(value: string): ExportMode {
  return value === "left" || value === "right" || value === "overlay" || value === "room"
    ? value
    : "overlay";
}

function listenOnAvailablePort(server: http.Server, startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      server.removeAllListeners("error");
      server.removeAllListeners("listening");
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          tryListen(port + 1);
        } else {
          reject(error);
        }
      });
      server.once("listening", () => resolve(port));
      server.listen(port, "127.0.0.1");
    };

    tryListen(startPort);
  });
}
