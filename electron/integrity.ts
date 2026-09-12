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
  return !app.isPackaged;
}

export async function verifyIntegrity(): Promise<void> {
  // Only verify in packaged mode to avoid friction during development Watch mode
  // where files update incrementally.
  if (!app.isPackaged && !process.env['FORCE_INTEGRITY_CHECK']) {
    integrityVerifiedState = true;
    return;
  }

  const distPath = __dirname;
  const integrityPath = path.join(distPath, 'integrity.json');

  try {
    const rawContent = await fs.readFile(integrityPath, 'utf8');
    const integrityPayload = JSON.parse(rawContent);

    let manifest: Record<string, string>;

    // 1. Digital Signature Verification against Embedded Trust Anchor
    if (integrityPayload && typeof integrityPayload === 'object' && 'manifest' in integrityPayload && 'signature' in integrityPayload) {
      const canonicalManifest = JSON.stringify(integrityPayload.manifest, Object.keys(integrityPayload.manifest).sort());
      const isSignatureValid = verifyEd25519Signature(canonicalManifest, integrityPayload.signature, DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY);

      if (!isSignatureValid) {
        throw new Error('Integrity manifest signature mismatch: unauthorized or modified integrity manifest detected.');
      }
      manifest = integrityPayload.manifest;
      console.log('[Anti-Tamper] Authenticated integrity manifest verified against Darkstar Trust Anchor.');
    } else if (integrityPayload && typeof integrityPayload === 'object') {
      // Legacy unsigned format fallback
      manifest = integrityPayload as Record<string, string>;
      console.warn('[Anti-Tamper] Notice: Unsigned legacy integrity format detected.');
    } else {
      throw new Error('Invalid or corrupted integrity.json structure.');
    }

    // 2. Individual Runtime Bundle SHA-256 Verification
    for (const [file, expectedHash] of Object.entries(manifest)) {
      const filePath = path.join(distPath, file);
      const fileBuffer = await fs.readFile(filePath);

      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const actualHash = hashSum.digest('hex');

      if (actualHash !== expectedHash) {
        throw new Error(`Integrity check failed for ${file}. Expected: ${expectedHash}, Actual: ${actualHash}`);
      }
    }
    integrityVerifiedState = true;
    console.log('[Anti-Tamper] All runtime bundles match authenticated integrity manifest.');
  } catch (error: unknown) {
    integrityVerifiedState = false;
    console.error('Anti-Tamper: Integrity check failed!', error);
    dialog.showErrorBox(
      'Security Alert: Integrity Verification Failed',
      'The application executable or integrity manifest appears to have been modified, tampered with, or corrupted. To protect your data, the application will now exit.',
    );
    app.exit(1);
    throw error;
  }
}
