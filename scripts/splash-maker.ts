import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface SplashOptions {
  inputPath: string;
  outputPath: string;
  canvasSize: [number, number];
  logoSize: [number, number];
  bgColor: RGB;
  textColor: RGB;
  spinnerColor: RGB;
  totalFrames: number;
  delayMs: number;
}

function hexToRgb(hexStr: string): RGB {
  const clean = hexStr.replace(/^#/, '');
  if (clean.length !== 6) {
    console.error(chalk.red(`Error: Invalid hex color code '${hexStr}'. Expected 6-character hex like '#000000'.`));
    process.exit(1);
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Minimal vector font definition for the word "INSTALLING"
const GLYPHS: Record<string, [number, number, number, number][]> = {
  I: [[0.5, 0, 0.5, 1]],
  N: [
    [0, 1, 0, 0],
    [0, 0, 1, 1],
    [1, 1, 1, 0],
  ],
  S: [
    [1, 0, 0, 0],
    [0, 0, 0, 0.48],
    [0, 0.48, 1, 0.52],
    [1, 0.52, 1, 1],
    [1, 1, 0, 1],
  ],
  T: [
    [0, 0, 1, 0],
    [0.5, 0, 0.5, 1],
  ],
  A: [
    [0, 1, 0.5, 0],
    [0.5, 0, 1, 1],
    [0.22, 0.62, 0.78, 0.62],
  ],
  L: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
  ],
  G: [
    [1, 0, 0, 0],
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0.5],
    [1, 0.5, 0.5, 0.5],
  ],
};

function resizeLogo(srcPng: PNG, targetW: number, targetH: number): Uint8Array {
  const dst = new Uint8Array(targetW * targetH * 4);
  const xRatio = srcPng.width / targetW;
  const yRatio = srcPng.height / targetH;

  for (let dy = 0; dy < targetH; dy++) {
    for (let dx = 0; dx < targetW; dx++) {
      const srcX = dx * xRatio;
      const srcY = dy * yRatio;
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcPng.width - 1);
      const y1 = Math.min(y0 + 1, srcPng.height - 1);
      const xWeight = srcX - x0;
      const yWeight = srcY - y0;

      const idx00 = (y0 * srcPng.width + x0) * 4;
      const idx10 = (y0 * srcPng.width + x1) * 4;
      const idx01 = (y1 * srcPng.width + x0) * 4;
      const idx11 = (y1 * srcPng.width + x1) * 4;

      const dstIdx = (dy * targetW + dx) * 4;

      for (let c = 0; c < 4; c++) {
        const top = srcPng.data[idx00 + c] * (1 - xWeight) + srcPng.data[idx10 + c] * xWeight;
        const bottom = srcPng.data[idx01 + c] * (1 - xWeight) + srcPng.data[idx11 + c] * xWeight;
        dst[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return dst;
}

// Median-cut color quantization to generate a compact 256-color palette
function buildPalette(pixels: Uint8Array, maxColors = 256): Uint8Array {
  const colorMap = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const existing = colorMap.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      colorMap.set(key, { r, g, b, count: 1 });
    }
  }

  const colors = Array.from(colorMap.values()).map((c) => ({
    r: Math.round(c.r / c.count),
    g: Math.round(c.g / c.count),
    b: Math.round(c.b / c.count),
    count: c.count,
  }));

  if (colors.length <= maxColors) {
    const pal = new Uint8Array(maxColors * 3);
    for (let i = 0; i < colors.length; i++) {
      pal[i * 3] = colors[i].r;
      pal[i * 3 + 1] = colors[i].g;
      pal[i * 3 + 2] = colors[i].b;
    }
    return pal;
  }

  type ColorBox = typeof colors;
  const boxes: ColorBox[] = [colors];

  function getRange(box: ColorBox) {
    let minR = 255,
      maxR = 0,
      minG = 255,
      maxG = 0,
      minB = 255,
      maxB = 0;
    for (const c of box) {
      if (c.r < minR) minR = c.r;
      if (c.r > maxR) maxR = c.r;
      if (c.g < minG) minG = c.g;
      if (c.g > maxG) maxG = c.g;
      if (c.b < minB) minB = c.b;
      if (c.b > maxB) maxB = c.b;
    }
    const rRange = maxR - minR;
    const gRange = maxG - minG;
    const bRange = maxB - minB;
    const maxRange = Math.max(rRange, gRange, bRange);
    const axis: 'r' | 'g' | 'b' = maxRange === rRange ? 'r' : maxRange === gRange ? 'g' : 'b';
    return { axis, maxRange };
  }

  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length > 1) {
        const { maxRange } = getRange(boxes[i]);
        if (maxRange > bestRange) {
          bestRange = maxRange;
          bestIdx = i;
        }
      }
    }
    if (bestIdx === -1 || bestRange === 0) break;

    const box = boxes[bestIdx];
    const { axis } = getRange(box);
    box.sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
  }

  const palette = new Uint8Array(maxColors * 3);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    let totalCount = 0,
      sumR = 0,
      sumG = 0,
      sumB = 0;
    for (const c of box) {
      sumR += c.r * c.count;
      sumG += c.g * c.count;
      sumB += c.b * c.count;
      totalCount += c.count;
    }
    palette[i * 3] = Math.round(sumR / totalCount);
    palette[i * 3 + 1] = Math.round(sumG / totalCount);
    palette[i * 3 + 2] = Math.round(sumB / totalCount);
  }

  return palette;
}

function createColorMatcher(palette: Uint8Array, numColors: number) {
  const cache = new Int16Array(32 * 32 * 32).fill(-1);
  return function match(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cached = cache[key];
    if (cached !== -1) return cached;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < numColors; i++) {
      const pr = palette[i * 3];
      const pg = palette[i * 3 + 1];
      const pb = palette[i * 3 + 2];
      const dr = r - pr;
      const dg = g - pg;
      const db = b - pb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        if (dist === 0) break;
      }
    }
    cache[key] = bestIdx;
    return bestIdx;
  };
}

// Standard GIF LZW compression algorithm
function encodeLZW(minCodeSize: number, indexedPixels: Uint8Array): Buffer {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = clearCode + 2;

  const dict = new Map<number, number>();
  function resetDict() {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = clearCode + 2;
  }

  const subBlocks: Buffer[] = [];
  const curSubBlock: number[] = [];
  let curByte = 0;
  let curBits = 0;

  function writeBits(val: number, bits: number) {
    curByte |= val << curBits;
    curBits += bits;
    while (curBits >= 8) {
      curSubBlock.push(curByte & 0xff);
      curByte >>= 8;
      curBits -= 8;
      if (curSubBlock.length === 255) {
        subBlocks.push(Buffer.from([255, ...curSubBlock]));
        curSubBlock.length = 0;
      }
    }
  }

  function flushBits() {
    if (curBits > 0) {
      curSubBlock.push(curByte & 0xff);
      curByte = 0;
      curBits = 0;
    }
    if (curSubBlock.length > 0) {
      subBlocks.push(Buffer.from([curSubBlock.length, ...curSubBlock]));
      curSubBlock.length = 0;
    }
    subBlocks.push(Buffer.from([0])); // Block terminator
  }

  writeBits(clearCode, codeSize);
  let prefix = indexedPixels[0];

  for (let i = 1; i < indexedPixels.length; i++) {
    const k = indexedPixels[i];
    const key = (prefix << 8) | k;
    const code = dict.get(key);
    if (code !== undefined) {
      prefix = code;
    } else {
      writeBits(prefix, codeSize);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        resetDict();
      }
      prefix = k;
    }
  }
  writeBits(prefix, codeSize);
  writeBits(eoiCode, codeSize);
  flushBits();

  return Buffer.concat([Buffer.from([minCodeSize]), ...subBlocks]);
}

function buildGif(width: number, height: number, palette: Uint8Array, frames: Uint8Array[], delayMs: number): Buffer {
  const parts: Buffer[] = [];

  // Header
  parts.push(Buffer.from('GIF89a'));

  // Logical Screen Descriptor
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(width, 0);
  lsd.writeUInt16LE(height, 2);
  lsd[4] = 0xf7; // GCT flag=1, color res=7, sort=0, size=7 (256 colors)
  lsd[5] = 0x00; // Background index
  lsd[6] = 0x00; // Pixel aspect ratio
  parts.push(lsd);

  // Global Color Table
  const gct = Buffer.alloc(768);
  gct.set(palette.subarray(0, 768));
  parts.push(gct);

  // Netscape 2.0 Loop Extension
  parts.push(Buffer.from([0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00]));

  const delayHundredths = Math.max(1, Math.round(delayMs / 10));

  for (const framePixels of frames) {
    // Graphic Control Extension
    const gce = Buffer.alloc(8);
    gce[0] = 0x21;
    gce[1] = 0xf9;
    gce[2] = 0x04;
    gce[3] = 0x00; // Disposal: unspecified
    gce.writeUInt16LE(delayHundredths, 4);
    gce[6] = 0x00; // Transparent index
    gce[7] = 0x00; // Terminator
    parts.push(gce);

    // Image Descriptor
    const id = Buffer.alloc(10);
    id[0] = 0x2c;
    id.writeUInt16LE(0, 1);
    id.writeUInt16LE(0, 3);
    id.writeUInt16LE(width, 5);
    id.writeUInt16LE(height, 7);
    id[9] = 0x00;
    parts.push(id);

    // Image Data
    parts.push(encodeLZW(8, framePixels));
  }

  // Trailer
  parts.push(Buffer.from([0x3b]));

  return Buffer.concat(parts);
}

export function createSplashGif(options: SplashOptions): void {
  const [canvasW, canvasH] = options.canvasSize;
  const [logoW, logoH] = options.logoSize;

  console.log(chalk.cyan(`Input: ${options.inputPath}`));
  console.log(chalk.cyan(`Output: ${options.outputPath}`));
  console.log(chalk.cyan(`Canvas: ${canvasW}x${canvasH}, Logo: ${logoW}x${logoH}`));

  if (!fs.existsSync(options.inputPath)) {
    throw new Error(`Input logo file not found: ${options.inputPath}`);
  }

  const rawLogo = fs.readFileSync(options.inputPath);
  const logoPng = PNG.sync.read(rawLogo);
  const resizedLogo = resizeLogo(logoPng, logoW, logoH);

  const logoX = Math.floor((canvasW - logoW) / 2);
  const logoY = 20;

  // Base canvas RGB buffer (logo pre-composited over background)
  const baseRgb = new Uint8Array(canvasW * canvasH * 3);
  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const idx = (y * canvasW + x) * 3;
      baseRgb[idx] = options.bgColor.r;
      baseRgb[idx + 1] = options.bgColor.g;
      baseRgb[idx + 2] = options.bgColor.b;
    }
  }

  // Composite logo
  for (let ly = 0; ly < logoH; ly++) {
    for (let lx = 0; lx < logoW; lx++) {
      const srcIdx = (ly * logoW + lx) * 4;
      const alpha = resizedLogo[srcIdx + 3] / 255;
      if (alpha <= 0) continue;

      const cx = logoX + lx;
      const cy = logoY + ly;
      if (cx >= 0 && cx < canvasW && cy >= 0 && cy < canvasH) {
        const dstIdx = (cy * canvasW + cx) * 3;
        const sr = resizedLogo[srcIdx];
        const sg = resizedLogo[srcIdx + 1];
        const sb = resizedLogo[srcIdx + 2];
        baseRgb[dstIdx] = Math.round(baseRgb[dstIdx] * (1 - alpha) + sr * alpha);
        baseRgb[dstIdx + 1] = Math.round(baseRgb[dstIdx + 1] * (1 - alpha) + sg * alpha);
        baseRgb[dstIdx + 2] = Math.round(baseRgb[dstIdx + 2] * (1 - alpha) + sb * alpha);
      }
    }
  }

  // Text: "INSTALLING"
  const textStr = 'INSTALLING';
  const charW = 16;
  const charH = 22;
  const charSpacing = 5;
  const strokeW = 3.2;
  const textTotalW = textStr.length * charW + (textStr.length - 1) * charSpacing;
  const textStartX = Math.floor((canvasW - textTotalW) / 2);

  const spinnerRadius = 25;
  const spinnerCenterX = Math.floor(canvasW / 2);
  const spinnerCenterY = canvasH - 50;
  const textY = spinnerCenterY - spinnerRadius - charH - 25;

  // Composite text onto base canvas
  for (let ci = 0; ci < textStr.length; ci++) {
    const char = textStr[ci];
    const glyph = GLYPHS[char];
    if (!glyph) continue;

    const gx = textStartX + ci * (charW + charSpacing);
    const gy = textY;

    // Scan bounding box of character
    const pad = Math.ceil(strokeW);
    const minX = Math.max(0, gx - pad);
    const maxX = Math.min(canvasW - 1, gx + charW + pad);
    const minY = Math.max(0, gy - pad);
    const maxY = Math.min(canvasH - 1, gy + charH + pad);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let minDist = Infinity;
        for (const [x1f, y1f, x2f, y2f] of glyph) {
          const x1 = gx + x1f * charW;
          const y1 = gy + y1f * charH;
          const x2 = gx + x2f * charW;
          const y2 = gy + y2f * charH;
          const d = distToSegment(px, py, x1, y1, x2, y2);
          if (d < minDist) minDist = d;
        }

        const alpha = Math.max(0, Math.min(1, 1 - (minDist - (strokeW / 2 - 0.5))));
        if (alpha > 0) {
          const dstIdx = (py * canvasW + px) * 3;
          baseRgb[dstIdx] = Math.round(baseRgb[dstIdx] * (1 - alpha) + options.textColor.r * alpha);
          baseRgb[dstIdx + 1] = Math.round(baseRgb[dstIdx + 1] * (1 - alpha) + options.textColor.g * alpha);
          baseRgb[dstIdx + 2] = Math.round(baseRgb[dstIdx + 2] * (1 - alpha) + options.textColor.b * alpha);
        }
      }
    }
  }

  // Render all animated frames (adding the rotating spinner)
  const spinnerThickness = 6;
  const spinnerBoundingPad = Math.ceil(spinnerRadius + spinnerThickness + 2);
  const sMinX = Math.max(0, spinnerCenterX - spinnerBoundingPad);
  const sMaxX = Math.min(canvasW - 1, spinnerCenterX + spinnerBoundingPad);
  const sMinY = Math.max(0, spinnerCenterY - spinnerBoundingPad);
  const sMaxY = Math.min(canvasH - 1, spinnerCenterY + spinnerBoundingPad);

  const rawFramesRgb: Uint8Array[] = [];

  for (let f = 0; f < options.totalFrames; f++) {
    const frameRgb = new Uint8Array(baseRgb);
    const startAngle = (f * (360 / options.totalFrames)) % 360;
    const endAngle = (startAngle + 270) % 360;

    const radStart = (startAngle * Math.PI) / 180;
    const radEnd = ((startAngle + 270) * Math.PI) / 180;
    const cap1X = spinnerCenterX + spinnerRadius * Math.cos(radStart);
    const cap1Y = spinnerCenterY + spinnerRadius * Math.sin(radStart);
    const cap2X = spinnerCenterX + spinnerRadius * Math.cos(radEnd);
    const cap2Y = spinnerCenterY + spinnerRadius * Math.sin(radEnd);

    for (let py = sMinY; py <= sMaxY; py++) {
      for (let px = sMinX; px <= sMaxX; px++) {
        const dx = px - spinnerCenterX;
        const dy = py - spinnerCenterY;
        const dist = Math.hypot(dx, dy);
        const rDist = Math.abs(dist - spinnerRadius);

        let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg < 0) deg += 360;

        let relAngle = (deg - startAngle) % 360;
        if (relAngle < 0) relAngle += 360;

        let alpha = 0;
        if (relAngle <= 270) {
          alpha = Math.max(0, Math.min(1, 1 - (rDist - (spinnerThickness / 2 - 0.5))));
        } else {
          const capDist = Math.min(Math.hypot(px - cap1X, py - cap1Y), Math.hypot(px - cap2X, py - cap2Y));
          alpha = Math.max(0, Math.min(1, 1 - (capDist - (spinnerThickness / 2 - 0.5))));
        }

        if (alpha > 0) {
          const dstIdx = (py * canvasW + px) * 3;
          frameRgb[dstIdx] = Math.round(frameRgb[dstIdx] * (1 - alpha) + options.spinnerColor.r * alpha);
          frameRgb[dstIdx + 1] = Math.round(frameRgb[dstIdx + 1] * (1 - alpha) + options.spinnerColor.g * alpha);
          frameRgb[dstIdx + 2] = Math.round(frameRgb[dstIdx + 2] * (1 - alpha) + options.spinnerColor.b * alpha);
        }
      }
    }
    rawFramesRgb.push(frameRgb);
  }

  // Generate palette across all frames
  console.log(chalk.blue('Generating 256-color palette...'));
  const samplePixels = new Uint8Array(rawFramesRgb[0].length * 3);
  samplePixels.set(rawFramesRgb[0]);
  samplePixels.set(rawFramesRgb[Math.floor(options.totalFrames / 2)], rawFramesRgb[0].length);
  samplePixels.set(rawFramesRgb[options.totalFrames - 1], rawFramesRgb[0].length * 2);

  const palette = buildPalette(samplePixels, 256);
  const matcher = createColorMatcher(palette, 256);

  console.log(chalk.blue('Quantizing and compressing animated frames...'));
  const indexedFrames: Uint8Array[] = [];
  for (let f = 0; f < options.totalFrames; f++) {
    const raw = rawFramesRgb[f];
    const indexed = new Uint8Array(canvasW * canvasH);
    for (let i = 0; i < indexed.length; i++) {
      indexed[i] = matcher(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]);
    }
    indexedFrames.push(indexed);
  }

  const gifBuffer = buildGif(canvasW, canvasH, palette, indexedFrames, options.delayMs);
  const outputDir = path.dirname(path.resolve(options.outputPath));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(options.outputPath, gifBuffer);
  console.log(chalk.green(`\n✨ Successfully created animated installer splash GIF at: ${options.outputPath} (${(gifBuffer.length / 1024).toFixed(1)} KB)\n`));
}

// CLI argument parsing
function runCli() {
  const args = process.argv.slice(2);

  let input = 'public/assets/img/logo-white.png';
  if (!fs.existsSync(input)) {
    if (fs.existsSync('logo.png')) input = 'logo.png';
    else if (fs.existsSync('public/favicon.png')) input = 'public/favicon.png';
  }

  let output = 'public/assets/img/splash_installer.gif';
  let bgColor = '#000000';
  let textColor = '#ffffff';
  let spinnerColor = '#ffffff';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      input = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      output = args[++i];
    } else if (arg === '--bg-color' || arg === '-bg') {
      bgColor = args[++i];
    } else if (arg === '--text-color' || arg === '-tc') {
      textColor = args[++i];
    } else if (arg === '--spinner-color' || arg === '-sc') {
      spinnerColor = args[++i];
    }
  }

  createSplashGif({
    inputPath: input,
    outputPath: output,
    canvasSize: [500, 650],
    logoSize: [400, 400],
    bgColor: hexToRgb(bgColor),
    textColor: hexToRgb(textColor),
    spinnerColor: hexToRgb(spinnerColor),
    totalFrames: 30,
    delayMs: 35,
  });
}

// Execute if run directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runCli();
}
