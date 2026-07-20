import { useEffect, useMemo, useState } from "react";
import type { ResolvedRosterProject } from "../types";
import { fetchResolvedProject, getApiBase } from "./api";
import { OverlayCanvas, type OverlayMode } from "./components/OverlayCanvas";
import { OutputViewport } from "./components/OutputViewport";
import { RoomCanvas } from "./components/RoomCanvas";
import type { TeamSide } from "../types";
import { getCaptureCanvasSize } from "../core/captureGeometry";

export function OverlayPage() {
  const [resolved, setResolved] = useState<ResolvedRosterProject | undefined>();
  const [error, setError] = useState<string | undefined>();
  const mode = useMemo<OverlayMode | "room">(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("mode");
    if (value === "room") {
      return "room";
    }
    return value === "left" || value === "right" ? value : "overlay";
  }, []);
  const visibleSide = useMemo<TeamSide | undefined>(() => {
    const value = new URLSearchParams(window.location.search).get("side");
    return value === "left" || value === "right" ? value : undefined;
  }, []);
  const isCaptureWindow = useMemo(() => {
    return new URLSearchParams(window.location.search).get("capture") === "window";
  }, []);

  useEffect(() => {
    let disposed = false;
    let loading = false;
    let fallbackTimer: number | undefined;
    let eventSource: EventSource | undefined;
    let handshakeTimer: number | undefined;

    const stopFallbackPolling = () => {
      if (fallbackTimer !== undefined) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = undefined;
      }
    };

    const startFallbackPolling = () => {
      if (fallbackTimer !== undefined || disposed) {
        return;
      }
      fallbackTimer = window.setInterval(() => void load(), 10000);
    };

    async function load() {
      if (loading) {
        return;
      }
      loading = true;
      try {
        const next = await fetchResolvedProject("default");
        if (!disposed) {
          setResolved(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "状态读取失败");
        }
      }
      loading = false;
    }

    void load();
    if (typeof EventSource === "undefined") {
      startFallbackPolling();
      return () => {
        disposed = true;
        stopFallbackPolling();
      };
    }

    const handleOpen = () => stopFallbackPolling();
    const handleError = () => startFallbackPolling();
    const handleStateChanged = () => void load();
    eventSource = new EventSource(`${getApiBase()}/api/events/default`);
    eventSource.addEventListener("open", handleOpen);
    eventSource.addEventListener("error", handleError);
    eventSource.addEventListener("state-changed", handleStateChanged);
    handshakeTimer = window.setTimeout(() => {
      if (!disposed && eventSource?.readyState !== EventSource.OPEN) {
        startFallbackPolling();
      }
    }, 5000);

    return () => {
      disposed = true;
      stopFallbackPolling();
      if (handshakeTimer !== undefined) {
        window.clearTimeout(handshakeTimer);
      }
      eventSource?.removeEventListener("open", handleOpen);
      eventSource?.removeEventListener("error", handleError);
      eventSource?.removeEventListener("state-changed", handleStateChanged);
      eventSource?.close();
    };
  }, []);

  if (error) {
    return <div className="overlay-error">{error}</div>;
  }

  if (!resolved) {
    return <div className="overlay-loading">加载中</div>;
  }

  const outputSize = getCaptureCanvasSize(mode, resolved.style.resolution);

  return (
    <main
      className={[
        mode === "left" || mode === "right" ? "overlay-page-team" : "overlay-page",
        isCaptureWindow ? "capture-window" : ""
      ].join(" ")}
    >
      <OutputViewport width={outputSize.width} height={outputSize.height} align={getOutputAlign(mode)}>
        {mode === "room" ? (
          <RoomCanvas resolved={resolved} />
        ) : (
          <OverlayCanvas resolved={resolved} mode={mode} visibleSide={visibleSide} />
        )}
      </OutputViewport>
    </main>
  );
}

function getOutputAlign(mode: OverlayMode | "room") {
  if (mode === "left") {
    return "start";
  }
  if (mode === "right") {
    return "end";
  }
  return "center";
}
