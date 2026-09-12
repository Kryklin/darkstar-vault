import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { app, dialog } from 'electron';
import * as path from 'path';
import { DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY, verifyEd25519Signature } from './trust-anchor';

let integrityVerifiedState: boolean | null = null;

export function isIntegrityVerified(): boolean {
  if (integrityVerifiedState !== null) {
    return integrityVerifiedState;
  }
  // In unpacked development mode, integrity check is skipped unless forced
  return app ? !app.isPackaged : true;
}

export async function verifyIntegrity(): Promise<void> {
  // Only verify in packaged mode to avoid friction during development Watch mode
  // where files update incrementally.
  if (app && !app.isPackaged && !process.env['FORCE_INTEGRITY_CHECK']) {
    integrityVerifiedState = true;
    return;
  }

  const distPath = (await fs
    .stat(path.join(__dirname, 'integrity.json'))
    .then(() => true)
    .catch(() => false))
    ? __dirname
    : path.join(__dirname, '..', 'dist', 'electron');
  const integrityPath = path.join(distPath, 'integrity.json');

  try {
    const rawContent = await fs.readFile(integrityPath, 'utf8');
    const integrityPayload = JSON.parse(rawContent);

    // 1. Digital Signature Verification against Embedded Trust Anchor
    if (!integrityPayload || typeof integrityPayload !== 'object' || !('manifest' in integrityPayload) || !('signature' in integrityPayload)) {
      throw new Error('Integrity violation: unsigned or malformed integrity.json manifest. An authenticated Ed25519 signature is strictly required.');
    }

    const canonicalManifest = JSON.stringify(integrityPayload.manifest, Object.keys(integrityPayload.manifest).sort());
    const isSignatureValid = verifyEd25519Signature(canonicalManifest, integrityPayload.signature, DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY);

    if (!isSignatureValid) {
      throw new Error('Integrity manifest signature mismatch: unauthorized or modified integrity manifest detected.');
    }
    const manifest = integrityPayload.manifest as Record<string, string>;
    console.log('[Anti-Tamper] Authenticated integrity manifest verified against Darkstar Trust Anchor.');

    // 2. Individual Runtime Bundle & Angular Renderer SHA-256 Verification
    const distElectronPath = distPath;
    const distRootPath = path.resolve(distPath, '..');

    for (const [file, expectedHash] of Object.entries(manifest)) {
      const normalized = file.replace(/\\/g, '/');
      let filePath: string;
      if (normalized.startsWith('electron/') || normalized.startsWith('darkstar/')) {
        filePath = path.join(distRootPath, normalized);
      } else {
        filePath = path.join(distElectronPath, normalized);
      }

      const fileBuffer = await fs.readFile(filePath);

      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const actualHash = hashSum.digest('hex');

      if (actualHash !== expectedHash) {
        throw new Error(`Integrity check failed for ${file}. Expected: ${expectedHash}, Actual: ${actualHash}`);
      }
    }
    integrityVerifiedState = true;
    console.log('[Anti-Tamper] All runtime and renderer bundles match authenticated integrity manifest.');
  } catch (error: unknown) {
    integrityVerifiedState = false;
    if (dialog && typeof dialog.showErrorBox === 'function') {
      dialog.showErrorBox(
        'Security Alert: Integrity Verification Failed',
        'The application executable or integrity manifest appears to have been modified, tampered with, or corrupted. To protect your data, the application will now exit.',
      );
    }
    if (app && typeof app.exit === 'function') {
      app.exit(1);
    }
    throw error;
  }
}
