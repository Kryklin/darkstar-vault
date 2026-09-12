import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { app, dialog } from 'electron';
import * as path from 'path';

export async function verifyIntegrity(): Promise<void> {
  // Only verify in packaged mode to avoid friction during development Watch mode
  // where files update incrementally.
  if (!app.isPackaged && !process.env['FORCE_INTEGRITY_CHECK']) {
    return;
  }

  const distPath = __dirname;
  const integrityPath = path.join(distPath, 'integrity.json');

  try {
    const integrityData = JSON.parse(await fs.readFile(integrityPath, 'utf8'));

    for (const [file, expectedHash] of Object.entries(integrityData)) {
      const filePath = path.join(distPath, file);
      const fileBuffer = await fs.readFile(filePath);

      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const actualHash = hashSum.digest('hex');

      if (actualHash !== expectedHash) {
        throw new Error(`Integrity check failed for ${file}.`);
      }
    }
    console.log('Integrity verification passed.');
  } catch (error: unknown) {
    console.error('Anti-Tamper: Integrity check failed!', error);
    dialog.showErrorBox('Security Alert: Integrity Verification Failed', 'The application executable appears to have been modified or corrupted. To protect your data, the application will now exit.');
    app.exit(1);
    throw error;
  }
}
