import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { canonicalizeEngineManifest, EngineManifest, EngineManifestEntry } from '../electron/engine-trust';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

// 1. Resolve signing key from environment or .env
if (!process.env.DARKSTAR_BUILD_PRIVATE_KEY && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DARKSTAR_BUILD_PRIVATE_KEY\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/s);
  if (match) {
    process.env.DARKSTAR_BUILD_PRIVATE_KEY = (match[1] || match[2] || match[3] || '').trim();
  }
}

const privateKeyPem = process.env.DARKSTAR_BUILD_PRIVATE_KEY;
if (!privateKeyPem) {
  throw new Error('DARKSTAR_BUILD_PRIVATE_KEY is required to sign engine-manifest.json.');
}

// 2. Define supported engines
const engines: EngineManifestEntry[] = [];

// Windows x64 binary in bin/
const winBinPath = path.join(rootDir, 'bin', 'd-arx-512.exe');
if (fs.existsSync(winBinPath)) {
  const fileBuf = fs.readFileSync(winBinPath);
  const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
  engines.push({
    platform: 'win32',
    arch: 'x64',
    filename: 'd-arx-512.exe',
    sha256,
    size: fileBuf.length,
  });
  console.log(`Indexed local engine: win32/x64 (${sha256}, ${fileBuf.length} bytes)`);
}

// Canonicalize and sign
const payload = {
  version: '3.0.0',
  release: 'v3.0.0',
  engines,
};

const canonicalStr = canonicalizeEngineManifest(payload);
const signatureHex = crypto.sign(null, Buffer.from(canonicalStr, 'utf8'), privateKeyPem).toString('hex');

const signedManifest: EngineManifest = {
  ...payload,
  signature: signatureHex,
};

// Write to electron/engine-manifest.json
const targetPath = path.join(rootDir, 'electron', 'engine-manifest.json');
fs.writeFileSync(targetPath, JSON.stringify(signedManifest, null, 2));
console.log(`Signed engine manifest written to ${targetPath}`);

// If dist/electron exists, copy there too
const distPath = path.join(rootDir, 'dist', 'electron', 'engine-manifest.json');
if (fs.existsSync(path.dirname(distPath))) {
  fs.writeFileSync(distPath, JSON.stringify(signedManifest, null, 2));
  console.log(`Copied engine manifest to ${distPath}`);
}
