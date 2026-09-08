import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  HealthBarStyle,
  NameLabelStyle,
  PetAsset,
  ResolvedRosterProject,
  ResolvedRosterSlot,
  TeamLayoutMode,
  TeamSide,
  SeasonTheme
} from "../../types";
import { getElementIconFile, splitElements } from "../../core/elements";
import { getHealthColor, normalizeHealthBarStyle } from "../../core/health";
import { getPetDisplayName, normalizeNameLabelStyle } from "../../core/nameLabel";
import { getOutputResolutionScale, getRosterVisualScale } from "../../core/captureGeometry";
import { getApiBase } from "../api";

export type OverlayMode = "overlay" | TeamSide;

interface OverlayCanvasProps {
  resolved: ResolvedRosterProject;
  mode: OverlayMode;
  visibleSide?: TeamSide;
  roomLayout?: boolean;
}

export function OverlayCanvas({ resolved, mode, visibleSide, roomLayout = false }: OverlayCanvasProps) {
  const cloudTheme = resolved.style.cloudTheme ?? "s3";
  const s4CardPlate = resolved.style.s4CardPlate ?? "moon-ring";
  const isTeamExport = mode === "left" || mode === "right";
  const teamVisibility = resolved.style.teamVisibility ?? { left: true, right: true };
  const showLeft = mode === "left" || (mode === "overlay" && teamVisibility.left && visibleSide !== "right");
  const showRight = mode === "right" || (mode === "overlay" && teamVisibility.right && visibleSide !== "left");
  const cardBackground: ResolvedRosterProject["style"]["cardBackground"] = resolved.style.cardBackground ?? "cloud";
  const nameLabel = useMemo(
    () => normalizeNameLabelStyle(resolved.style.nameLabel),
    [resolved.style.nameLabel]
  );
  const healthBar = useMemo(
    () => normalizeHealthBarStyle(resolved.style.healthBar),
    [resolved.style.healthBar]
  );
  const defeatFilter = resolved.style.defeatFilter ?? { grayscale: 1, opacity: 0.55 };
  const imageScale = resolved.style.imageScale;
  const outputScale = getOutputResolutionScale(resolved.style.resolution);
  const visualScale = cloudTheme === "s4" ? outputScale : getRosterVisualScale(resolved.style.resolution);
  const scalePx = (value: number) => value * outputScale;
  const scaleVisualPx = (value: number) => value * visualScale;
  const resolvedCardGapPx = scalePx(resolved.style.cardGap);
  const cardGapPx = resolvedCardGapPx;
  const layoutMode: TeamLayoutMode = resolved.style.teamLayout?.mode ?? "curved";
  const livePresetRailWidth = `${scaleVisualPx(256.32)}px`;
  const cardPlateScale = resolved.style.cardPlateScale ?? 1.15;
  const cardPlateYOffset = resolved.style.cardPlateYOffset ?? 18;
  const cardPlateWidth = scaleVisualPx((nameLabel.minWidth + nameLabel.height + 8) * cardPlateScale);
  const teamRailPadTop = 140;
  const teamRailPadBottom = 230;
  const petArtMaxWidth = `${100 * imageScale}%`;
  const petArtMaxHeight = `${112 * imageScale}%`;
  const style = {
    "--card-gap": `${resolvedCardGapPx}px`,
    "--image-scale": String(imageScale),
    "--pet-art-max-width": petArtMaxWidth,
    "--pet-art-max-height": petArtMaxHeight,
    "--card-plate-lift": `${scaleVisualPx(70)}px`,
    "--card-plate-width": `${cardPlateWidth}px`,
    "--card-plate-width-extra": `${scaleVisualPx(48 * cardPlateScale)}px`,
    "--s4-plate-unit": `${scaleVisualPx(1)}px`,
    "--card-plate-y-offset": `${scaleVisualPx(cardPlateYOffset)}px`,
    "--defeat-grayscale": String(defeatFilter.grayscale),
    "--defeat-opacity": String(defeatFilter.opacity),
    "--card-plate-outline-width": `${scaleVisualPx(resolved.style.cardPlateOutlineWidth ?? 1)}px`,
    "--team-center-gap": `${scalePx(resolved.style.teamLayout?.centerGap ?? 1540)}px`,
    "--team-vertical-offset": `${scalePx(resolved.style.teamLayout?.verticalOffset ?? 0)}px`,
    "--team-rail-pad-top": `${scalePx(teamRailPadTop)}px`,
    "--team-rail-pad-x": `${scaleVisualPx(24)}px`,
    "--team-rail-pad-bottom": `${scalePx(teamRailPadBottom)}px`,
    "--team-rail-width": livePresetRailWidth,
    "--team-export-card-width": `${scaleVisualPx(372)}px`,
    "--roster-card-height": `${scaleVisualPx(118)}px`,
    "--cloud-art-inset-top": `${scaleVisualPx(-22)}px`,
    "--cloud-art-inset-x": `${scaleVisualPx(-24)}px`,
    "--cloud-art-inset-bottom": `${scaleVisualPx(22)}px`,
    "--cloud-name-overlap": `${scaleVisualPx(12)}px`,
    "--name-label-font-family": nameLabel.fontFamily,
    "--name-label-font-size": `${scaleVisualPx(nameLabel.fontSize)}px`,
    "--name-label-font-weight": String(nameLabel.fontWeight),
    "--name-label-text-color": nameLabel.textColor,
    "--name-label-text-shadow-color": nameLabel.textShadowColor,
    "--name-label-background-top": nameLabel.backgroundTop,
    "--name-label-background-bottom": nameLabel.backgroundBottom,
    "--name-label-border-color": nameLabel.borderColor,
    "--name-label-border-width": `${scaleVisualPx(nameLabel.borderWidth)}px`,
    "--name-label-shadow-color": nameLabel.shadowColor,
    "--name-label-height": `${scaleVisualPx(nameLabel.height)}px`,
    "--name-label-min-width": `${scaleVisualPx(nameLabel.minWidth)}px`,
    "--name-label-pad-x": `${scaleVisualPx(nameLabel.horizontalPadding)}px`,
    "--element-icon-size": `${scaleVisualPx(nameLabel.height)}px`,
    "--element-icon-overlap": `${Math.round(scaleVisualPx(nameLabel.height / 2))}px`,
    "--name-label-gap": `${scaleVisualPx(nameLabel.verticalGap)}px`,
    "--health-height": `${scaleVisualPx(healthBar.height)}px`,
    "--health-gap": `${scaleVisualPx(healthBar.gap)}px`,
    "--health-track": healthBar.trackColor,
    "--health-text-color": healthBar.textColor
  } as CSSProperties;

  return (
    <div
      className={[
        "overlay-scene",
        isTeamExport ? "overlay-scene-team" : "overlay-scene-full",
        roomLayout ? "overlay-scene-room" : "",
        `overlay-layout-${layoutMode}`,
        `overlay-card-${cardBackground}`
      ].join(" ")}
      style={style}
      data-testid="overlay-scene"
      data-mode={mode}
      data-cloud-theme={resolved.style.cloudTheme ?? "s3"}
      data-layout-mode={layoutMode}
    >
      {showLeft && (
        <TeamRail
          side="left"
          label={resolved.teams.left.label}
          slots={resolved.teams.left.slots}
          showElementIcon={resolved.style.showElementIcon}
          nameLabel={nameLabel}
          healthBar={healthBar}
          cardGapPx={cardGapPx}
          cardBackground={cardBackground}
          cloudTheme={cloudTheme}
          s4CardPlate={s4CardPlate}
          teamOnly={mode === "left"}
          roomLayout={roomLayout}
          layoutMode={layoutMode}
          outputScale={outputScale}
          visualScale={visualScale}
        />
      )}
      {showRight && (
        <TeamRail
          side="right"
          label={resolved.teams.right.label}
          slots={resolved.teams.right.slots}
          showElementIcon={resolved.style.showElementIcon}
          nameLabel={nameLabel}
          healthBar={healthBar}
          cardGapPx={cardGapPx}
          cardBackground={cardBackground}
          cloudTheme={cloudTheme}
          s4CardPlate={s4CardPlate}
          teamOnly={mode === "right"}
          roomLayout={roomLayout}
          layoutMode={layoutMode}
          outputScale={outputScale}
          visualScale={visualScale}
        />
      )}
    </div>
  );
}

interface TeamRailProps {
  side: TeamSide;
  label: string;
  slots: ResolvedRosterSlot[];
  showElementIcon: boolean;
  nameLabel: NameLabelStyle;
  healthBar: HealthBarStyle;
  cardGapPx: number;
  cardBackground: ResolvedRosterProject["style"]["cardBackground"];
  cloudTheme?: SeasonTheme;
  s4CardPlate: NonNullable<ResolvedRosterProject["style"]["s4CardPlate"]>;
  teamOnly: boolean;
  roomLayout: boolean;
  layoutMode: TeamLayoutMode;
  outputScale: number;
  visualScale: number;
}

function TeamRail({ side, label, slots, showElementIcon, nameLabel, healthBar, cardGapPx, cardBackground, cloudTheme, s4CardPlate, teamOnly, roomLayout, layoutMode, outputScale, visualScale }: TeamRailProps) {
  return (
    <section
      className={[
        "team-rail",
        `team-rail-${side}`,
        teamOnly ? "team-rail-export" : ""
      ].join(" ")}
      aria-label={label}
      data-testid={`team-${side}`}
    >
      <div className="team-label">{label}</div>
      <div className="team-slots">
        {slots.map((slot, index) => (
          <RosterCard
            key={`${side}-${index}`}
            slot={slot}
            side={side}
            index={index}
            teamOnly={teamOnly}
            showElementIcon={showElementIcon}
            nameLabel={nameLabel}
            healthBar={healthBar}
            cardGapPx={cardGapPx}
            cardBackground={cardBackground}
            cloudTheme={cloudTheme}
            s4CardPlate={s4CardPlate}
            roomLayout={roomLayout}
            layoutMode={layoutMode}
            outputScale={outputScale}
            visualScale={visualScale}
          />
        ))}
      </div>
    </section>
  );
}

interface RosterCardProps {
  slot: ResolvedRosterSlot;
  side: TeamSide;
  index: number;
  cloudTheme?: SeasonTheme;
  s4CardPlate: NonNullable<ResolvedRosterProject["style"]["s4CardPlate"]>;
  teamOnly: boolean;
  showElementIcon: boolean;
  nameLabel: NameLabelStyle;
  healthBar: HealthBarStyle;
  cardGapPx: number;
  cardBackground: ResolvedRosterProject["style"]["cardBackground"];
  roomLayout: boolean;
  layoutMode: TeamLayoutMode;
  outputScale: number;
  visualScale: number;
}

function RosterCard({ slot, side, index, teamOnly, showElementIcon, nameLabel, healthBar, cardGapPx, cardBackground, cloudTheme, s4CardPlate, roomLayout, layoutMode, outputScale, visualScale }: RosterCardProps) {
  const element = slot.resolvedElement || slot.element || slot.asset?.element || "普通";
  const elements = splitElements(element);
  const sourceName = slot.asset?.name || slot.name || "未选择";
  const name = getPetDisplayName(sourceName);
  const hasAsset = Boolean(slot.asset);
  const imageUrl = slot.asset ? getPetImageUrl(slot.asset) : undefined;
  const cardRef = useRef<HTMLElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const nameBarRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<NamePlacement>();

  const updatePlacement = useCallback(() => {
    const card = cardRef.current;
    const nameBar = nameBarRef.current;
    if (!card || !nameBar) {
      return;
    }

    const cardRect = card.getBoundingClientRect();
    if (cardRect.width <= 0 || cardRect.height <= 0) {
      return;
    }

    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      if (cloudTheme === "s4") fitMoonPet(image, card);
      else for (const key of ["width", "height", "left", "top", "transform", "max-width", "max-height"]) image.style.removeProperty(key);
    }
    const metrics = getLayoutMetrics(card, cardRect);
    const nameRect = nameBar.getBoundingClientRect();
    const gap = readInheritedPx(card, "--name-label-gap", nameLabel.verticalGap);
    const healthReserve = healthBar.visible
      ? readInheritedPx(card, "--health-height", healthBar.height) + readInheritedPx(card, "--health-gap", healthBar.gap)
      : 0;
    const minWidth = readInheritedPx(card, "--name-label-min-width", nameLabel.minWidth);
    const labelHeight = nameRect.height / metrics.scaleY || nameLabel.height;
    const visualBounds = getRenderedVisualBounds(imageRef.current, cardRect, metrics);
    const textWidth = measureTextWidth(nameBar, name, nameLabel);
    const padX = readInheritedPx(card, "--name-label-pad-x", nameLabel.horizontalPadding);
    const iconReserve = showElementIcon
      ? readInheritedPx(card, "--element-icon-overlap", Math.round(nameLabel.height / 2)) + 10
      : 0;
    const maxWidth = Math.max(64, metrics.width - 6);
    const width = Math.min(minWidth, maxWidth);
    const textSpace = Math.max(24, width - padX * 2 - iconReserve);
    const textScale = textWidth > 0 ? clamp(textSpace / textWidth, 0.72, 1) : 1;
    const center = (visualBounds.left + visualBounds.right) / 2;
    const left = clamp(center - width / 2, 3, Math.max(3, metrics.width - width - 3));
    const labelOverlap = cardBackground === "cloud" ? readInheritedPx(card, "--cloud-name-overlap", 12) : 0;
    const top = clamp(visualBounds.bottom + gap - labelOverlap, 0, Math.max(0, metrics.height - labelHeight - healthReserve - 2));
    const fontSize = readInheritedPx(card, "--name-label-font-size", nameLabel.fontSize);
    const next = { left, top, width, textScale, fontSize };

    setPlacement((current) => {
      if (
        current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.textScale - next.textScale) < 0.01 &&
        Math.abs(current.fontSize - next.fontSize) < 0.5
      ) {
        return current;
      }
      return next;
    });
  }, [cloudTheme, cardBackground, healthBar.gap, healthBar.height, healthBar.visible, name, nameLabel, showElementIcon]);

  useEffect(() => { updatePlacement(); });

  useEffect(() => {
    updatePlacement();
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePlacement);
      return () => window.removeEventListener("resize", updatePlacement);
    }
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(card);
    window.addEventListener("resize", updatePlacement);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePlacement);
    };
  }, [imageUrl, updatePlacement]);

  const cardStyle = {
    "--slot-base-top": `${(100 + index * (teamOnly ? 110 : cloudTheme === "s4" ? 108 : 98)) * outputScale}px`,
    "--slot-gap-offset": `${(index - 2.5) * cardGapPx}px`,
    "--slot-curve-offset": `${teamOnly || layoutMode === "vertical" ? 0 : getSlotCurveOffset(side, index) * visualScale}px`,
    ...(placement
      ? {
          "--name-left": `${placement.left}px`,
          "--name-top": `${placement.top}px`,
          "--name-width": `${placement.width}px`,
          "--name-text-font-size": `${placement.fontSize * placement.textScale}px`
        }
      : {})
  } as CSSProperties;

  return (
    <article
      className={[
        "roster-card",
        hasAsset ? "" : "roster-card-missing",
        slot.defeated ? "roster-card-defeated" : ""
      ].join(" ")}
      data-testid="roster-card"
      data-side={side}
      ref={cardRef}
      style={cardStyle}
    >
      {cardBackground !== "transparent" && <PetCardPlate variant={cardBackground} theme={cloudTheme} s4CardPlate={s4CardPlate} />}
      <div className="pet-art-wrap">
        {imageUrl ? (
          <img
            className="pet-art"
            src={imageUrl}
            alt={sourceName}
            crossOrigin="anonymous"
            draggable={false}
            ref={imageRef}
            onLoad={updatePlacement}
          />
        ) : (
          <div className="pet-art-placeholder">{index + 1}</div>
        )}
      </div>
      <div
        className={["pet-name-bar", showElementIcon ? "pet-name-bar-with-icon" : ""].join(" ")}
        title={`${sourceName} / ${element}`}
        ref={nameBarRef}
      >
        {showElementIcon && (
          <span className="element-badges" aria-label={`属性：${elements.join("/")}`}>
            {elements.map((item) => (
              <ElementIcon element={item} key={item} />
            ))}
          </span>
        )}
        <span className="pet-name">{name}</span>
      </div>
      {healthBar.visible && slot.health.visible !== false && (
        <HealthBar health={slot.health} style={healthBar} />
      )}
    </article>
  );
}

function fitMoonPet(image: HTMLImageElement, card: HTMLElement) {
  const wrap = image.parentElement!;
  const bounds = getImageAlphaBounds(image);
  const imageScale = Number.parseFloat(getComputedStyle(card).getPropertyValue("--image-scale")) || 1;
  const width = Math.min(wrap.clientWidth, readInheritedPx(card, "--card-plate-width", 160));
  const scale = Math.min(width / (bounds.maxX - bounds.minX + 1), wrap.clientHeight / (bounds.maxY - bounds.minY + 1)) * imageScale;
  Object.assign(image.style, {
    width: `${image.naturalWidth * scale}px`, height: `${image.naturalHeight * scale}px`,
    left: `${(wrap.clientWidth - (bounds.minX + bounds.maxX + 1) * scale) / 2}px`,
    top: `${(wrap.clientHeight - (bounds.minY + bounds.maxY + 1) * scale) / 2}px`,
    transform: "none", maxWidth: "none", maxHeight: "none"
  });
}

function getSlotCurveOffset(side: TeamSide, index: number) {
  const curve = [74, 50, 24, 6, 32, 60][index] ?? 0;
  return side === "left" ? curve : -curve;
}

function PetCardPlate({ variant, theme, s4CardPlate }: { s4CardPlate: NonNullable<ResolvedRosterProject["style"]["s4CardPlate"]>; theme?: SeasonTheme; variant: Exclude<ResolvedRosterProject["style"]["cardBackground"], "transparent"> }) {
  if (variant === "cloud") {
    return (
      <img
        className={`pet-card-plate pet-card-plate-cloud${theme === "s4" ? ` pet-card-plate-moon pet-card-plate-${s4CardPlate}` : ""}`}
        src={`${getApiBase()}/card-plates/${theme === "s4" ? `s4-${s4CardPlate}.png` : "rock-world-cloud-plate.png"}`}
        alt="" aria-hidden="true" draggable={false}
      />
    );
  }

  return (
    <span
      className={["pet-card-plate", `pet-card-plate-${variant}`].join(" ")}
      aria-hidden="true"
    />
  );
}

function HealthBar({ health, style }: { health: ResolvedRosterSlot["health"]; style: HealthBarStyle }) {
  const percent = Math.round(health.percent);
  return (
    <div
      className={[
        "pet-health-bar",
        style.widthMode === "card" ? "pet-health-bar-card" : ""
      ].join(" ")}
      data-testid="pet-health-bar"
      style={
        {
          "--health-percent": `${percent}%`,
          "--health-fill": getHealthColor(percent, style)
        } as CSSProperties
      }
    >
      <span className="pet-health-track">
        <span className="pet-health-fill" />
      </span>
      {style.showPercent && <span className="pet-health-percent">{percent}%</span>}
    </div>
  );
}

function ElementIcon({ element }: { element: string }) {
  const iconFile = getElementIconFile(element);
  if (!iconFile) {
    return (
      <span className="element-icon-frame" title={element}>
        <span className="element-icon-fallback">{element}</span>
      </span>
    );
  }

  return (
    <span className="element-icon-frame" title={element}>
      <img
        className="element-icon"
        src={`${getApiBase()}/element-icons/${iconFile}`}
        alt={element}
        draggable={false}
      />
    </span>
  );
}

function getPetImageUrl(asset: PetAsset): string {
  if (/^(https?:|data:|blob:)/.test(asset.imagePath)) {
    return asset.imagePath;
  }
  const fileName = asset.imagePath.replace(/^assets\/pets\//, "");
  return `${getApiBase()}/assets/pets/${encodeURIComponent(fileName)}?v=${encodeURIComponent(asset.updatedAt)}`;
}

interface NamePlacement {
  left: number;
  top: number;
  width: number;
  textScale: number;
  fontSize: number;
}

interface VisualBounds {
  left: number;
  right: number;
  bottom: number;
  width: number;
}

interface LayoutMetrics {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

interface AlphaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const alphaBoundsCache = new Map<string, AlphaBounds>();
const alphaBoundsCacheLimit = 256;

function getRenderedVisualBounds(
  image: HTMLImageElement | null,
  cardRect: DOMRect,
  metrics: LayoutMetrics
): VisualBounds {
  if (!image || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return {
      left: metrics.width * 0.12,
      right: metrics.width * 0.88,
      bottom: metrics.height * 0.72,
      width: metrics.width * 0.76
    };
  }

  const imageRect = image.getBoundingClientRect();
  const alphaBounds = getImageAlphaBounds(image);
  const imageLayoutRect = {
    left: (imageRect.left - cardRect.left) / metrics.scaleX,
    top: (imageRect.top - cardRect.top) / metrics.scaleY,
    width: imageRect.width / metrics.scaleX,
    height: imageRect.height / metrics.scaleY
  };
  const renderedRect = getContainedImageRect(imageLayoutRect, image.naturalWidth, image.naturalHeight);
  const scaleX = renderedRect.width / image.naturalWidth;
  const scaleY = renderedRect.height / image.naturalHeight;
  const left = renderedRect.left + alphaBounds.minX * scaleX;
  const right = renderedRect.left + (alphaBounds.maxX + 1) * scaleX;
  const bottom = renderedRect.top + (alphaBounds.maxY + 1) * scaleY;

  return {
    left,
    right,
    bottom,
    width: Math.max(1, right - left)
  };
}

function getLayoutMetrics(element: HTMLElement, rect: DOMRect): LayoutMetrics {
  const width = element.offsetWidth || rect.width;
  const height = element.offsetHeight || rect.height;
  return {
    width,
    height,
    scaleX: width > 0 ? rect.width / width : 1,
    scaleY: height > 0 ? rect.height / height : 1
  };
}

function getContainedImageRect(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  naturalWidth: number,
  naturalHeight: number
): Pick<DOMRect, "left" | "top" | "width" | "height"> {
  const boxRatio = rect.width / rect.height;
  const imageRatio = naturalWidth / naturalHeight;

  if (!Number.isFinite(boxRatio) || !Number.isFinite(imageRatio) || rect.width <= 0 || rect.height <= 0) {
    return rect;
  }

  if (imageRatio > boxRatio) {
    const height = rect.width / imageRatio;
    return {
      left: rect.left,
      top: rect.top + (rect.height - height) / 2,
      width: rect.width,
      height
    };
  }

  const width = rect.height * imageRatio;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top,
    width,
    height: rect.height
  };
}

function getImageAlphaBounds(image: HTMLImageElement): AlphaBounds {
  const key = `${image.currentSrc || image.src}:${image.naturalWidth}x${image.naturalHeight}`;
  const cached = alphaBoundsCache.get(key);
  if (cached) {
    return cached;
  }

  const fallback = {
    minX: 0,
    minY: 0,
    maxX: image.naturalWidth - 1,
    maxY: image.naturalHeight - 1
  };

  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return fallback;
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const bounds = maxX >= 0 ? { minX, minY, maxX, maxY } : fallback;
    rememberAlphaBounds(key, bounds);
    return bounds;
  } catch {
    return fallback;
  }
}

function rememberAlphaBounds(key: string, bounds: AlphaBounds): void {
  if (alphaBoundsCache.size >= alphaBoundsCacheLimit) {
    const oldestKey = alphaBoundsCache.keys().next().value;
    if (oldestKey) {
      alphaBoundsCache.delete(oldestKey);
    }
  }
  alphaBoundsCache.set(key, bounds);
}

function measureTextWidth(nameBar: HTMLElement, text: string, nameLabel: NameLabelStyle): number {
  const nameNode = nameBar.querySelector(".pet-name");
  const computed = window.getComputedStyle(nameNode instanceof HTMLElement ? nameNode : nameBar);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return text.length * 16;
  }
  context.font = computed.font || `${nameLabel.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  return context.measureText(text).width;
}

function readInheritedPx(element: HTMLElement, property: string, fallback: number): number {
  const raw = window.getComputedStyle(element).getPropertyValue(property).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
