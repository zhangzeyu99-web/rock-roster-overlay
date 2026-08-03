import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "public", "room-player-bars", "s3-clover-hinge.png");
const outputPath = path.join(root, "public", "room-player-bars", "s3-clover-hinge-wide.png");
const source = PNG.sync.read(fs.readFileSync(sourcePath));
const output = new PNG({ width: source.width, height: source.height });

const segments = [
  { sourceX: 0, sourceWidth: 600, targetX: 0, targetWidth: 600 },
  { sourceX: 600, sourceWidth: 200, targetX: 600, targetWidth: 178 },
  { sourceX: 800, sourceWidth: 18, targetX: 778, targetWidth: 18 },
  { sourceX: 818, sourceWidth: 6, targetX: 796, targetWidth: 27 },
  { sourceX: 824, sourceWidth: 29, targetX: 823, targetWidth: 29 },
  { sourceX: 853, sourceWidth: 6, targetX: 852, targetWidth: 28 },
  { sourceX: 859, sourceWidth: 18, targetX: 880, targetWidth: 18 },
  { sourceX: 877, sourceWidth: 200, targetX: 898, targetWidth: 179 },
  { sourceX: 1077, sourceWidth: 600, targetX: 1077, targetWidth: 600 }
];

for (const segment of segments) {
  resizeHorizontalSegment(source, output, segment);
}

fs.writeFileSync(outputPath, PNG.sync.write(output));
console.log(`Wrote ${path.relative(root, outputPath)} (${output.width}x${output.height})`);

function resizeHorizontalSegment(image, target, { sourceX, sourceWidth, targetX, targetWidth }) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourcePosition = sourceX + ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const leftX = Math.max(sourceX, Math.min(sourceX + sourceWidth - 1, Math.floor(sourcePosition)));
      const rightX = Math.max(sourceX, Math.min(sourceX + sourceWidth - 1, leftX + 1));
      const mix = Math.max(0, Math.min(1, sourcePosition - leftX));
      const leftOffset = (y * image.width + leftX) * 4;
      const rightOffset = (y * image.width + rightX) * 4;
      const targetOffset = (y * target.width + targetX + x) * 4;
      blendPixel(image.data, target.data, leftOffset, rightOffset, targetOffset, mix);
    }
  }
}

function blendPixel(sourceData, targetData, leftOffset, rightOffset, targetOffset, mix) {
  const leftAlpha = sourceData[leftOffset + 3] / 255;
  const rightAlpha = sourceData[rightOffset + 3] / 255;
  const alpha = leftAlpha * (1 - mix) + rightAlpha * mix;
  targetData[targetOffset + 3] = Math.round(alpha * 255);

  for (let channel = 0; channel < 3; channel += 1) {
    if (alpha === 0) {
      targetData[targetOffset + channel] = 0;
      continue;
    }
    const premultiplied =
      sourceData[leftOffset + channel] * leftAlpha * (1 - mix) +
      sourceData[rightOffset + channel] * rightAlpha * mix;
    targetData[targetOffset + channel] = Math.round(premultiplied / alpha);
  }
}
