import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, autoUpdater, session, shell, safeStorage, dialog, protocol } from 'electron';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
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

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

async function runDAsPCommand(engine: string, args: string[]): Promise<unknown> {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  let cmd = '';
  let execArgs: string[] = [];

  const candidateSearchPaths: string[] = [];

  // 1. Explicit environment override
  if (process.env.DARKSTAR_ENGINE_PATH) {
    candidateSearchPaths.push(process.env.DARKSTAR_ENGINE_PATH);
  }

  // 2. Packaged resources path
  if (app.isPackaged) {
    candidateSearchPaths.push(
      path.join(process.resourcesPath, `d-asp${ext}`),
      path.join(process.resourcesPath, `main${ext}`),
      path.join(process.resourcesPath, `dasp${ext}`),
      path.join(process.resourcesPath, 'bin', `d-asp${ext}`),
    );
  }

  // 3. Local workspace ./bin directory
  const rootBinDir = path.resolve(__dirname, '..', '..', 'bin');
  candidateSearchPaths.push(
    path.join(rootBinDir, `d-asp${ext}`),
    path.join(rootBinDir, `main${ext}`),
    path.join(rootBinDir, `dasp${ext}`),
  );

  // 4. Fallback: local development tree if cloned alongside
  const legacyBasePath = path.resolve(__dirname, '..', '..', 'd-asp');
  if (engine === 'rust') {
    candidateSearchPaths.push(path.join(legacyBasePath, 'rust', 'target', 'release', `d-asp${ext}`));
  } else if (engine === 'go') {
    candidateSearchPaths.push(path.join(legacyBasePath, 'go', `main${ext}`));
  } else if (engine === 'c') {
    candidateSearchPaths.push(path.join(legacyBasePath, 'c', `dasp${ext}`));
  }

  // Find first existing executable
  const fsSync = require('fs');
  const foundBinary = candidateSearchPaths.find((p) => {
    try {
      return fsSync.existsSync(p);
    } catch {
      return false;
    }
  });

  if (engine === 'node') {
    const nodeScript = [
      path.join(process.resourcesPath, 'main.js'),
      path.join(rootBinDir, 'main.js'),
      path.join(legacyBasePath, 'node', 'dist', 'main.js'),
    ].find((p) => fsSync.existsSync(p));

    if (nodeScript) {
      cmd = 'node';
      execArgs = [nodeScript, ...args];
    }
  } else if (engine === 'python') {
    const pyScript = [
      path.join(process.resourcesPath, 'dasp.py'),
      path.join(rootBinDir, 'dasp.py'),
      path.join(legacyBasePath, 'python', 'dasp.py'),
    ].find((p) => fsSync.existsSync(p));

    if (pyScript) {
      cmd = 'python';
      execArgs = [pyScript, ...args];
    }
  }

  if (!cmd && foundBinary) {
    cmd = foundBinary;
    execArgs = args;
  }

  if (!cmd) {
    throw new Error(
      `D-ASP Crypto Engine (${engine}) executable not found.\n` +
      `Please ensure the native crypto engine is installed in ./bin/d-asp${ext} or specify DARKSTAR_ENGINE_PATH in .env.\n` +
      `Engine binaries can be downloaded from: https://github.com/Kryklin/darkstar/releases`
    );
  }

  try {
    const { stdout } = await execFileAsync(cmd, execArgs);
    try {
      return JSON.parse(stdout);
    } catch {
      return stdout.trim();
    }
  } catch (e: unknown) {
    const err = e as Error & { stderr?: string };
    throw new Error(`D-ASP Engine (${engine}) failed: ${err.stderr || err.message}`);
  }
}

ipcMain.handle('dasp-encrypt', async (_event, payload: string, pkHex: string, engine: string, hwid?: string) => {
  const args: string[] = ['--diagnostic'];
  if (hwid) {
    args.push('--hwid', hwid);
  }
  args.push('encrypt', payload, pkHex);

  try {
    return await runDAsPCommand(engine, args);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(error);
    console.error(`D-ASP Engine (${engine}) failed:`, msg);
    throw new Error(`D-ASP Engine (${engine}) failed: ${msg}`);
  }
});

ipcMain.handle('dasp-decrypt', async (_event, data: string, rk: string, skHex: string, engine: string, hwid?: string) => {
  const args: string[] = ['--diagnostic'];
  if (hwid) {
    args.push('--hwid', hwid);
  }
  args.push('decrypt', data, skHex); // rk parameter is legacy and maintained for signature parity

  try {
    return await runDAsPCommand(engine, args);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(error);
    console.error(`D-ASP Engine (${engine}) failed:`, msg);
    throw new Error(`D-ASP Engine (${engine}) failed: ${msg}`);
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
