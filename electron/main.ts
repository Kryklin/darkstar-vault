import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, autoUpdater, session, shell, safeStorage, dialog, protocol } from 'electron';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { updateElectronApp } from 'update-electron-app';
import { machineIdSync } from 'node-machine-id';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) {
  app.quit();
  process.exit(0);
}

// Suppress known GPU and disk cache "Access Denied" errors on rapid restarts (especially in dev mode)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

// Register custom protocol as secure/standard
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]);

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

      updateElectronApp({ notifyUser: false });
      updaterInitialized = true;
    } catch (err) {
      console.error('Main: Failed to initialize auto-updater', err);
    }
  }
}

function createShortcut(target: 'desktop' | 'start-menu'): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const targetPath = process.execPath;
    const shortcutName = 'Darkstar.lnk';
    let shortcutPath = '';

    if (target === 'desktop') {
      shortcutPath = path.join(app.getPath('desktop'), shortcutName);
    } else {
      shortcutPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', shortcutName);
    }

    const operation = shell.writeShortcutLink(shortcutPath, 'create', {
      target: targetPath,
      cwd: path.dirname(targetPath),
      description: 'Darkstar Application',
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

  if (!app.isPackaged && !process.env['ELECTRON_PROD_DEBUG']) {
    win.loadURL('http://localhost:4200');
    win.webContents.openDevTools();
  } else {
    (async () => {
      try {
        const distPath = path.join(__dirname, '..', '..', 'dist', 'darkstar', 'browser');

        // Execution of legacy origin migration sequence
        await win.loadFile(path.join(distPath, 'index.html'));
        const fileData = await win.webContents.executeJavaScript('Object.assign({}, window.localStorage)');

        await win.loadURL('app://index.html');
        const appData = await win.webContents.executeJavaScript('Object.assign({}, window.localStorage)');

        await win.loadURL('app://darkstar/index.html');
        const darkstarData = await win.webContents.executeJavaScript('Object.assign({}, window.localStorage)');

        await win.loadURL('app://local/index.html');
        const appLocalData = await win.webContents.executeJavaScript('Object.assign({}, window.localStorage)');

        // Final Protocol Origin: app://localhost
        await win.loadURL('app://localhost/index.html');
        const currentData = await win.webContents.executeJavaScript('Object.assign({}, window.localStorage)');

        if (!currentData['darkstar_vault'] && !currentData['migration_complete']) {
          const origins = [fileData, appData, darkstarData, appLocalData];
          let bestData = null;
          let maxVaultSize = 0;
          for (const data of origins) {
            if (data && data['darkstar_vault']) {
              const size = data['darkstar_vault'].length;
              if (size > maxVaultSize) {
                maxVaultSize = size;
                bestData = data;
              }
            }
          }
          if (bestData) {
            for (const key of Object.keys(bestData)) {
              await win.webContents.executeJavaScript(`window.localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(bestData[key])});`);
            }
            await win.webContents.executeJavaScript(`window.localStorage.setItem('vault_recovered_notice', 'true');`);
          }
          // Persistence of migration state to prevent redundant execution
          await win.webContents.executeJavaScript(`window.localStorage.setItem('migration_complete', 'true');`);
        }
      } catch (_e) {
        console.error('Migration Sequence Failed:', _e);
        await win.loadURL('app://localhost/index.html');
      } finally {
        win.show();
      }
    })();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'dist', 'darkstar', 'browser', 'favicon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([{ label: `Version: ${app.getVersion()}`, enabled: false }, { type: 'separator' }, { label: 'Exit', click: () => app.quit() }]);
  tray.setToolTip('Darkstar');
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

import { verifyIntegrity } from './integrity';

app.whenReady().then(async () => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const distPath = path.join(__dirname, '..', '..', 'dist', 'darkstar', 'browser');
    const fullPath = path.join(distPath, pathname);
    try {
      if (!fullPath.startsWith(distPath)) return new Response('Forbidden', { status: 403 });
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
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; connect-src 'self' ws://localhost:4200 http://localhost:4200 https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net;",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      });
    } catch (_e) {
      try {
        const indexContent = await fs.readFile(path.join(distPath, 'index.html'));
        return new Response(new Uint8Array(indexContent), {
          headers: {
            'content-type': 'text/html',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; connect-src 'self' ws://localhost:4200 http://localhost:4200 https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net;",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }
  });

  await verifyIntegrity();

  // Hardened Permission Request Handler
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Allow camera access for Air-Gap QR features, deny everything else
    if (permission === 'media') {
      return callback(true);
    }
    callback(false);
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

ipcMain.on('minimize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('maximize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('close-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});

ipcMain.handle('create-shortcut', async (_event, target: 'desktop' | 'start-menu') => {
  if (process.platform !== 'win32') return { success: false, message: 'Windows only.' };
  return await createShortcut(target);
});

ipcMain.on('set-version-lock', (_event, locked: boolean) => {
  isVersionLocked = locked;
  if (!locked) initUpdater();
});

ipcMain.handle('reset-app', async () => {
  await session.defaultSession.clearStorageData();
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('safe-storage-encrypt', async (_event, plainText: string) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption not available.');
  return safeStorage.encryptString(plainText).toString('base64');
});

ipcMain.handle('safe-storage-decrypt', async (_event, encryptedBase64: string) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption not available.');
  const buffer = Buffer.from(encryptedBase64, 'base64');
  return safeStorage.decryptString(buffer);
});

ipcMain.handle('safe-storage-available', () => safeStorage.isEncryptionAvailable());

ipcMain.handle('get-machine-id', () => {
  try {
    return machineIdSync();
  } catch {
    return null;
  }
});

ipcMain.handle('check-integrity', () => true);

import { authenticator } from 'otplib';

ipcMain.handle('vault-generate-totp', () => {
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri('user', 'Darkstar', secret);
  return { secret, uri };
});

ipcMain.handle('vault-verify-totp', (_event, token: string, secret: string) => {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
});

const getVaultPath = () => path.join(app.getPath('userData'), 'vault_storage');

ipcMain.handle('vault-ensure-dir', async () => {
  try {
    await fs.mkdir(getVaultPath(), { recursive: true });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('vault-save-file', async (_event, filename: string, buffer: Buffer) => {
  const filePath = path.join(getVaultPath(), filename);
  if (path.basename(filePath) !== filename) throw new Error('Invalid filename');
  await fs.writeFile(filePath, buffer);
  return true;
});

ipcMain.handle('vault-read-file', async (_event, filename: string) => {
  const filePath = path.join(getVaultPath(), filename);
  if (path.basename(filePath) !== filename) throw new Error('Invalid filename');
  return await fs.readFile(filePath);
});

ipcMain.handle('vault-delete-file', async (_event, filename: string) => {
  const filePath = path.join(getVaultPath(), filename);
  if (path.basename(filePath) !== filename) throw new Error('Invalid filename');
  await fs.unlink(filePath);
  return true;
});

ipcMain.handle('vault-list-files', async () => {
  try {
    return await fs.readdir(getVaultPath());
  } catch {
    return [];
  }
});

ipcMain.on('restart-and-install', () => autoUpdater.quitAndInstall());

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

ipcMain.handle('get-default-backup-path', () => path.join(app.getPath('documents'), 'DarkstarBackups'));

ipcMain.handle('save-backup', async (_event, dir: string, filename: string, data: string) => {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), data, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('show-directory-picker', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('show-file-picker', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Darkstar Backup', extensions: ['backup'] }],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('open-backup', async (_event, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
});

import * as crypto from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

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

  // 1. Explicit environment override
  if (process.env.DARKSTAR_ENGINE_PATH) {
    candidateSearchPaths.push(process.env.DARKSTAR_ENGINE_PATH);
  }

  // 2. User Data directory (downloaded or installed at runtime)
  const userDataBinDir = path.join(app.getPath('userData'), 'bin');
  candidateSearchPaths.push(
    path.join(userDataBinDir, `d-arx-512${ext}`),
    path.join(userDataBinDir, `d-asp${ext}`),
  );

  // 3. Packaged resources path
  if (app.isPackaged) {
    candidateSearchPaths.push(
      path.join(process.resourcesPath, `d-arx-512${ext}`),
      path.join(process.resourcesPath, `d-asp${ext}`),
      path.join(process.resourcesPath, `main${ext}`),
      path.join(process.resourcesPath, `dasp${ext}`),
      path.join(process.resourcesPath, 'bin', `d-arx-512${ext}`),
      path.join(process.resourcesPath, 'bin', `d-asp${ext}`),
    );
  }

  // 4. Local workspace ./bin directory
  const rootBinDir = path.resolve(__dirname, '..', '..', 'bin');
  candidateSearchPaths.push(
    path.join(rootBinDir, `d-arx-512${ext}`),
    path.join(rootBinDir, `d-asp${ext}`),
    path.join(rootBinDir, `main${ext}`),
    path.join(rootBinDir, `dasp${ext}`),
  );

  return candidateSearchPaths;
}

/**
 * Downloads and extracts the latest native crypto engine from Kryklin/darkstar GitHub releases.
 */
async function fetchEngineFromReleases(): Promise<string> {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';

  // Target directory: rootBinDir if dev, userDataBinDir if packaged
  const targetBinDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'bin')
    : path.resolve(__dirname, '..', '..', 'bin');

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

  let targetAsset = release.assets.find(
    (a) => a.name.toLowerCase().includes('rust-engine') && a.name.toLowerCase().includes(assetKeyword),
  );
  if (!targetAsset) {
    targetAsset = release.assets.find(
      (a) => a.name.toLowerCase().includes('engine') && a.name.toLowerCase().includes(assetKeyword),
    );
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
  fsSync.writeFileSync(archivePath, Buffer.from(arrayBuffer));

  console.log(`[Darkstar Engine] Extracting archive...`);
  try {
    if (archivePath.endsWith('.zip')) {
      execSync(`tar -xf "${archivePath}" -C "${targetBinDir}"`);
    } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      execSync(`tar -xzf "${archivePath}" -C "${targetBinDir}"`);
    }
  } catch (_tarErr) {
    if (isWindows) {
      execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${targetBinDir}' -Force"`);
    } else {
      throw _tarErr;
    }
  } finally {
    if (fsSync.existsSync(archivePath)) {
      try {
        fsSync.unlinkSync(archivePath);
      } catch {}
    }
  }

  const rustBin = path.join(targetBinDir, `d-arx-512${ext}`);
  const aspAlias = path.join(targetBinDir, `d-asp${ext}`);

  // Maintain alias parity so either binary name works
  if (fsSync.existsSync(rustBin) && !fsSync.existsSync(aspAlias)) {
    try {
      fsSync.copyFileSync(rustBin, aspAlias);
    } catch {}
  } else if (fsSync.existsSync(aspAlias) && !fsSync.existsSync(rustBin)) {
    try {
      fsSync.copyFileSync(aspAlias, rustBin);
    } catch {}
  }

  const activeBin = fsSync.existsSync(rustBin) ? rustBin : aspAlias;
  if (!fsSync.existsSync(activeBin)) {
    throw new Error(`Archive extracted but neither d-arx-512${ext} nor d-asp${ext} was found in ${targetBinDir}`);
  }

  // Self-test verification
  await execFileAsync(activeBin, ['test']);
  console.log(`[Darkstar Engine] Operational native engine ready: ${activeBin}`);
  return activeBin;
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

async function runDAsPCommand(args: string[]): Promise<unknown> {
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
      `Engine binaries can be downloaded from: https://github.com/Kryklin/darkstar/releases`
    );
  }

  try {
    const { stdout } = await execFileAsync(foundBinary, args);
    try {
      return JSON.parse(stdout);
    } catch {
      return stdout.trim();
    }
  } catch (e: unknown) {
    const err = e as Error & { stderr?: string };
    throw new Error(`D-ARX Core failed: ${err.stderr || err.message}`);
  }
}

ipcMain.handle('dasp-encrypt', async (_event, payload: string, pkHex: string, _engine?: string, hwid?: string) => {
  const cleanHwid = sanitizeHwid(hwid);
  const args: string[] = ['--diagnostic'];
  if (cleanHwid) {
    args.push('--hwid', cleanHwid);
  }
  args.push('encrypt', payload, pkHex);

  try {
    return await runDAsPCommand(args);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(error);
    console.error('D-ARX Core encryption failed:', msg);
    throw new Error(`D-ARX Core encryption failed: ${msg}`);
  }
});

ipcMain.handle('dasp-decrypt', async (_event, data: string, _rk: string, skHex: string, _engine?: string, hwid?: string) => {
  const cleanHwid = sanitizeHwid(hwid);
  const args: string[] = ['--diagnostic'];
  if (cleanHwid) {
    args.push('--hwid', cleanHwid);
  }
  args.push('decrypt', data, skHex);

  try {
    return await runDAsPCommand(args);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(error);
    console.error('D-ARX Core decryption failed:', msg);
    throw new Error(`D-ARX Core decryption failed: ${msg}`);
  }
});

ipcMain.handle('dasp-check-engine', async () => {
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
    await execFileAsync(existingPath, ['test']);
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

ipcMain.handle('dasp-fetch-engine', async () => {
  try {
    const binaryPath = await fetchEngineFromReleases();
    return { success: true, binaryPath };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

// --- WebAuthn Native Proxy (Windows Hello Fix) ---

ipcMain.handle('biometric-handshake', async (_event: unknown, options: { action: 'create' | 'get'; publicKey: unknown }) => {
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

    server = http.createServer(async (_req, res) => {
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
                
                // Restore ArrayBuffers for WebAuthn
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

                const serialized = {
                    id: result.id,
                    rawId: Array.from(new Uint8Array(result.rawId)),
                    type: result.type,
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
        resolve(response);
      };
      ipcMain.on('handshake-result', resultHandler);

      handshakeWin.loadURL(`http://localhost:${port}`);

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
