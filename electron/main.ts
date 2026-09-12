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

const execFileAsync = promisify(execFile);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
  process.exit(0);
}

// Suppress known GPU and disk cache "Access Denied" errors on rapid restarts (especially in dev mode)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

// Register custom protocol as secure/standard
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]);

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self' app:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' app: https://api.github.com https://fonts.googleapis.com https://fonts.gstatic.com ws://localhost:4200 http://localhost:4200; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

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

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsed = new URL(navigationUrl);
    const isAppOrigin = parsed.protocol === 'app:';
    const isDevOrigin = !app.isPackaged && (parsed.origin === 'http://localhost:4200' || parsed.origin === 'ws://localhost:4200');
    if (!isAppOrigin && !isDevOrigin) {
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
  if (isVersionLocked) {
    sendStatusToWindow('locked', 'Update check blocked: Version is locked.');
    return;
  }
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

ipcMain.handle('check-integrity', () => isIntegrityVerified());

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

ipcMain.on('restart-and-install', () => {
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

ipcMain.handle('get-default-backup-path', () => path.join(app.getPath('documents'), 'DarkstarBackups'));

ipcMain.handle('save-backup', async (_event, dir: string, filename: string, data: string) => {
  try {
    // Validate filename against strict pattern to prevent path traversal
    const cleanFilename = path.basename(filename);
    if (!/^[a-zA-Z0-9_\-.]+\.backup$/.test(cleanFilename) || cleanFilename !== filename) {
      throw new Error('Invalid backup filename: directory traversal or illegal characters detected.');
    }

    const safeTarget = path.resolve(dir, cleanFilename);
    await fs.mkdir(dir, { recursive: true });
    // Restrict permissions to user-only read/write (0o600)
    await fs.writeFile(safeTarget, data, { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch (err) {
    console.error('Save Backup Failure:', err);
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

  fsSync.writeFileSync(archivePath, fileBuffer);

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
      } catch {
        /* ignore */
      }
    }
  }

  const rustBin = path.join(targetBinDir, `d-arx-512${ext}`);
  const arxAlias = path.join(targetBinDir, `d-arx${ext}`);

  // Maintain alias parity so either binary name works
  if (fsSync.existsSync(rustBin) && !fsSync.existsSync(arxAlias)) {
    try {
      fsSync.copyFileSync(rustBin, arxAlias);
    } catch {
      /* ignore */
    }
  } else if (fsSync.existsSync(arxAlias) && !fsSync.existsSync(rustBin)) {
    try {
      fsSync.copyFileSync(arxAlias, rustBin);
    } catch {
      /* ignore */
    }
  }

  const activeBin = fsSync.existsSync(rustBin) ? rustBin : arxAlias;
  if (!fsSync.existsSync(activeBin)) {
    throw new Error(`Archive extracted but neither d-arx-512${ext} nor d-arx${ext} was found in ${targetBinDir}`);
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

ipcMain.handle('darx-encrypt', async (_event, payload: string, pkHex: string, _engine?: string, hwid?: string) => {
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

ipcMain.handle('darx-decrypt', async (_event, data: string, _rk: string, skHex: string, _engine?: string, hwid?: string) => {
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

ipcMain.handle('darx-check-engine', async () => {
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

ipcMain.handle('darx-fetch-engine', async () => {
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

// --- WebAuthn Native Proxy (Windows Hello Fix) ---

interface NativeWebAuthnRecord {
  idBase64: string;
  publicKeyBase64: string; // DER SPKI
  counter: number;
  createdAt: number;
}

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
    throw new Error('OS safeStorage hardware encryption is unavailable. Refusing to load credentials from unauthenticated storage.');
  }

  const jsonStr = safeStorage.decryptString(raw);
  return JSON.parse(jsonStr);
}

async function saveNativeWebAuthnRegistry(registry: Record<string, NativeWebAuthnRecord>): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS safeStorage hardware encryption is unavailable. Refusing to persist WebAuthn credentials in unencrypted plaintext.');
  }
  const regPath = getWebAuthnStoragePath();
  const jsonStr = JSON.stringify(registry, null, 2);
  const payload = safeStorage.encryptString(jsonStr);
  await fs.writeFile(regPath, payload, { mode: 0o600 });
}

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

          const clientDataArr = respData.response?.clientDataJSON;
          if (!clientDataArr || !respData.rawId || !respData.publicKey) {
            return resolve({ success: false, error: 'Native enrollment failed: malformed WebAuthn attestation structure.' });
          }

          let clientDataJson: Record<string, unknown>;
          try {
            clientDataJson = JSON.parse(Buffer.from(clientDataArr).toString('utf8'));
            if (clientDataJson['type'] !== 'webauthn.create') {
              return resolve({ success: false, error: 'Native enrollment failed: attestation type mismatch.' });
            }
            if (clientDataJson['origin'] !== expectedOrigin) {
              return resolve({
                success: false,
                error: `Native enrollment failed: origin mismatch ('${clientDataJson['origin']}' does not match '${expectedOrigin}').`,
              });
            }
          } catch {
            return resolve({ success: false, error: 'Native enrollment failed: invalid clientDataJSON.' });
          }

          const idBase64 = Buffer.from(respData.rawId).toString('base64');
          const pubKeyBase64 = Buffer.from(respData.publicKey).toString('base64');
          try {
            const registry = await loadNativeWebAuthnRegistry();
            registry[idBase64] = {
              idBase64,
              publicKeyBase64: pubKeyBase64,
              counter: 0,
              createdAt: Date.now(),
            };
            await saveNativeWebAuthnRegistry(registry);
            console.log(`[WebAuthn] Enrolled native credential record: ${idBase64.slice(0, 16)}...`);
          } catch (saveErr) {
            console.error('[WebAuthn] Failed to persist native credential registry:', saveErr);
            return resolve({
              success: false,
              error: `Failed to persist native credential in hardware-backed storage: ${(saveErr as Error).message}`,
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
          const clientDataArr = respData.response?.clientDataJSON;
          const authDataArr = respData.response?.authenticatorData;
          const sigArr = respData.response?.signature;

          if (!clientDataArr || !authDataArr || !sigArr || authDataArr.length < 37 || sigArr.length === 0) {
            return resolve({ success: false, error: 'Native verification failed: malformed WebAuthn assertion structure.' });
          }

          let clientDataJson: Record<string, unknown>;
          try {
            clientDataJson = JSON.parse(Buffer.from(clientDataArr).toString('utf8'));
            if (clientDataJson['type'] !== 'webauthn.get') {
              return resolve({ success: false, error: 'Native verification failed: assertion type mismatch.' });
            }

            // Origin check: must strictly match ephemeral localhost origin
            if (clientDataJson['origin'] !== expectedOrigin) {
              return resolve({
                success: false,
                error: `Native verification failed: origin mismatch ('${clientDataJson['origin']}' does not match '${expectedOrigin}').`,
              });
            }
          } catch {
            return resolve({ success: false, error: 'Native verification failed: invalid clientDataJSON.' });
          }

          // RP ID Hash check: assert authenticator asserted for localhost
          const expectedRpId = (options as { publicKey?: { rpId?: string } }).publicKey?.rpId || 'localhost';
          const expectedRpIdHash = crypto.createHash('sha256').update(expectedRpId).digest();
          const actualRpIdHash = Buffer.from(authDataArr.slice(0, 32));
          if (!crypto.timingSafeEqual(actualRpIdHash, expectedRpIdHash)) {
            return resolve({
              success: false,
              error: `Native verification failed: RP ID hash mismatch (expected '${expectedRpId}').`,
            });
          }

          // Check flags at byte 32: bit 0 (UP), bit 2 (UV)
          const flags = authDataArr[32];
          const userPresent = (flags & 0x01) !== 0;
          const userVerified = (flags & 0x04) !== 0;
          if (!userPresent || !userVerified) {
            return resolve({
              success: false,
              error: 'Native verification failed: authenticator did not assert User Verification (UV flag).',
            });
          }

          // Challenge matching
          const expectedChallenge = (options as { publicKey?: { challenge?: number[] | Uint8Array } }).publicKey?.challenge;
          if (expectedChallenge && clientDataJson['challenge']) {
            const rawChal = Array.isArray(expectedChallenge) ? Buffer.from(expectedChallenge) : Buffer.from(expectedChallenge);
            const chalUrlSafe = rawChal.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            if (clientDataJson['challenge'] !== chalUrlSafe) {
              return resolve({
                success: false,
                error: 'Native verification failed: challenge mismatch (replay defense).',
              });
            }
          }

          // Native Credential Registry lookup (Renderer cannot dictate trusted public key)
          const credentialIdBase64 = respData.rawId ? Buffer.from(respData.rawId).toString('base64') : '';
          const registry = await loadNativeWebAuthnRegistry();
          const nativeRecord = registry[credentialIdBase64];

          if (!nativeRecord) {
            return resolve({
              success: false,
              error: 'Native verification failed: credential ID is not enrolled in the native enclave registry.',
            });
          }

          // Sign Counter tracking (Cloned authenticator replay defense)
          const signCounter = Buffer.from(authDataArr).readUInt32BE(33);
          if (signCounter > 0 && nativeRecord.counter > 0 && signCounter <= nativeRecord.counter) {
            return resolve({
              success: false,
              error: `Native verification failed: authenticator sign counter roll-back detected (${signCounter} <= ${nativeRecord.counter}). Potential cloned authenticator.`,
            });
          }
          if (signCounter > nativeRecord.counter) {
            nativeRecord.counter = signCounter;
            await saveNativeWebAuthnRegistry(registry);
          }

          // Cryptographic ECDSA P-256 signature verification against native stored public key
          try {
            const pubKeyBuf = Buffer.from(nativeRecord.publicKeyBase64, 'base64');
            const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataArr)).digest();
            const signedData = Buffer.concat([Buffer.from(authDataArr), clientDataHash]);

            const keyObject = crypto.createPublicKey({
              key: pubKeyBuf,
              format: 'der',
              type: 'spki',
            });

            const isSigVerified = crypto.verify('SHA256', signedData, keyObject, Buffer.from(sigArr));
            if (!isSigVerified) {
              return resolve({
                success: false,
                error: 'Native verification failed: authenticator signature mismatch against registered public key.',
              });
            }
            console.log('[WebAuthn] Cryptographic assertion signature verified against native enclave registry.');
          } catch (verErr) {
            console.warn('[WebAuthn] Assertion signature verification notice:', verErr);
            return resolve({
              success: false,
              error: `Native verification failed: assertion signature check failed: ${(verErr as Error).message}`,
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
