import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type {
  Resolution,
  ResolvedRosterProject,
  RoomBroadcastHud,
  RoomPlayerBarPreset,
  RoomTextBox,
  RoomTitleImageStyle
} from "../../types";
import {
  builtinLeftPlayerAvatar,
  builtinRightPlayerAvatar,
  builtinRoomBackground,
  builtinRoomTitle,
  legacyLeftPlayerAvatar,
  legacyRightPlayerAvatar,
  normalizeRoomDesign,
  roomCanvasSize,
  roomTitleImageElementId
} from "../../core/room";
import { getApiBase } from "../api";
import { OverlayCanvas } from "./OverlayCanvas";

interface RoomCanvasProps {
  resolved: ResolvedRosterProject;
  editable?: boolean;
  selectedTextId?: string;
  onSelectText?: (id: string) => void;
  onChangeTextBox?: (box: RoomTextBox, options?: { transient?: boolean }) => void;
  onCommitTextBox?: (box: RoomTextBox) => void;
  onChangeTitleImage?: (titleImage: RoomTitleImageStyle, options?: { transient?: boolean }) => void;
  onCommitTitleImage?: (titleImage: RoomTitleImageStyle) => void;
}

type DragMode = "move" | "resize";

interface EditableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragTarget =
  | (EditableRect & { kind: "text"; id: string; box: RoomTextBox })
  | (EditableRect & { kind: "titleImage"; id: typeof roomTitleImageElementId; titleImage: RoomTitleImageStyle });

const hudOwnedTextRoles = new Set<RoomTextBox["role"]>([
  "title",
  "player-left",
  "player-right",
  "score-left",
  "score-right"
]);

interface DragState {
  mode: DragMode;
  target: DragTarget;
  pointerId: number;
  startX: number;
  startY: number;
  latestTarget?: DragTarget;
}

export function RoomCanvas({
  resolved,
  editable = false,
  selectedTextId,
  onSelectText,
  onChangeTextBox,
  onCommitTextBox,
  onChangeTitleImage,
  onCommitTitleImage
}: RoomCanvasProps) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const stopWindowDragRef = useRef<(() => void) | undefined>(undefined);
  const [renderScale, setRenderScale] = useState(1);
  const room = normalizeRoomDesign(resolved.room);
  const backgroundUrl = getRoomBackgroundUrl(room.background.imagePath);
  const edgeBlur = Math.max(0, room.background.edgeBlur);
  const edgeBlurClear = Math.max(34, 52 - edgeBlur * 0.35);
  const edgeBlurFade = Math.max(52, 70 - edgeBlur * 0.22);
  const edgeBlurScale = 1.02 + edgeBlur / 1200;
  const edgeBlurRadius = edgeBlur * 1.35;
  const hasBroadcastHud = Boolean(room.hud);
  const titleImageVisible = Boolean(room.hud?.titleImage.visible && room.hud.titleImage.imagePath);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    const updateScale = () => {
      const layoutWidth = scene.clientWidth || scene.offsetWidth;
      setRenderScale(layoutWidth > 0 ? layoutWidth / roomCanvasSize.width : 1);
    };
    updateScale();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }
    const observer = new ResizeObserver(updateScale);
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => stopWindowDragRef.current?.();
  }, []);

  const stopWindowDrag = () => {
    stopWindowDragRef.current?.();
    stopWindowDragRef.current = undefined;
  };

  const updateDragAt = (point: { x: number; y: number }) => {
    if (!editable || !dragRef.current) {
      return;
    }
    const drag = dragRef.current;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const rect =
      drag.mode === "move"
        ? clampEditableRect({ ...drag.target, x: drag.target.x + dx, y: drag.target.y + dy })
        : clampEditableRect({
            ...drag.target,
            width: drag.target.width + dx,
            height: drag.target.height + dy
          });
    const next = updateDragTargetRect(drag.target, rect);
    dragRef.current = { ...drag, latestTarget: next };
    notifyDragTarget(next, false);
  };

  const endDragWithPointer = (pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) {
      return;
    }
    notifyDragTarget(drag.latestTarget ?? drag.target, true);
    if (sceneRef.current?.hasPointerCapture(drag.pointerId)) {
      sceneRef.current.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = undefined;
    stopWindowDrag();
  };

  const beginDrag = (
    event: Pick<ReactPointerEvent | ReactMouseEvent, "clientX" | "clientY" | "preventDefault" | "stopPropagation">,
    target: DragTarget,
    mode: DragMode,
    pointerId: number
  ) => {
    if (!editable) {
      return;
    }
    if (dragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelectText?.(target.id);
    const point = toCanvasPoint(event, sceneRef.current);
    dragRef.current = { mode, target, pointerId, startX: point.x, startY: point.y, latestTarget: target };
    stopWindowDrag();
    const handlePointerMove = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pointerId) {
        return;
      }
      nativeEvent.preventDefault();
      updateDragAt(toCanvasPoint(nativeEvent, sceneRef.current));
    };
    const handlePointerEnd = (nativeEvent: PointerEvent) => {
      endDragWithPointer(nativeEvent.pointerId);
    };
    const handleMouseMove = (nativeEvent: MouseEvent) => {
      if (pointerId !== -1) {
        return;
      }
      nativeEvent.preventDefault();
      updateDragAt(toCanvasPoint(nativeEvent, sceneRef.current));
    };
    const handleMouseEnd = () => {
      endDragWithPointer(-1);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseEnd);
    stopWindowDragRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseEnd);
    };
  };

  const startDrag = (event: ReactPointerEvent, box: RoomTextBox, mode: DragMode) => {
    beginDrag(event, createTextDragTarget(box), mode, event.pointerId);
    sceneRef.current?.setPointerCapture(event.pointerId);
  };

  const startMouseDrag = (event: ReactMouseEvent, box: RoomTextBox, mode: DragMode) => {
    beginDrag(event, createTextDragTarget(box), mode, -1);
  };

  const startTitleImageDrag = (event: ReactPointerEvent, titleImage: RoomTitleImageStyle, mode: DragMode) => {
    beginDrag(event, createTitleImageDragTarget(titleImage), mode, event.pointerId);
    sceneRef.current?.setPointerCapture(event.pointerId);
  };

  const startTitleImageMouseDrag = (event: ReactMouseEvent, titleImage: RoomTitleImageStyle, mode: DragMode) => {
    beginDrag(event, createTitleImageDragTarget(titleImage), mode, -1);
  };

  const notifyDragTarget = (target: DragTarget, committed: boolean) => {
    if (target.kind === "text") {
      if (committed) {
        onCommitTextBox?.(target.box);
        return;
      }
      onChangeTextBox?.(target.box, { transient: true });
      return;
    }
    if (committed) {
      onCommitTitleImage?.(target.titleImage);
      return;
    }
    onChangeTitleImage?.(target.titleImage, { transient: true });
  };

  return (
    <div
      className={[
        "room-scene",
        hasBroadcastHud ? "room-scene-hud" : "",
        editable ? "room-scene-editable" : ""
      ].join(" ")}
      ref={sceneRef}
      data-testid="room-scene"
      style={
        {
          "--room-edge-blur-clear": `${edgeBlurClear}%`,
          "--room-edge-blur-fade": `${edgeBlurFade}%`,
          "--room-edge-blur-scale": edgeBlurScale
        } as CSSProperties
      }
      onPointerUp={(event) => endDragWithPointer(event.pointerId)}
      onPointerCancel={(event) => endDragWithPointer(event.pointerId)}
    >
      {room.background.visible && backgroundUrl && (
        <img
          className="room-background-image"
          src={backgroundUrl}
          alt=""
          draggable={false}
          style={
            {
              objectFit: room.background.fit,
              opacity: room.background.opacity
            } as CSSProperties
          }
        />
      )}
      {room.background.visible && backgroundUrl && room.background.edgeBlur > 0 && (
        <img
          className="room-background-edge-blur"
          src={backgroundUrl}
          alt=""
          draggable={false}
          style={
            {
              objectFit: room.background.fit,
              opacity: room.background.opacity,
              filter: `blur(${edgeBlurRadius}px)`
            } as CSSProperties
          }
        />
      )}
      {room.background.visible && room.background.dim > 0 && (
        <div
          className="room-background-dim"
          style={{ background: `rgba(8, 14, 24, ${room.background.dim})` }}
        />
      )}
      <div className="room-overlay-layer">
        <OverlayCanvas resolved={resolved} mode="overlay" roomLayout />
      </div>
      <div className="room-decoration-layer">
        {room.hud && (
          <RoomBroadcastHudView
            hud={room.hud}
            textBoxes={room.textBoxes}
            editable={editable}
            selectedTitleImage={selectedTextId === roomTitleImageElementId && titleImageVisible}
            onTitleImagePointerDown={startTitleImageDrag}
            onTitleImageMouseDown={startTitleImageMouseDrag}
          />
        )}
        {room.textBoxes.map((box) => {
          const hudOwned = hasBroadcastHud && hudOwnedTextRoles.has(box.role) && !(box.role === "title" && !titleImageVisible);
          const selected = box.id === selectedTextId;
          const horizontalTextPadding = box.role === "score-left" || box.role === "score-right" ? 6 : 24;
          const textStrokeEnabled = box.strokeEnabled !== false && box.strokeWidth > 0;
          const textStroke = textStrokeEnabled ? box.strokeWidth * renderScale : 0;
          const textStrokeColor = textStrokeEnabled ? box.strokeColor : "transparent";
          return (
            <div
              className={[
                "room-text-box",
                `room-text-${box.role}`,
                hudOwned ? "room-text-box-hud-owned" : "",
                selected ? "room-text-box-selected" : ""
              ].join(" ")}
              data-testid="room-text-box"
              data-role={box.role}
              data-fill-style={box.fillStyle ?? "solid"}
              key={box.id}
              onPointerDown={(event) => startDrag(event, box, "move")}
              onMouseDown={(event) => startMouseDrag(event, box, "move")}
              title={editable ? "拖拽移动，右下角缩放，右侧编辑文字" : box.text}
              style={
                {
                  left: `${(box.x / roomCanvasSize.width) * 100}%`,
                  top: `${(box.y / roomCanvasSize.height) * 100}%`,
                  width: `${(box.width / roomCanvasSize.width) * 100}%`,
                  height: `${(box.height / roomCanvasSize.height) * 100}%`,
                  color: box.color,
                  background: roomTextBackground(box.background, box.backgroundOpacity),
                  borderColor: box.borderColor,
                  borderWidth: `${box.borderWidth * renderScale}px`,
                  borderRadius: `${box.radius * renderScale}px`,
                  opacity: box.opacity,
                  fontFamily: box.fontFamily,
                  fontSize: `${box.fontSize * renderScale}px`,
                  fontWeight: box.fontWeight,
                  textAlign: box.align,
                  justifyContent: justifyFromAlign(box.align),
                  paddingLeft: `${horizontalTextPadding * renderScale}px`,
                  paddingRight: `${horizontalTextPadding * renderScale}px`,
                  "--room-text-stroke": `${textStroke}px`,
                  "--room-text-stroke-color": textStrokeColor,
                  "--room-text-shadow-color": box.shadowColor,
                  "--room-text-fill-color": box.color
                } as CSSProperties
              }
            >
              <span data-text={box.text}>{box.text}</span>
              {editable && selected && (
                <span
                  className="room-resize-handle"
                  onPointerDown={(event) => startDrag(event, box, "resize")}
                  onMouseDown={(event) => startMouseDrag(event, box, "resize")}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
      {room.guides?.visible && <RoomGuides mode={room.guides.mode} resolution={resolved.style.resolution} />}
    </div>
  );
}

function RoomBroadcastHudView({
  hud,
  textBoxes,
  editable = false,
  selectedTitleImage = false,
  onTitleImagePointerDown,
  onTitleImageMouseDown
}: {
  hud: RoomBroadcastHud;
  textBoxes: RoomTextBox[];
  editable?: boolean;
  selectedTitleImage?: boolean;
  onTitleImagePointerDown?: (event: ReactPointerEvent, titleImage: RoomTitleImageStyle, mode: DragMode) => void;
  onTitleImageMouseDown?: (event: ReactMouseEvent, titleImage: RoomTitleImageStyle, mode: DragMode) => void;
}) {
  const leftName = getTextByRole(textBoxes, "player-left", "");
  const rightName = getTextByRole(textBoxes, "player-right", "");
  const scoreLeft = getTextByRole(textBoxes, "score-left", "0");
  const scoreRight = getTextByRole(textBoxes, "score-right", "0");
  const titleImageUrl = hud.titleImage.visible ? getRoomHudAssetUrl(hud.titleImage.imagePath) : undefined;
  const leftAvatarUrl = hud.playerBar.avatarVisible
    ? getRoomHudAssetUrl(hud.playerBar.leftAvatarPath || builtinLeftPlayerAvatar)
    : undefined;
  const rightAvatarUrl = hud.playerBar.avatarVisible
    ? getRoomHudAssetUrl(hud.playerBar.rightAvatarPath || builtinRightPlayerAvatar)
    : undefined;
  const playerBarPreset = hud.playerBar.preset ?? "s3-clover-hinge";
  const scoreFollowsPlayer = playerBarPreset === "player-score";
  const playerBarArtUrl = getRoomPlayerBarArtUrl(playerBarPreset);
  const baseWidthPercent = playerBarPreset === "classic" || playerBarPreset === "compact" ? 66 : 78;
  const playerBarWidthPercent = Math.min(94, baseWidthPercent * (hud.playerBar.widthScale ?? 1));

  return (
    <div className="room-broadcast-hud">
      {titleImageUrl && (
        <div
        className={[
          "room-broadcast-title",
          editable ? "room-broadcast-title-editable" : "",
          selectedTitleImage ? "room-broadcast-title-selected" : ""
        ].join(" ")}
        data-testid="room-broadcast-title"
        onPointerDown={(event) => onTitleImagePointerDown?.(event, hud.titleImage, "move")}
        onMouseDown={(event) => onTitleImageMouseDown?.(event, hud.titleImage, "move")}
        title={editable ? "拖拽移动标题图，右下角缩放，右侧可导入替换" : ""}
        style={
          {
            left: `${(hud.titleImage.x / roomCanvasSize.width) * 100}%`,
            top: `${(hud.titleImage.y / roomCanvasSize.height) * 100}%`,
            width: `${(hud.titleImage.width / roomCanvasSize.width) * 100}%`,
            height: `${(hud.titleImage.height / roomCanvasSize.height) * 100}%`
          } as CSSProperties
        }
      >
        <img
            src={titleImageUrl}
            alt=""
            draggable={false}
            style={
              {
                objectFit: hud.titleImage.fit,
                opacity: hud.titleImage.opacity
              } as CSSProperties
            }
          />
        {editable && selectedTitleImage && (
          <span
            className="room-resize-handle"
            onPointerDown={(event) => onTitleImagePointerDown?.(event, hud.titleImage, "resize")}
            onMouseDown={(event) => onTitleImageMouseDown?.(event, hud.titleImage, "resize")}
            aria-hidden="true"
          />
        )}
        </div>
      )}
      <div
        className={[
          "room-player-bar",
          `room-player-bar-preset-${playerBarPreset}`,
          hud.playerBar.visible ? "" : "room-player-bar-hidden",
          hud.playerBar.animation ? "" : "room-player-bar-no-animation"
        ].join(" ")}
        aria-hidden={hud.playerBar.visible ? "false" : "true"}
        style={
          {
            "--room-player-bar-width": `${playerBarWidthPercent}%`,
            "--room-player-font-scale": hud.playerBar.textScale ?? 1
          } as CSSProperties
        }
      >
        {playerBarArtUrl && <img className="room-player-bar-art" src={playerBarArtUrl} alt="" draggable={false} />}
        <RoomPlayerSide
          side="left"
          name={leftName}
          avatarUrl={leftAvatarUrl}
          visible={hud.playerBar.leftVisible}
          score={scoreLeft}
          scoreVisible={scoreFollowsPlayer && hud.playerBar.scoreVisible}
        />
        <RoomScorePill
          leftScore={scoreLeft}
          rightScore={scoreRight}
          boText={hud.playerBar.boText}
          scoreFollowsPlayer={scoreFollowsPlayer}
          visible={hud.playerBar.scoreVisible}
        />
        <RoomPlayerSide
          side="right"
          name={rightName}
          avatarUrl={rightAvatarUrl}
          visible={hud.playerBar.rightVisible}
          score={scoreRight}
          scoreVisible={scoreFollowsPlayer && hud.playerBar.scoreVisible}
        />
      </div>
    </div>
  );
}

function RoomScorePill({
  leftScore,
  rightScore,
  boText,
  scoreFollowsPlayer,
  visible
}: {
  leftScore: string;
  rightScore: string;
  boText: string;
  scoreFollowsPlayer: boolean;
  visible: boolean;
}) {
  return (
    <div
      className={[
        "room-score-pill",
        scoreFollowsPlayer ? "room-score-pill-center-only" : "",
        visible ? "" : "room-score-pill-hidden"
      ].join(" ")}
      aria-hidden={visible ? "false" : "true"}
    >
      {!scoreFollowsPlayer && (
        <span
          className="room-score-value room-score-value-left"
          style={{ "--room-score-fit": getScoreTextFit(leftScore) } as CSSProperties}
        >
          {leftScore}
        </span>
      )}
      <span className="room-score-separator">VS</span>
      {!scoreFollowsPlayer && (
        <span
          className="room-score-value room-score-value-right"
          style={{ "--room-score-fit": getScoreTextFit(rightScore) } as CSSProperties}
        >
          {rightScore}
        </span>
      )}
      <span className="room-score-format">{boText}</span>
    </div>
  );
}

function RoomPlayerSide({
  side,
  name,
  avatarUrl,
  visible,
  score,
  scoreVisible
}: {
  side: "left" | "right";
  name: string;
  avatarUrl?: string;
  visible: boolean;
  score: string;
  scoreVisible: boolean;
}) {
  return (
    <div
      className={[
        "room-player-side",
        `room-player-side-${side}`,
        avatarUrl ? "" : "room-player-side-no-avatar",
        scoreVisible ? "room-player-side-score-active" : "",
        visible ? "" : "room-player-side-hidden"
      ].join(" ")}
      aria-hidden={visible ? "false" : "true"}
    >
      {side === "left" && avatarUrl && <RoomPlayerAvatar src={avatarUrl} />}
      {side === "right" && <RoomPlayerSideScore score={score} visible={scoreVisible} />}
      <span className="room-player-name">{name}</span>
      {side === "left" && <RoomPlayerSideScore score={score} visible={scoreVisible} />}
      {side === "right" && avatarUrl && <RoomPlayerAvatar src={avatarUrl} />}
    </div>
  );
}

function RoomPlayerSideScore({ score, visible }: { score: string; visible: boolean }) {
  return (
    <span
      className={["room-player-side-score", visible ? "" : "room-player-side-score-hidden"].join(" ")}
      style={{ "--room-score-fit": getScoreTextFit(score) } as CSSProperties}
    >
      {score}
    </span>
  );
}

function getScoreTextFit(score: string): number {
  const length = Array.from(score.trim()).length;
  if (length <= 1) return 1;
  if (length === 2) return 0.78;
  if (length === 3) return 0.56;
  return 0.44;
}

function RoomPlayerAvatar({ src, className = "" }: { src: string; className?: string }) {
  return (
    <span className={["room-player-avatar-slot", className].join(" ")} aria-hidden="true">
      <img className="room-player-avatar" src={src} alt="" draggable={false} />
    </span>
  );
}

function getTextByRole(textBoxes: RoomTextBox[], role: RoomTextBox["role"], fallback: string) {
  const text = textBoxes.find((box) => box.role === role)?.text;
  return typeof text === "string" && text.length > 0 ? text : fallback;
}

function RoomGuides({ mode, resolution }: { mode: "center" | "safe"; resolution: Resolution }) {
  const safeWidth = Math.round(resolution.width * 0.9);
  const safeHeight = Math.round(resolution.height * 0.9);
  const centerX = Math.round(resolution.width / 2);
  const centerY = Math.round(resolution.height / 2);
  return (
    <div className={["room-guide-layer", `room-guide-${mode}`].join(" ")} aria-hidden="true">
      <span className="room-guide-line room-guide-line-x" />
      <span className="room-guide-line room-guide-line-y" />
      {mode === "safe" && (
        <>
          <span className="room-guide-safe-frame" />
          <span className="room-guide-label room-guide-label-safe">safe {safeWidth} x {safeHeight}</span>
        </>
      )}
      <span className="room-guide-label room-guide-label-center">center {centerX} / {centerY}</span>
    </div>
  );
}

function getRoomBackgroundUrl(imagePath: string | undefined): string | undefined {
  if (!imagePath) {
    return undefined;
  }
  if (imagePath === builtinRoomBackground) {
    return `${getApiBase()}/room-backgrounds/world-room-v3-hq.png`;
  }
  if (/^(https?:|data:|blob:)/.test(imagePath)) {
    return imagePath;
  }
  return `${getApiBase()}/assets/backgrounds/${encodeURIComponent(imagePath)}`;
}

function getRoomHudAssetUrl(imagePath: string | undefined): string | undefined {
  if (!imagePath) {
    return undefined;
  }
  if (imagePath === legacyLeftPlayerAvatar) {
    return `${getApiBase()}/player-avatars/roco-player-dimo.png`;
  }
  if (imagePath === legacyRightPlayerAvatar) {
    return `${getApiBase()}/player-avatars/roco-player-bunny-fit.png`;
  }
  if (imagePath === builtinRoomTitle) {
    return `${getApiBase()}/room-titles/rock-league-title-v1-cutout.png`;
  }
  if (/^(https?:|data:|blob:)/.test(imagePath)) {
    return imagePath;
  }
  if (/^assets\/hud\//.test(imagePath)) {
    return `${getApiBase()}/assets/hud/${encodeURIComponent(imagePath.replace(/^assets\/hud\//, ""))}`;
  }
  if (/^assets\/backgrounds\//.test(imagePath)) {
    return `${getApiBase()}/assets/backgrounds/${encodeURIComponent(imagePath.replace(/^assets\/backgrounds\//, ""))}`;
  }
  if (/^assets\/avatars\//.test(imagePath)) {
    return `${getApiBase()}/assets/avatars/${encodeURIComponent(imagePath.replace(/^assets\/avatars\//, ""))}`;
  }
  return `${getApiBase()}/assets/backgrounds/${encodeURIComponent(imagePath)}`;
}

function getRoomPlayerBarArtUrl(preset: RoomPlayerBarPreset): string | undefined {
  if (preset === "s3-clover-hinge") {
    return `${getApiBase()}/room-player-bars/s3-clover-hinge-wide.png`;
  }
  if (preset === "s3-storybook" || preset === "s3-prism-bookmark") {
    return `${getApiBase()}/room-player-bars/${preset}.png`;
  }
  return undefined;
}

function toCanvasPoint(event: Pick<ReactPointerEvent | PointerEvent, "clientX" | "clientY">, scene: HTMLElement | null) {
  const rect = scene?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((event.clientX - rect.left) / rect.width) * roomCanvasSize.width,
    y: ((event.clientY - rect.top) / rect.height) * roomCanvasSize.height
  };
}

function createTextDragTarget(box: RoomTextBox): DragTarget {
  return {
    kind: "text",
    id: box.id,
    box,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height
  };
}

function createTitleImageDragTarget(titleImage: RoomTitleImageStyle): DragTarget {
  return {
    kind: "titleImage",
    id: roomTitleImageElementId,
    titleImage,
    x: titleImage.x,
    y: titleImage.y,
    width: titleImage.width,
    height: titleImage.height
  };
}

function updateDragTargetRect(target: DragTarget, rect: EditableRect): DragTarget {
  if (target.kind === "text") {
    return {
      ...target,
      ...rect,
      box: {
        ...target.box,
        ...rect
      }
    };
  }
  return {
    ...target,
    ...rect,
    titleImage: {
      ...target.titleImage,
      ...rect
    }
  };
}

function clampEditableRect(rect: EditableRect): EditableRect {
  const width = Math.min(roomCanvasSize.width, Math.max(80, rect.width));
  const height = Math.min(roomCanvasSize.height, Math.max(34, rect.height));
  return {
    ...rect,
    width,
    height,
    x: Math.min(roomCanvasSize.width - width, Math.max(0, rect.x)),
    y: Math.min(roomCanvasSize.height - height, Math.max(0, rect.y))
  };
}

function clampTextBox(box: RoomTextBox): RoomTextBox {
  const rect = clampEditableRect(box);
  return {
    ...box,
    ...rect
  };
}

function justifyFromAlign(align: RoomTextBox["align"]) {
  if (align === "left") {
    return "flex-start";
  }
  if (align === "right") {
    return "flex-end";
  }
  return "center";
}

function roomTextBackground(color: string, opacity: number) {
  const safeOpacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0;
  if (safeOpacity <= 0 || color.trim().toLowerCase() === "transparent") {
    return "transparent";
  }
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    return color;
  }
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${safeOpacity})`;
}
