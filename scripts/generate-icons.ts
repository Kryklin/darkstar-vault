import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * High-quality area-averaging downsampler with alpha premultiplication.
 * Prevents dark halos around transparent edges and yields crisp downscaled icons.
 */
function downsamplePng(srcPng: PNG, targetW: number, targetH: number): PNG {
  const dstPng = new PNG({ width: targetW, height: targetH });
  const xRatio = srcPng.width / targetW;
  const yRatio = srcPng.height / targetH;

  for (let dy = 0; dy < targetH; dy++) {
    const srcYStart = Math.floor(dy * yRatio);
    const srcYEnd = Math.min(srcPng.height, Math.floor((dy + 1) * yRatio));

    for (let dx = 0; dx < targetW; dx++) {
      const srcXStart = Math.floor(dx * xRatio);
      const srcXEnd = Math.min(srcPng.width, Math.floor((dx + 1) * xRatio));

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;

      for (let sy = srcYStart; sy < srcYEnd; sy++) {
        for (let sx = srcXStart; sx < srcXEnd; sx++) {
          const idx = (sy * srcPng.width + sx) * 4;
          const a = srcPng.data[idx + 3] / 255;
          rSum += srcPng.data[idx] * a;
          gSum += srcPng.data[idx + 1] * a;
          bSum += srcPng.data[idx + 2] * a;
          aSum += srcPng.data[idx + 3];
          count++;
        }
      }

      const dstIdx = (dy * targetW + dx) * 4;
      if (count > 0 && aSum > 0) {
        const avgAlpha = aSum / count;
        const normFactor = avgAlpha / 255;
        dstPng.data[dstIdx] = Math.round(rSum / count / normFactor);
        dstPng.data[dstIdx + 1] = Math.round(gSum / count / normFactor);
        dstPng.data[dstIdx + 2] = Math.round(bSum / count / normFactor);
        dstPng.data[dstIdx + 3] = Math.round(avgAlpha);
      } else {
        dstPng.data[dstIdx] = 0;
        dstPng.data[dstIdx + 1] = 0;
        dstPng.data[dstIdx + 2] = 0;
        dstPng.data[dstIdx + 3] = 0;
      }
    }
  }

  return dstPng;
}

/**
 * Creates standard 32bpp DIB buffer (BITMAPINFOHEADER + bottom-up BGRA + 1bpp AND mask).
 */
function pngToDibBuffer(png: PNG): Buffer {
  const w = png.width;
  const h = png.height;
  const headerSize = 40;
  const xorSize = w * h * 4;
  const andRowBytes = Math.ceil(w / 32) * 4;
  const andSize = andRowBytes * h;
  const totalSize = headerSize + xorSize + andSize;

  const buf = Buffer.alloc(totalSize);

  // BITMAPINFOHEADER
  buf.writeUInt32LE(headerSize, 0); // biSize
  buf.writeInt32LE(w, 4); // biWidth
  buf.writeInt32LE(h * 2, 8); // biHeight (doubled for XOR + AND)
  buf.writeUInt16LE(1, 12); // biPlanes
  buf.writeUInt16LE(32, 14); // biBitCount
  buf.writeUInt32LE(0, 16); // biCompression (BI_RGB)
  buf.writeUInt32LE(xorSize + andSize, 20); // biSizeImage
  buf.writeInt32LE(0, 24); // biXPelsPerMeter
  buf.writeInt32LE(0, 28); // biYPelsPerMeter
  buf.writeUInt32LE(0, 32); // biClrUsed
  buf.writeUInt32LE(0, 36); // biClrImportant

  // XOR Bitmap (Bottom-up BGRA)
  let offset = headerSize;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      buf[offset] = png.data[srcIdx + 2]; // B
      buf[offset + 1] = png.data[srcIdx + 1]; // G
      buf[offset + 2] = png.data[srcIdx]; // R
      buf[offset + 3] = png.data[srcIdx + 3]; // A
      offset += 4;
    }
  }

  // AND Mask (0 = visible with alpha for 32bpp)
  // Buffer is already zero-filled by Buffer.alloc()

  return buf;
}

/**
 * Generates an ICO file containing multiple resolutions.
 * 256x256 is stored as PNG; smaller sizes as 32bpp DIBs.
 */
function createIco(layers: { size: number; buffer: Buffer }[]): Buffer {
  const count = layers.length;
  const headerSize = 6;
  const entrySize = 16;
  let currentOffset = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type (1 = ICO)
  header.writeUInt16LE(count, 4); // Number of images

  const dirEntries: Buffer[] = [];
  const imageBuffers: Buffer[] = [];

  for (const layer of layers) {
    const entry = Buffer.alloc(entrySize);
    const s = layer.size === 256 ? 0 : layer.size;
    entry.writeUInt8(s, 0); // Width
    entry.writeUInt8(s, 1); // Height
    entry.writeUInt8(0, 2); // Colors (0 = 256+ colors)
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(layer.buffer.length, 8); // Size of image
    entry.writeUInt32LE(currentOffset, 12); // Offset

    dirEntries.push(entry);
    imageBuffers.push(layer.buffer);
    currentOffset += layer.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

async function main() {
  const masterPath = path.resolve(__dirname, '../public/assets/img/logo-white.png');
  const targetIcoPath = path.resolve(__dirname, '../public/favicon.ico');

  console.log('🎨 Generating High-DPI Windows Multi-Resolution Icon...');
  console.log(`Source Master: ${masterPath}`);

  if (!fs.existsSync(masterPath)) {
    throw new Error(`Master logo not found: ${masterPath}`);
  }

  const masterBuf = fs.readFileSync(masterPath);
  const masterPng = PNG.sync.read(masterBuf);

  const targetSizes = [256, 128, 64, 48, 32, 24, 16];
  const layers: { size: number; buffer: Buffer }[] = [];

  for (const size of targetSizes) {
    console.log(` - Downsampling layer ${size}x${size}...`);
    const resized = downsamplePng(masterPng, size, size);

    if (size === 256) {
      // 256x256 is stored as PNG stream inside the ICO
      const pngBuf = PNG.sync.write(resized);
      layers.push({ size, buffer: pngBuf });
    } else {
      // 128 down to 16 are stored as 32bpp DIBs for maximum Windows compatibility
      const dibBuf = pngToDibBuffer(resized);
      layers.push({ size, buffer: dibBuf });
    }
  }

  const icoBuf = createIco(layers);
  fs.writeFileSync(targetIcoPath, icoBuf);

  console.log(`✨ Generated ${targetIcoPath} (${(icoBuf.length / 1024).toFixed(1)} KB) with ${layers.length} resolutions:`);
  targetSizes.forEach((s) => console.log(`   ✓ ${s}x${s} @ 32bpp`));
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
