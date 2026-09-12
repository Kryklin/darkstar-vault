import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, autoUpdater, session, shell, safeStorage, dialog, protocol } from 'electron';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as crypto from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { updateElectronApp } from 'update-electron-app';
import { machineIdSync } from 'node-machine-id';
import squirrelStartup from 'electron-squirrel-startup';
import { authenticator } from 'otplib';
import { verifyIntegrity, isIntegrityVerified } from './integrity';
import { DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY, verifyEd25519Signature } from './trust-anchor';
import { NativeWebAuthnRecord, enrollWebAuthnCredential, verifyWebAuthnAssertion } from './webauthn-verifier';
import { loadAuthenticatedEngineManifest, verifyEngineBinary } from './engine-trust';

const execFileAsync = promisify(execFile);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
  process.exit(0);
}

// Set application identity and Windows Application User Model ID (AUMID)
app.setName('Darkstar Vault');
app.setAppUserModelId('com.squirrel.darkstar-vault.Darkstar');

/**
 * Automatic one-time migration from legacy storage directory (%APPDATA%/Darkstar -> %APPDATA%/Darkstar Vault).
 * Preserves Chromium Local Storage (vault payload), Local State (DPAPI keys for safeStorage),
 * WebAuthn FIDO2 credentials, and secure vault attachments.
 */
function migrateLegacyUserData(): void {
  try {
    const currentUserData = app.getPath('userData');
    const appData = app.getPath('appData');

    const legacyCandidates = [
      path.join(appData, 'Darkstar'),
      path.join(appData, 'darkstar'),
    ];

    let legacyDir: string | null = null;
    for (const candidate of legacyCandidates) {
      if (
        fsSync.existsSync(candidate) &&
        path.resolve(candidate).toLowerCase() !== path.resolve(currentUserData).toLowerCase()
      ) {
        legacyDir = candidate;
        break;
      }
    }

    if (!legacyDir) return;

    const migrationMarker = path.join(currentUserData, '.legacy_migration_done');
    if (fsSync.existsSync(migrationMarker)) {
      return;
    }

    const hasLocalStorage = fsSync.existsSync(path.join(legacyDir, 'Local Storage'));
    const hasWebAuthn = fsSync.existsSync(path.join(legacyDir, 'webauthn_registry.json'));
    const hasVaultStorage = fsSync.existsSync(path.join(legacyDir, 'vault_storage'));
    const hasLocalState = fsSync.existsSync(path.join(legacyDir, 'Local State'));

    if (!hasLocalStorage && !hasWebAuthn && !hasVaultStorage && !hasLocalState) {
      return;
    }

    if (!fsSync.existsSync(currentUserData)) {
      fsSync.mkdirSync(currentUserData, { recursive: true, mode: 0o700 });
    }

    const itemsToMigrate = ['Local State', 'Local Storage', 'webauthn_registry.json', 'vault_storage', 'Preferences'];
    const backupDir = path.join(currentUserData, '.pre_migration_backup');

    // Create safe backup of any existing files in destination before copying
    for (const item of itemsToMigrate) {
      const targetItem = path.join(currentUserData, item);
      if (fsSync.existsSync(targetItem)) {
        if (!fsSync.existsSync(backupDir)) {
          fsSync.mkdirSync(backupDir, { recursive: true });
        }
        try {
          fsSync.cpSync(targetItem, path.join(backupDir, item), { recursive: true, force: true });
        } catch {
          /* best-effort backup */
        }
      }
    }

    // Copy legacy items into currentUserData
    for (const item of itemsToMigrate) {
      const srcItem = path.join(legacyDir, item);
      const dstItem = path.join(currentUserData, item);
      if (fsSync.existsSync(srcItem)) {
        fsSync.cpSync(srcItem, dstItem, { recursive: true, force: true });
      }
    }

    // Clear stale leveldb LOCK file if present
    const lockFile = path.join(currentUserData, 'Local Storage', 'leveldb', 'LOCK');
    if (fsSync.existsSync(lockFile)) {
      try {
        fsSync.unlinkSync(lockFile);
      } catch {
        /* ignore */
      }
    }

    fsSync.writeFileSync(
      migrationMarker,
      JSON.stringify(
        {
          migratedAt: new Date().toISOString(),
          source: legacyDir,
          version: '3.0.6',
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`[Storage Migration] Successfully migrated legacy vault storage from ${legacyDir} to ${currentUserData}`);
  } catch (err) {
    console.error('[Storage Migration] Error during legacy storage migration:', err);
  }
}

migrateLegacyUserData();


// Suppress known GPU and disk cache "Access Denied" errors on rapid restarts (especially in dev mode)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

// Register custom protocol as secure/standard
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]);

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self' app:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' app: https://api.github.com https://fonts.googleapis.com https://fonts.gstatic.com ws://localhost:4200 http://localhost:4200; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

import { isPathContained, sanitizeVaultFilename, assertValidIpcSender as assertValidIpcSenderUtil, isAllowedOrigin } from './security-utils';

const assertValidIpcSender = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => assertValidIpcSenderUtil(event, BrowserWindow.fromWebContents, app.isPackaged);

let updaterInitialized = false;
let isVersionLocked = false;

function sendStatusToWindow(status: string, error?: string) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', { status, error });
  }
}

function initUpdater() {
  if (updaterInitialized) return;
  if (app.isPackaged && !isVersionLocked) {
    try {
      autoUpdater.on('checking-for-update', () => sendStatusToWindow('checking'));
      autoUpdater.on('update-available', () => sendStatusToWindow('available'));
      autoUpdater.on('update-not-available', () => sendStatusToWindow('not-available'));
      autoUpdater.on('error', (err) => sendStatusToWindow('error', err.message));
      autoUpdater.on('update-downloaded', () => sendStatusToWindow('downloaded'));

      updateElectronApp({
        repo: 'Kryklin/darkstar-vault',
        notifyUser: false,
      });
      updaterInitialized = true;
    } catch (err) {
      console.error('Main: Failed to initialize auto-updater', err);
    }
  }
}

function createShortcut(target: 'desktop' | 'start-menu'): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const targetPath = process.execPath;
    const shortcutName = 'Darkstar Vault.lnk';
    let shortcutPath = '';

    if (target === 'desktop') {
      shortcutPath = path.join(app.getPath('desktop'), shortcutName);
    } else {
      shortcutPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', shortcutName);
    }

    const operation = shell.writeShortcutLink(shortcutPath, 'create', {
      target: targetPath,
      cwd: path.dirname(targetPath),
      description: 'Darkstar Vault - Sovereign Post-Quantum Enclave',
      appUserModelId: 'com.squirrel.darkstar-vault.Darkstar',
    });

    if (operation) {
      resolve({
        success: true,
        message: `Successfully created ${target === 'desktop' ? 'Desktop' : 'Start Menu'} shortcut.`,
      });
    } else {
      resolve({
        success: false,
        message: `Failed to create ${target === 'desktop' ? 'Desktop' : 'Start Menu'} shortcut.`,
      });
    }
  });
}

let tray: Tray | null = null;

function createWindow() {
  const win = new BrowserWindow({
    title: 'Darkstar Vault',
    width: 800,
    height: 600,
    frame: false,
    icon: path.join(__dirname, '..', '..', 'dist', 'darkstar', 'browser', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: !app.isPackaged && !process.env['ELECTRON_PROD_DEBUG'],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      disableBlinkFeatures: 'Auxclick,Autofill',
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedOrigin(navigationUrl, app.isPackaged)) {
      event.preventDefault();
      if (navigationUrl.startsWith('https:') || navigationUrl.startsWith('http:')) {
        shell.openExternal(navigationUrl);
      }
    }
  });

  if (!app.isPackaged && !process.env['ELECTRON_PROD_DEBUG']) {
    win.loadURL('http://localhost:4200');
    win.webContents.openDevTools();
  } else {
    win.loadURL('app://localhost/index.html');
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'dist', 'darkstar', 'browser', 'favicon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([{ label: `Version: ${app.getVersion()}`, enabled: false }, { type: 'separator' }, { label: 'Exit', click: () => app.quit() }]);
  tray.setToolTip('Darkstar Vault');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isVisible()) {
        if (win.isMinimized()) win.restore();
        else win.show();
      } else {
        win.show();
      }
      win.focus();
    }
  });
}

async function cleanEngineRuntime(): Promise<void> {
  try {
    const runtimeDir = path.join(app.getPath('userData'), '.engine_runtime');
    const files = await fs.readdir(runtimeDir);
    for (const file of files) {
      const p = path.join(runtimeDir, file);
      await fs.chmod(p, 0o700).catch(() => {});
      await fs.unlink(p).catch(() => {});
    }
  } catch {
    // Directory may not exist yet; ignore
  }
}

app.whenReady().then(async () => {
  await cleanEngineRuntime();
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'localhost') {
      return new Response('Forbidden', { status: 403 });
    }
    let pathname = url.pathname;
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const distPath = path.resolve(__dirname, '..', '..', 'dist', 'darkstar', 'browser');
    const relativePart = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    const fullPath = path.resolve(distPath, relativePart);
    try {
      if (!isPathContained(distPath, fullPath)) return new Response('Forbidden', { status: 403 });
      const fileContent = await fs.readFile(fullPath);
      const extension = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
      };
      return new Response(new Uint8Array(fileContent), {
        headers: {
          'content-type': mimeTypes[extension] || 'application/octet-stream',
          ...SECURITY_HEADERS,
        },
      });
    } catch (_e) {
      try {
        const indexContent = await fs.readFile(path.join(distPath, 'index.html'));
        return new Response(new Uint8Array(indexContent), {
          headers: {
            'content-type': 'text/html',
            ...SECURITY_HEADERS,
          },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }
  });

  await verifyIntegrity();

  // Restrict webview creation
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });

  // Hardened Permission Request and Check Handlers
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Allow camera access for Air-Gap QR features, deny everything else
    if (permission === 'media') {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });

  createWindow();
  createTray();
  initUpdater();

  // One-time cleanup of diagnostic logs
  const logPath = path.join(app.getPath('userData'), 'debug.log');
  fs.unlink(logPath).catch(() => {
    /* ignore */
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  cleanEngineRuntime().catch(() => {});
});

ipcMain.on('minimize-window', (event) => {
  assertValidIpcSender(event);
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('maximize-window', (event) => {
  assertValidIpcSender(event);
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('close-window', (event) => {
  assertValidIpcSender(event);
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

ipcMain.on('check-for-updates', (event) => {
  assertValidIpcSender(event);
  if (isVersionLocked) {
    sendStatusToWindow('locked', 'Update check blocked: Version is locked.');
    return;
  }
  autoUpdater.checkForUpdates();
});

ipcMain.handle('create-shortcut', async (event, target: 'desktop' | 'start-menu') => {
  assertValidIpcSender(event);
  if (target !== 'desktop' && target !== 'start-menu') {
    throw new Error('Invalid shortcut target');
  }
  if (process.platform !== 'win32') return { success: false, message: 'Windows only.' };
  return await createShortcut(target);
});

ipcMain.on('set-version-lock', (event, locked: boolean) => {
  assertValidIpcSender(event);
  // Security policy: version locking is main-process controlled and cannot be disabled via renderer IPC.
  if (locked) {
    isVersionLocked = true;
  } else {
    console.warn('[Security] Ignored renderer IPC attempt to disable version locking policy.');
  }
});

ipcMain.handle('reset-app', async (event) => {
  assertValidIpcSender(event);
  await session.defaultSession.clearStorageData();
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('safe-storage-encrypt', async (event, plainText: string) => {
  assertValidIpcSender(event);
  if (typeof plainText !== 'string' || plainText.length > 50 * 1024 * 1024) {
    throw new Error('Invalid plainText argument');
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS-backed secure storage (Electron safeStorage) is unavailable.');
  return safeStorage.encryptString(plainText).toString('base64');
});

ipcMain.handle('safe-storage-decrypt', async (event, encryptedBase64: string) => {
  assertValidIpcSender(event);
  if (typeof encryptedBase64 !== 'string' || encryptedBase64.length > 100 * 1024 * 1024) {
    throw new Error('Invalid encryptedBase64 argument');
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS-backed secure storage (Electron safeStorage) is unavailable.');
  const buffer = Buffer.from(encryptedBase64, 'base64');
  return safeStorage.decryptString(buffer);
});

ipcMain.handle('safe-storage-available', (event) => {
  assertValidIpcSender(event);
  return safeStorage.isEncryptionAvailable();
});

ipcMain.handle('get-machine-id', (event) => {
  assertValidIpcSender(event);
  try {
    return machineIdSync();
  } catch {
    return null;
  }
});

ipcMain.handle('check-integrity', (event) => {
  assertValidIpcSender(event);
  return isIntegrityVerified();
});

ipcMain.handle('vault-generate-totp', (event) => {
  assertValidIpcSender(event);
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri('user', 'Darkstar', secret);
  return { secret, uri };
});

ipcMain.handle('vault-verify-totp', (event, token: string, secret: string) => {
  assertValidIpcSender(event);
  if (typeof token !== 'string' || typeof secret !== 'string' || token.length > 32 || secret.length > 128) {
    return false;
  }
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
});

const getVaultPath = () => path.join(app.getPath('userData'), 'vault_storage');
const MAX_VAULT_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

ipcMain.handle('vault-ensure-dir', async (event) => {
  assertValidIpcSender(event);
  try {
    await fs.mkdir(getVaultPath(), { recursive: true, mode: 0o700 });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('vault-save-file', async (event, filename: string, buffer: Buffer | Uint8Array) => {
  assertValidIpcSender(event);
  const cleanFilename = sanitizeVaultFilename(filename);
  if (!buffer || (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array))) {
    throw new Error('Invalid file payload: buffer required');
  }
  if (buffer.length > MAX_VAULT_FILE_SIZE) {
    throw new Error(`File size exceeds maximum allowed vault limit (${MAX_VAULT_FILE_SIZE} bytes)`);
  }

  const vaultDir = getVaultPath();
  const filePath = path.resolve(vaultDir, cleanFilename);
  if (!isPathContained(vaultDir, filePath)) {
    throw new Error('Path traversal violation in vault storage');
  }

  await fs.mkdir(vaultDir, { recursive: true, mode: 0o700 });

  // Atomic write via temp file + 0o600 permissions
  const tempPath = path.join(vaultDir, `.${cleanFilename}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tempPath, buffer, { mode: 0o600 });
    await fs.rename(tempPath, filePath);
    try {
      await fs.chmod(filePath, 0o600);
    } catch {
      /* ignore Windows chmod limitations */
    }
    return true;
  } finally {
    try {
      if (fsSync.existsSync(tempPath)) await fs.unlink(tempPath);
    } catch {
      /* ignore */
    }
  }
});

ipcMain.handle('vault-read-file', async (event, filename: string) => {
  assertValidIpcSender(event);
  const cleanFilename = sanitizeVaultFilename(filename);
  const vaultDir = getVaultPath();
  const filePath = path.resolve(vaultDir, cleanFilename);
  if (!isPathContained(vaultDir, filePath)) {
    throw new Error('Path traversal violation in vault storage');
  }
  return await fs.readFile(filePath);
});

ipcMain.handle('vault-delete-file', async (event, filename: string) => {
  assertValidIpcSender(event);
  const cleanFilename = sanitizeVaultFilename(filename);
  const vaultDir = getVaultPath();
  const filePath = path.resolve(vaultDir, cleanFilename);
  if (!isPathContained(vaultDir, filePath)) {
    throw new Error('Path traversal violation in vault storage');
  }
  await fs.unlink(filePath);
  return true;
});

ipcMain.handle('vault-list-files', async (event) => {
  assertValidIpcSender(event);
  try {
    const files = await fs.readdir(getVaultPath());
    return files.filter((f) => !f.startsWith('.'));
  } catch {
    return [];
  }
});

ipcMain.on('restart-and-install', (event) => {
  assertValidIpcSender(event);
  if (isVersionLocked) {
    sendStatusToWindow('locked', 'Restart and install blocked: Version is locked.');
    return;
  }
  autoUpdater.quitAndInstall();
});

autoUpdater.on('update-available', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('update-status', { status: 'available' });
});

autoUpdater.on('update-not-available', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('update-status', { status: 'not-available' });
});

autoUpdater.on('error', (err) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('update-status', { status: 'error', error: err.message });
});

autoUpdater.on('update-downloaded', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('update-status', { status: 'downloaded' });
});

ipcMain.handle('get-default-backup-path', (event) => {
  assertValidIpcSender(event);
  return path.join(app.getPath('documents'), 'DarkstarBackups');
});

ipcMain.handle('save-backup', async (event, dir: string, filename: string, data: string) => {
  assertValidIpcSender(event);
  try {
    if (typeof dir !== 'string' || typeof filename !== 'string' || typeof data !== 'string') {
      throw new Error('Invalid arguments: dir, filename, and data must be strings.');
    }
    if (data.length > MAX_VAULT_FILE_SIZE) {
      throw new Error('Backup data exceeds maximum permitted size.');
    }
    const cleanFilename = sanitizeVaultFilename(filename);
    if (!cleanFilename.endsWith('.backup')) {
      throw new Error('Invalid backup filename: must end with .backup');
    }

    const safeTarget = path.resolve(dir, cleanFilename);
    if (!isPathContained(dir, safeTarget)) {
      throw new Error('Path traversal violation in backup destination');
    }

    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const tempTarget = path.join(dir, `.${cleanFilename}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    try {
      await fs.writeFile(tempTarget, data, { encoding: 'utf-8', mode: 0o600 });
      await fs.rename(tempTarget, safeTarget);
      try {
        await fs.chmod(safeTarget, 0o600);
      } catch {
        /* ignore */
      }
      return true;
    } finally {
      try {
        if (fsSync.existsSync(tempTarget)) await fs.unlink(tempTarget);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('Save Backup Failure:', err);
    return false;
  }
});

ipcMain.handle('show-directory-picker', async (event) => {
  assertValidIpcSender(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('show-file-picker', async (event) => {
  assertValidIpcSender(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Darkstar Backup', extensions: ['backup'] }],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('open-backup', async (event, filePath: string) => {
  assertValidIpcSender(event);
  try {
    if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
      throw new Error('Invalid file path');
    }
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.toLowerCase().endsWith('.backup')) {
      throw new Error('Invalid backup file extension.');
    }
    return await fs.readFile(resolvedPath, 'utf-8');
  } catch (err) {
    console.error('Open Backup Failure:', err);
    return null;
  }
});

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseData {
  tag_name: string;
  name: string;
  assets: ReleaseAsset[];
}

/**
 * Resolves candidate search paths for native crypto engine binaries
 */
function getEngineCandidatePaths(): string[] {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const candidateSearchPaths: string[] = [];

  // 1. Explicit environment override - development only to prevent binary hijacking in production
  if (!app.isPackaged && process.env.DARKSTAR_ENGINE_PATH) {
    candidateSearchPaths.push(process.env.DARKSTAR_ENGINE_PATH);
  }

  // 2. User Data directory (downloaded or installed at runtime)
  const userDataBinDir = path.join(app.getPath('userData'), 'bin');
  candidateSearchPaths.push(path.join(userDataBinDir, `d-arx-512${ext}`), path.join(userDataBinDir, `d-arx${ext}`));

  // 3. Packaged resources path
  if (app.isPackaged) {
    candidateSearchPaths.push(
      path.join(process.resourcesPath, `d-arx-512${ext}`),
      path.join(process.resourcesPath, `d-arx${ext}`),
      path.join(process.resourcesPath, `main${ext}`),
      path.join(process.resourcesPath, `darx${ext}`),
      path.join(process.resourcesPath, 'bin', `d-arx-512${ext}`),
      path.join(process.resourcesPath, 'bin', `d-arx${ext}`),
    );
  }

  // 4. Local workspace ./bin directory
  const rootBinDir = path.resolve(__dirname, '..', '..', 'bin');
  candidateSearchPaths.push(path.join(rootBinDir, `d-arx-512${ext}`), path.join(rootBinDir, `d-arx${ext}`), path.join(rootBinDir, `main${ext}`), path.join(rootBinDir, `darx${ext}`));

  return candidateSearchPaths;
}

/**
 * Downloads and extracts the latest native crypto engine from Kryklin/darkstar GitHub releases.
 */
async function fetchEngineFromReleases(): Promise<string> {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';

  // Target directory: rootBinDir if dev, userDataBinDir if packaged
  const targetBinDir = app.isPackaged ? path.join(app.getPath('userData'), 'bin') : path.resolve(__dirname, '..', '..', 'bin');

  if (!fsSync.existsSync(targetBinDir)) {
    fsSync.mkdirSync(targetBinDir, { recursive: true });
  }

  console.log(`[Darkstar Engine] Querying GitHub releases for platform ${process.platform}...`);
  const headers: Record<string, string> = {
    'User-Agent': 'darkstar-vault-electron',
    Accept: 'application/vnd.github.v3+json',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token && !token.includes('your_') && !token.includes('placeholder') && token.length > 20) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch('https://api.github.com/repos/Kryklin/darkstar/releases/latest', { headers });
  if (res.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    res = await fetch('https://api.github.com/repos/Kryklin/darkstar/releases/latest', { headers });
  }
  if (!res.ok) {
    throw new Error(`GitHub releases API error: ${res.status} ${res.statusText}`);
  }

  const release = (await res.json()) as ReleaseData;
  const assetKeyword = isWindows ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

  let targetAsset = release.assets.find((a) => a.name.toLowerCase().includes('rust-engine') && a.name.toLowerCase().includes(assetKeyword));
  if (!targetAsset) {
    targetAsset = release.assets.find((a) => a.name.toLowerCase().includes('engine') && a.name.toLowerCase().includes(assetKeyword));
  }

  if (!targetAsset) {
    throw new Error(`No pre-compiled engine binary archive found in release ${release.tag_name} for platform ${process.platform}`);
  }

  console.log(`[Darkstar Engine] Downloading ${targetAsset.name}...`);
  const archivePath = path.join(targetBinDir, targetAsset.name);
  let downloadRes = await fetch(targetAsset.browser_download_url, { headers });
  if (downloadRes.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    downloadRes = await fetch(targetAsset.browser_download_url, { headers });
  }
  if (!downloadRes.ok) {
    throw new Error(`Failed to download ${targetAsset.name}: ${downloadRes.statusText}`);
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  // Cryptographic provenance verification via SHA-256 manifest
  const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toLowerCase();
  console.log(`[Darkstar Engine] Computed archive SHA-256: ${computedHash}`);

  const checksumAsset = release.assets.find((a) => {
    const lower = a.name.toLowerCase();
    return lower === `${targetAsset.name.toLowerCase()}.sha256` || lower.includes('checksum') || lower.includes('sha256sum') || lower === 'sha256.txt';
  });

  if (!checksumAsset) {
    throw new Error(`Mandatory release provenance failed: no SHA-256 checksum manifest found in release ${release.tag_name}. Refusing to download unauthenticated binary.`);
  }

  console.log(`[Darkstar Engine] Verifying checksum against release manifest ${checksumAsset.name}...`);
  let csRes = await fetch(checksumAsset.browser_download_url, { headers });
  if (csRes.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    csRes = await fetch(checksumAsset.browser_download_url, { headers });
  }
  if (!csRes.ok) {
    throw new Error(`Failed to download checksum manifest ${checksumAsset.name}: ${csRes.statusText}`);
  }

  const checksumText = await csRes.text();
  let expectedHash: string | null = null;

  const lines = checksumText.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes(targetAsset.name)) {
      const match = line.match(/[a-fA-F0-9]{64}/);
      if (match) {
        expectedHash = match[0].toLowerCase();
        break;
      }
    }
  }

  if (!expectedHash && checksumAsset.name.toLowerCase().includes(targetAsset.name.toLowerCase())) {
    const match = checksumText.match(/[a-fA-F0-9]{64}/);
    if (match) {
      expectedHash = match[0].toLowerCase();
    }
  }

  if (!expectedHash) {
    throw new Error(`Mandatory release provenance failed: checksum manifest did not contain entry for ${targetAsset.name}.`);
  }

  if (computedHash !== expectedHash) {
    throw new Error(`Provenance verification failed: SHA-256 checksum mismatch for ${targetAsset.name}!\nExpected: ${expectedHash}\nComputed: ${computedHash}`);
  }
  console.log(`[Darkstar Engine] Cryptographic provenance verified: SHA-256 matches manifest (${computedHash}).`);

  // Mandatory digital signature verification
  const signatureAsset = release.assets.find((a) => {
    const lower = a.name.toLowerCase();
    return (
      lower === `${checksumAsset.name.toLowerCase()}.sig` ||
      lower === `${targetAsset.name.toLowerCase()}.sig` ||
      lower.includes('checksums.txt.sig') ||
      lower.includes('sha256sums.sig') ||
      lower.includes('manifest.sig')
    );
  });

  if (!signatureAsset) {
    throw new Error(
      `Mandatory release provenance failed: no cryptographic digital signature (.sig) found for release ${release.tag_name}. Unsigned native engines are rejected by enclave security policy.`,
    );
  }

  console.log(`[Darkstar Engine] Authenticating release digital signature: ${signatureAsset.name}...`);
  let sigRes = await fetch(signatureAsset.browser_download_url, { headers });
  if (sigRes.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    sigRes = await fetch(signatureAsset.browser_download_url, { headers });
  }
  if (!sigRes.ok) {
    throw new Error(`Failed to download release signature ${signatureAsset.name}: ${sigRes.statusText}`);
  }

  const sigContent = await sigRes.text();
  const isSigValid = verifyEd25519Signature(checksumText, sigContent, DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY);
  if (!isSigValid) {
    throw new Error(`Provenance verification failed: Release signature in ${signatureAsset.name} is invalid against the Darkstar Trust Anchor!`);
  }
  console.log('[Darkstar Engine] Cryptographic release provenance verified via Ed25519 digital signature.');

  // Extract in an isolated temporary directory to ensure atomic installation
  const isolatedTempDir = path.join(targetBinDir, `.extract_${crypto.randomBytes(8).toString('hex')}`);
  fsSync.mkdirSync(isolatedTempDir, { recursive: true, mode: 0o700 });
  const isolatedArchive = path.join(isolatedTempDir, targetAsset.name);
  fsSync.writeFileSync(isolatedArchive, fileBuffer);

  console.log(`[Darkstar Engine] Extracting archive in isolated environment...`);
  try {
    if (isolatedArchive.endsWith('.zip')) {
      execSync(`tar -xf "${isolatedArchive}" -C "${isolatedTempDir}"`);
    } else if (isolatedArchive.endsWith('.tar.gz') || isolatedArchive.endsWith('.tgz')) {
      execSync(`tar -xzf "${isolatedArchive}" -C "${isolatedTempDir}"`);
    }
  } catch (_tarErr) {
    if (isWindows) {
      execSync(`powershell -Command "Expand-Archive -Path '${isolatedArchive}' -DestinationPath '${isolatedTempDir}' -Force"`);
    } else {
      throw _tarErr;
    }
  } finally {
    if (fsSync.existsSync(isolatedArchive)) {
      try {
        fsSync.unlinkSync(isolatedArchive);
      } catch {
        /* ignore */
      }
    }
  }

  const extractedRustBin = path.join(isolatedTempDir, `d-arx-512${ext}`);
  const extractedArxAlias = path.join(isolatedTempDir, `d-arx${ext}`);
  const extractedActive = fsSync.existsSync(extractedRustBin) ? extractedRustBin : extractedArxAlias;

  if (!fsSync.existsSync(extractedActive)) {
    try {
      fsSync.rmSync(isolatedTempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error(`Archive extracted but neither d-arx-512${ext} nor d-arx${ext} was found in download.`);
  }

  // Mandatory manifest verification against Darkstar Trust Anchor
  const manifest = loadAuthenticatedEngineManifest();
  const verifyRes = await verifyEngineBinary(extractedActive, manifest);
  if (!verifyRes.valid) {
    try {
      fsSync.rmSync(isolatedTempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error(`Release engine failed authenticated manifest verification:\n${verifyRes.error}`);
  }

  // Self-test verification inside isolated directory
  try {
    await execFileAsync(extractedActive, ['test']);
  } catch (testErr) {
    try {
      fsSync.rmSync(isolatedTempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error(`Downloaded engine binary failed operational self-test: ${(testErr as Error).message}`);
  }

  // Atomically move/copy to targetBinDir
  const finalRustBin = path.join(targetBinDir, `d-arx-512${ext}`);
  const finalArxAlias = path.join(targetBinDir, `d-arx${ext}`);

  fsSync.copyFileSync(extractedActive, finalRustBin);
  fsSync.copyFileSync(extractedActive, finalArxAlias);

  try {
    fsSync.rmSync(isolatedTempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  // Post-installation verification
  const postVerify = await verifyEngineBinary(finalRustBin, manifest);
  if (!postVerify.valid) {
    throw new Error(`Post-installation trust verification failed for ${finalRustBin}: ${postVerify.error}`);
  }

  console.log(`[Darkstar Engine] Operational authenticated native engine ready: ${finalRustBin}`);
  return finalRustBin;
}

/**
 * Sanitizes HWID into an even-length hex string required by the Rust crypto engine.
 */
function sanitizeHwid(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return trimmed.toLowerCase();
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

async function runDArxCommand(args: string[]): Promise<unknown> {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';

  const candidateSearchPaths = getEngineCandidatePaths();

  let foundBinary = candidateSearchPaths.find((p) => {
    try {
      return fsSync.existsSync(p);
    } catch {
      return false;
    }
  });

  // If native binary is missing, auto-fetch from Kryklin/darkstar releases!
  if (!foundBinary) {
    if (isVersionLocked) {
      throw new Error(
        `D-ARX-512 Native Core executable not found and auto-fetch blocked because Version is locked.\n` +
          `Please ensure the engine is installed in ./bin/d-arx-512${ext} or specify DARKSTAR_ENGINE_PATH in .env.`,
      );
    }
    try {
      console.log('[Darkstar Engine] Native D-ARX core missing. Auto-fetching from Kryklin/darkstar releases...');
      foundBinary = await fetchEngineFromReleases();
    } catch (fetchErr: unknown) {
      console.error('[Darkstar Engine] Auto-fetch failed:', (fetchErr as Error).message);
    }
  }

  if (!foundBinary) {
    throw new Error(
      `D-ARX-512 Native Core executable not found.\n` +
        `Please ensure the engine is installed in ./bin/d-arx-512${ext} or specify DARKSTAR_ENGINE_PATH in .env.\n` +
        `Engine binaries can be downloaded from: https://github.com/Kryklin/darkstar/releases`,
    );
  }

  // Mitigate TOCTOU race condition: Stage executable into an isolated runtime directory,
  // set strict permissions, verify the exact staged artifact against authenticated manifest,
  // and execute that identical staged copy.
  const runtimeDir = path.join(app.getPath('userData'), '.engine_runtime');
  await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const stagedToken = crypto.randomBytes(16).toString('hex');
  const stagedBinaryPath = path.join(runtimeDir, `d-arx_${stagedToken}${ext}`);

  try {
    await fs.copyFile(foundBinary, stagedBinaryPath);
    try {
      await fs.chmod(stagedBinaryPath, 0o500);
    } catch {
      // Best-effort permission lockdown
    }

    // Cryptographic Engine Trust Verification against Authenticated Manifest on the staged copy
    const manifest = loadAuthenticatedEngineManifest();
    const verifyRes = await verifyEngineBinary(stagedBinaryPath, manifest);
    if (!verifyRes.valid) {
      throw new Error(`Engine Execution Blocked: Staged binary failed cryptographic trust verification:\n${verifyRes.error}`);
    }

    const { stdout } = await execFileAsync(stagedBinaryPath, args);
    try {
      return JSON.parse(stdout);
    } catch {
      return stdout.trim();
    }
  } catch (e: unknown) {
    const err = e as Error & { stderr?: string };
    throw new Error(`D-ARX Core failed: ${err.stderr || err.message}`);
  } finally {
    try {
      await fs.chmod(stagedBinaryPath, 0o700).catch(() => {});
      await fs.unlink(stagedBinaryPath).catch(() => {});
    } catch {
      // Best-effort cleanup
    }
  }
}

ipcMain.handle('darx-encrypt', async (event, payload: string, pkHex: string, _engine?: string, hwid?: string) => {
  assertValidIpcSender(event);
  if (typeof payload !== 'string' || typeof pkHex !== 'string' || !/^[0-9a-fA-F]+$/.test(pkHex)) {
    throw new Error('Invalid payload or public key argument');
  }
  if (payload.length > 100 * 1024 * 1024 || pkHex.length > 16384) {
    throw new Error('Argument size exceeds maximum permitted limit');
  }
  const cleanHwid = sanitizeHwid(hwid);
  const args: string[] = ['--diagnostic'];
  if (cleanHwid) {
    args.push('--hwid', cleanHwid);
  }
  args.push('encrypt', payload, pkHex);

  try {
    return await runDArxCommand(args);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(error);
    console.error('D-ARX Core encryption failed:', msg);
    throw new Error(`D-ARX Core encryption failed: ${msg}`);
  }
});

ipcMain.handle('darx-decrypt', async (event, data: string, _rk: string, skHex: string, _engine?: string, hwid?: string) => {
  assertValidIpcSender(event);
  if (typeof data !== 'string' || typeof skHex !== 'string' || !/^[0-9a-fA-F]+$/.test(skHex)) {
    throw new Error('Invalid ciphertext or private key argument');
  }
  if (data.length > 200 * 1024 * 1024 || skHex.length > 16384) {
    throw new Error('Argument size exceeds maximum permitted limit');
  }
  const cleanHwid = sanitizeHwid(hwid);
  const args: string[] = ['--diagnostic'];
  if (cleanHwid) {
    args.push('--hwid', cleanHwid);
  }
  args.push('decrypt', data, skHex);

  try {
    return await runDArxCommand(args);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(error);
    console.error('D-ARX Core decryption failed:', msg);
    throw new Error(`D-ARX Core decryption failed: ${msg}`);
  }
});

ipcMain.handle('darx-check-engine', async (event) => {
  assertValidIpcSender(event);
  const candidatePaths = getEngineCandidatePaths();
  const existingPath = candidatePaths.find((p) => {
    try {
      return fsSync.existsSync(p);
    } catch {
      return false;
    }
  });

  if (!existingPath) {
    return { operational: false, error: 'Engine binary not found in candidate paths' };
  }

  try {
    await runDArxCommand(['test']);
    return {
      operational: true,
      binaryPath: existingPath,
      name: path.basename(existingPath),
    };
  } catch (e: unknown) {
    return {
      operational: false,
      binaryPath: existingPath,
      error: (e as Error).message,
    };
  }
});

ipcMain.handle('darx-fetch-engine', async (event) => {
  assertValidIpcSender(event);
  if (isVersionLocked) {
    return { success: false, error: 'Engine download blocked: Version is locked.' };
  }
  try {
    const binaryPath = await fetchEngineFromReleases();
    return { success: true, binaryPath };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

// --- WebAuthn Native Proxy (Windows Hello / Platform Authenticator) ---

const getWebAuthnStoragePath = () => path.join(app.getPath('userData'), 'webauthn_registry.json');

async function loadNativeWebAuthnRegistry(): Promise<Record<string, NativeWebAuthnRecord>> {
  const regPath = getWebAuthnStoragePath();
  let raw: Buffer;
  try {
    raw = await fs.readFile(regPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-backed secure storage (Electron safeStorage) is unavailable. Refusing to load credentials from unauthenticated storage.');
  }

  const jsonStr = safeStorage.decryptString(raw);
  return JSON.parse(jsonStr);
}

async function saveNativeWebAuthnRegistry(registry: Record<string, NativeWebAuthnRecord>): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-backed secure storage (Electron safeStorage) is unavailable. Refusing to persist WebAuthn credentials in unencrypted plaintext.');
  }
  const regPath = getWebAuthnStoragePath();
  const jsonStr = JSON.stringify(registry, null, 2);
  const payload = safeStorage.encryptString(jsonStr);
  await fs.writeFile(regPath, payload, { mode: 0o600 });
}

ipcMain.handle('biometric-handshake', async (event, options: { action: 'create' | 'get'; publicKey: unknown }) => {
  assertValidIpcSender(event);
  if (!options || (options.action !== 'create' && options.action !== 'get') || !options.publicKey || typeof options.publicKey !== 'object') {
    throw new Error('Invalid biometric-handshake options.');
  }
  return new Promise((resolve) => {
    let server: http.Server | null = null;
    let handshakeWin: BrowserWindow | null = null;

    const cleanup = async () => {
      if (handshakeWin) {
        handshakeWin.close();
        handshakeWin = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    const capabilityToken = crypto.randomBytes(32).toString('hex');

    server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url || '', 'http://127.0.0.1');
      if (reqUrl.searchParams.get('token') !== capabilityToken) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied: Invalid capability token.');
        return;
      }

      // Helper to ensure all binary data is safely serialized to arrays
      const serializeBuffers = (obj: unknown): unknown => {
        if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) return Array.from(obj);
        if (Array.isArray(obj)) return obj.map(serializeBuffers);
        if (obj && typeof obj === 'object') {
          const result: Record<string, unknown> = {};
          for (const key in obj) {
            result[key] = serializeBuffers((obj as Record<string, unknown>)[key]);
          }
          return result;
        }
        return obj;
      };

      const safePublicKey = serializeBuffers((options as Record<string, unknown>).publicKey);
      const action = (options as Record<string, unknown>).action;

      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <script>
            async function run() {
              try {
                const options = ${JSON.stringify(safePublicKey)};
                // Reconstruct BufferSources from numeric arrays
                if (options.challenge) options.challenge = Uint8Array.from(options.challenge).buffer;
                if (options.user && options.user.id) options.user.id = Uint8Array.from(options.user.id).buffer;
                if (options.allowCredentials) {
                    options.allowCredentials.forEach(c => {
                        if (c.id) c.id = Uint8Array.from(c.id).buffer;
                    });
                }
                if (options.excludeCredentials) {
                    options.excludeCredentials.forEach(c => {
                        if (c.id) c.id = Uint8Array.from(c.id).buffer;
                    });
                }

                const result = await navigator.credentials['${action}']({ publicKey: options });

                if (!result) {
                    throw new Error('No credential returned');
                }

                const pubKeyDer = result.response && result.response.getPublicKey ? Array.from(new Uint8Array(result.response.getPublicKey())) : undefined;

                const serialized = {
                    id: result.id,
                    rawId: Array.from(new Uint8Array(result.rawId)),
                    type: result.type,
                    publicKey: pubKeyDer,
                    response: {
                        clientDataJSON: Array.from(new Uint8Array(result.response.clientDataJSON)),
                        attestationObject: result.response.attestationObject ? Array.from(new Uint8Array(result.response.attestationObject)) : undefined,
                        authenticatorData: result.response.authenticatorData ? Array.from(new Uint8Array(result.response.authenticatorData)) : undefined,
                        signature: result.response.signature ? Array.from(new Uint8Array(result.response.signature)) : undefined,
                        userHandle: result.response.userHandle ? Array.from(new Uint8Array(result.response.userHandle)) : undefined
                    }
                };
                window.ipc.send('handshake-result', { success: true, data: serialized });
              } catch (e) {
                window.ipc.send('handshake-result', { success: false, error: e.message });
              }
            }
            run();
          </script>
        </body>
        </html>
      `;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    server.listen(0, '127.0.0.1', async () => {
      const addr = server!.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;

      handshakeWin = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload_handshake.js'),
        },
      });

      const resultHandler = async (_: unknown, response: { success: boolean; data?: unknown; error?: string }) => {
        ipcMain.removeListener('handshake-result', resultHandler);
        cleanup();

        const expectedOrigin = `http://localhost:${port}`;

        // 1. Enrol credential on 'create' action in native enclave registry
        if (options.action === 'create' && response.success && response.data) {
          const respData = response.data as {
            rawId?: number[];
            publicKey?: number[];
            response?: {
              clientDataJSON?: number[];
              attestationObject?: number[];
            };
          };

          try {
            const enrollChallenge = (options as { publicKey?: { challenge?: number[] | Uint8Array } }).publicKey?.challenge;
            if (!enrollChallenge) {
              return resolve({ success: false, error: 'Native enrollment failed: mandatory challenge missing from options.' });
            }

            const registry = await loadNativeWebAuthnRegistry();
            const enrollRes = await enrollWebAuthnCredential({
              rawId: respData.rawId,
              publicKey: respData.publicKey,
              clientDataJSON: respData.response?.clientDataJSON,
              attestationObject: respData.response?.attestationObject,
              expectedOrigin,
              expectedRpId: (options as { publicKey?: { rp?: { id?: string } } }).publicKey?.rp?.id || 'localhost',
              expectedChallenge: enrollChallenge,
              registry,
              onPersistRegistry: async (reg) => {
                await saveNativeWebAuthnRegistry(reg);
              },
            });
            if (!enrollRes.success) {
              return resolve({ success: false, error: enrollRes.error });
            }
            console.log(`[WebAuthn] Enrolled native credential record successfully.`);
          } catch (saveErr) {
            console.error('[WebAuthn] Failed to persist native credential registry:', saveErr);
            return resolve({
              success: false,
              error: `Failed to persist native credential in OS-backed secure storage: ${(saveErr as Error).message}`,
            });
          }
        }

        // 2. Native process assertion verification for 'get' action
        if (options.action === 'get' && response.success && response.data) {
          const respData = response.data as {
            rawId?: number[];
            response?: {
              clientDataJSON?: number[];
              authenticatorData?: number[];
              signature?: number[];
            };
          };

          try {
            const assertionChallenge = (options as { publicKey?: { challenge?: number[] | Uint8Array } }).publicKey?.challenge;
            if (!assertionChallenge) {
              return resolve({ success: false, error: 'Native assertion failed: mandatory challenge missing from options.' });
            }

            const registry = await loadNativeWebAuthnRegistry();
            const verifyRes = await verifyWebAuthnAssertion({
              rawId: respData.rawId,
              clientDataJSON: respData.response?.clientDataJSON,
              authenticatorData: respData.response?.authenticatorData,
              signature: respData.response?.signature,
              expectedOrigin,
              expectedRpId: (options as { publicKey?: { rpId?: string } }).publicKey?.rpId || 'localhost',
              expectedChallenge: assertionChallenge,
              registry,
              onPersistRegistry: async (reg) => {
                await saveNativeWebAuthnRegistry(reg);
              },
            });

            if (!verifyRes.success) {
              return resolve({ success: false, error: verifyRes.error });
            }
          } catch (verErr) {
            console.error('[WebAuthn] Assertion verification error:', verErr);
            return resolve({
              success: false,
              error: `Native verification failed: ${(verErr as Error).message}`,
            });
          }
        }

        resolve(response);
      };
      ipcMain.on('handshake-result', resultHandler);

      handshakeWin.loadURL(`http://localhost:${port}/?token=${capabilityToken}`);

      setTimeout(async () => {
        if (server) {
          ipcMain.removeListener('handshake-result', resultHandler);
          cleanup();
          resolve({ success: false, error: 'Handshake timeout' });
        }
      }, 60000);
    });
  });
});
