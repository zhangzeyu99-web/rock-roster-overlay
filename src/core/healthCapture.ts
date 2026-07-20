export interface HealthImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array | number[];
}

export interface HealthDetectionOptions {
  minSaturation?: number;
  minBrightness?: number;
  minColumnFillRatio?: number;
}

export interface HealthDetectionResult {
  percent: number;
  confidence: number;
}

export function detectHpPercentFromRegion(
  imageData: HealthImageData,
  options: HealthDetectionOptions = {}
): HealthDetectionResult {
  const minSaturation = options.minSaturation ?? 0.28;
  const minBrightness = options.minBrightness ?? 0.28;
  const minColumnFillRatio = options.minColumnFillRatio ?? 0.22;
  const { width, height, data } = imageData;

  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { percent: 0, confidence: 0 };
  }

  const filledColumns: boolean[] = [];
  let totalColoredPixels = 0;
  for (let x = 0; x < width; x += 1) {
    let coloredPixels = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      if (isHpPixel(data[offset], data[offset + 1], data[offset + 2], minSaturation, minBrightness)) {
        coloredPixels += 1;
      }
    }
    totalColoredPixels += coloredPixels;
    filledColumns.push(coloredPixels / height >= minColumnFillRatio);
  }

  let contiguousFilled = 0;
  for (const filled of filledColumns) {
    if (!filled) {
      break;
    }
    contiguousFilled += 1;
  }

  const rawPercent = (contiguousFilled / width) * 100;
  const strayFilled = filledColumns.slice(contiguousFilled).filter(Boolean).length;
  const coloredRatio = totalColoredPixels / (width * height);
  const shapeConfidence = contiguousFilled > 0 ? 1 - strayFilled / Math.max(1, width - contiguousFilled) : 0;
  const colorConfidence = Math.min(1, coloredRatio / Math.max(0.01, (contiguousFilled / width) * 0.35));
  const confidence = Math.max(0, Math.min(1, shapeConfidence * 0.7 + colorConfidence * 0.3));

  if (contiguousFilled === 0 || confidence < 0.15) {
    return { percent: 0, confidence: roundConfidence(confidence) };
  }

  return {
    percent: Math.round(rawPercent),
    confidence: roundConfidence(confidence)
  };
}

export function smoothHealthPercent(previous: number, next: number, smoothing: number): number {
  const safeSmoothing = clampNumber(smoothing, 0, 0.95, 0.35);
  return Math.round(previous * safeSmoothing + next * (1 - safeSmoothing));
}

function isHpPixel(
  red: number,
  green: number,
  blue: number,
  minSaturation: number,
  minBrightness: number
): boolean {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;
  const saturation = max <= 0 ? 0 : (max - min) / max;
  return max >= minBrightness && saturation >= minSaturation;
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
