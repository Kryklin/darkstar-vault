import * as path from 'path';
import type { BrowserWindow as BrowserWindowType, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

/**
 * Canonical containment check preventing path traversal, UNC paths, and null bytes.
 */
export function isPathContained(parentDir: string, targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (targetPath.includes('\0')) return false;
  // Disallow UNC paths on Windows (\\server\share or //server/share)
  if (/^[\/\\]{2}/.test(targetPath)) return false;

  const resolvedParent = path.resolve(parentDir);
  const resolvedTarget = path.resolve(targetPath);
  const rel = path.relative(resolvedParent, resolvedTarget);

  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Sanitizes vault filename against path traversal, null bytes, and illegal characters.
 */
export function sanitizeVaultFilename(filename: unknown): string {
  if (typeof filename !== 'string' || !filename) {
    throw new Error('Invalid filename: must be a non-empty string');
  }
  if (filename.includes('\0') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename: path traversal detected');
  }
  const base = path.basename(filename);
  if (base !== filename) {
    throw new Error('Invalid filename: path traversal detected');
  }
  if (!/^[a-zA-Z0-9_\-.]{1,255}$/.test(filename)) {
    throw new Error('Invalid filename: illegal characters or length');
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(filename)) {
    throw new Error('Invalid filename: reserved system device name');
  }
  return filename;
}

/**
 * Strict origin validator enforcing exact application origin:
 * - Production: app://localhost (host must be 'localhost', port must be empty)
 * - Development: http://localhost:4200 or http://127.0.0.1:4200
 */
export function isAllowedOrigin(urlStr: string, isPackaged: boolean): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    // Strict production origin: app://localhost exactly (hostname and host must be 'localhost', no port)
    if (parsed.protocol === 'app:' && parsed.hostname === 'localhost' && parsed.host === 'localhost' && parsed.port === '') {
      return true;
    }
    // Strict dev server origin: http://localhost:4200 or http://127.0.0.1:4200
    if (!isPackaged && parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === '4200') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates that an incoming IPC invocation originated from a trusted internal frame.
 * For production, the origin must be exactly 'app://localhost'.
 * For development, 'http://localhost:4200' is permitted.
 */
export function assertValidIpcSender(event: IpcMainInvokeEvent | IpcMainEvent, browserWindowLookup: (webContents: any) => BrowserWindowType | null, isPackaged: boolean): void {
  const senderWebContents = event.sender;
  if (!senderWebContents) {
    throw new Error('IPC Security Violation: Sender webContents is missing.');
  }
  const win = browserWindowLookup(senderWebContents);
  if (!win) {
    throw new Error('IPC Security Violation: Sender window not recognized.');
  }

  const frameUrl = (event as { senderFrame?: { url?: string } }).senderFrame?.url || (senderWebContents as { getURL?: () => string }).getURL?.();
  if (!frameUrl) {
    throw new Error('IPC Security Violation: Sender frame URL is missing.');
  }

  if (isAllowedOrigin(frameUrl, isPackaged)) {
    return;
  }

  throw new Error(`IPC Security Violation: Disallowed sender origin: ${frameUrl}`);
}
