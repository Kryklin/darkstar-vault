import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distRoot = path.join(__dirname, '..', 'dist');
const electronDistPath = path.join(distRoot, 'electron');
const browserDistPath = path.join(distRoot, 'darkstar', 'browser');
const integrity: Record<string, string> = {};

function hashFile(fullPath: string, relPath: string) {
  if (fs.existsSync(fullPath)) {
    const fileBuffer = fs.readFileSync(fullPath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    integrity[relPath.replace(/\\/g, '/')] = hashSum.digest('hex');
  } else {
    console.warn(`File not found for integrity hashing: ${relPath}`);
  }
}

// 1. Electron Main / Preload Runtime
const electronFiles = ['main.js', 'preload.js', 'preload_handshake.js', 'trust-anchor.js'];
electronFiles.forEach((file) => {
  hashFile(path.join(electronDistPath, file), `electron/${file}`);
});

// 2. Angular Renderer Distribution (JS, HTML, CSS)
function scanDirectory(dir: string): string[] {
  let files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(scanDirectory(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

if (fs.existsSync(browserDistPath)) {
  const rendererFiles = scanDirectory(browserDistPath);
  for (const fullPath of rendererFiles) {
    const ext = path.extname(fullPath).toLowerCase();
    // Include all script bundles, polyfills, chunks, and index.html
    if (['.js', '.html', '.css'].includes(ext)) {
      const relToDist = path.relative(distRoot, fullPath);
      hashFile(fullPath, relToDist);
    }
  }
  console.log(`Hashed ${Object.keys(integrity).length} runtime & renderer files for integrity manifest.`);
} else {
  console.warn(`Warning: Angular browser distribution not found at ${browserDistPath}`);
}

// Canonical serialization for deterministic signing
const canonicalManifest = JSON.stringify(integrity, Object.keys(integrity).sort());

// Basic .env loader to support local signed builds
const envPath = path.join(__dirname, '..', '.env');
if (!process.env.DARKSTAR_BUILD_PRIVATE_KEY && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DARKSTAR_BUILD_PRIVATE_KEY\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/s);
  if (match) {
    process.env.DARKSTAR_BUILD_PRIVATE_KEY = (match[1] || match[2] || match[3] || '').trim();
  }
}

// Build-time signing key: must be provided via environment or secure .env
const signingKey = process.env.DARKSTAR_BUILD_PRIVATE_KEY;
if (!signingKey) {
  throw new Error('DARKSTAR_BUILD_PRIVATE_KEY is required for production integrity signing.');
}

const signatureHex = crypto.sign(null, Buffer.from(canonicalManifest, 'utf8'), signingKey).toString('hex');

const signedIntegrityPayload = {
  version: 1,
  algorithm: 'ed25519',
  timestamp: Date.now(),
  manifest: integrity,
  signature: signatureHex,
};

fs.writeFileSync(path.join(electronDistPath, 'integrity.json'), JSON.stringify(signedIntegrityPayload, null, 2));
console.log('Authenticated integrity manifest with Ed25519 signature generated successfully.');
