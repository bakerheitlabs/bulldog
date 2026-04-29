import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import { getNetworkInfo } from './net/netInfo';
import { HostServer } from './net/server';
import { JoinClient } from './net/client';

const DEV_URL = process.env.ELECTRON_RENDERER_URL;
const isDev = !!DEV_URL;

// Allow running a second Electron instance for two-window MP testing without
// stomping the primary instance's localStorage. Set ELECTRON_USER_DATA_DIR
// before launch to redirect this window's user data (saves, MP settings) to
// a separate dir.
const customUserData = process.env.ELECTRON_USER_DATA_DIR;
if (customUserData) {
  app.setPath('userData', customUserData);
}

const host = new HostServer();
const client = new JoinClient();
let mainWindow: BrowserWindow | null = null;

function emit(payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('mp:event', payload);
}

host.setListener((ev) => emit(ev));
client.setListener((ev) => emit(ev));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setMenuBarVisibility(false);
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // F12 toggles DevTools in any build — without this the only way to diagnose
  // a packaged-app issue is to ship a debug build, which is too slow a loop.
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });

  if (isDev) {
    win.loadURL(DEV_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('app:open-external', async (_e, url: string) => {
  // Only allow http(s) so a compromised renderer can't trigger arbitrary
  // protocol handlers (file://, etc.).
  if (!/^https?:\/\//i.test(url)) return;
  await shell.openExternal(url);
});

ipcMain.handle('mp:get-network-info', async () => getNetworkInfo());

ipcMain.handle('mp:host-start', async (_e, args: { port: number }) => {
  if (client.isConnected()) return { ok: false, error: 'already-joined-as-client' };
  return host.start(args.port);
});

ipcMain.handle('mp:host-stop', async () => {
  await host.stop();
});

ipcMain.handle('mp:join', async (_e, args: { host: string; port: number }) => {
  if (host.isRunning()) return { ok: false, error: 'already-hosting' };
  return client.connect(args.host, args.port);
});

ipcMain.handle('mp:disconnect', async () => {
  await client.disconnect();
});

ipcMain.handle('mp:send', async (_e, args: { to?: string; data: string }) => {
  if (host.isRunning()) {
    host.send(args.to, args.data);
  } else if (client.isConnected()) {
    client.send(args.data);
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await host.stop().catch(() => undefined);
  await client.disconnect().catch(() => undefined);
  if (process.platform !== 'darwin') app.quit();
});
