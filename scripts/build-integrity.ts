import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronDistPath = path.join(__dirname, '..', 'dist', 'electron');
const filesToHash = ['main.js', 'preload.js', 'preload_handshake.js', 'trust-anchor.js'];
const integrity: Record<string, string> = {};

filesToHash.forEach((file) => {
  const filePath = path.join(electronDistPath, file);
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hex = hashSum.digest('hex');
    integrity[file] = hex;
  } else {
    console.warn(`File not found for integrity hashing: ${file}`);
  }
});

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
