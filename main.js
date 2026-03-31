const { app, BrowserWindow, Tray, nativeImage, ipcMain } = require('electron');
const path = require('path');

let tray = null;
let window = null;

function createTray() {
  // Use the robot SVG file as our Tray icon
  // The word "Template" at the end of the filename signals macOS to automatically
  // adjust the color to black/white depending on light/dark mode
  const iconPath = path.join(__dirname, 'robotTemplate.svg');
  const iconImage = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(iconImage);
  tray.setToolTip('Antigravity Gemini Bot');
  
  tray.on('click', (event, bounds) => {
    toggleWindow();
  });
}

function getWindowPosition() {
  const windowBounds = window.getBounds();
  const trayBounds = tray.getBounds();
  
  // Calculate X and Y coordinates to attach the window to the tray icon
  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  
  return { x: x, y: y };
}

function createWindow() {
  window = new BrowserWindow({
    width: 650,
    height: 750,
    icon: path.join(__dirname, 'robotTemplate.png'),
    show: true,      // Show it immediately so user can see it
    frame: false,     // Frameless window
    fullscreenable: false,
    resizable: true,
    minWidth: 500,
    minHeight: 600,
    transparent: true, // Needed for rounded corners / glassmorphism outside HTML body
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  window.loadFile('index.html');

  // Hide the window when it loses focus
  window.on('blur', () => {
    // if (!window.webContents.isDevToolsOpened()) {
    //   window.hide();
    // }
  });
}

function toggleWindow() {
  if (window.isVisible()) {
    window.hide();
  } else {
    // Eliminamos el reposicionamiento forzado para que la ventana se quede donde la dejaste
    window.show();
    window.focus();
  }
}

const oauth = require('./oauth.js');

app.on('ready', () => {
  // Ensure Dock icon is visible and uses high-res logo
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'icon.png'));
    app.dock.show();
  }

  createTray();
  createWindow();
  
  // Hacer que flote en todos los escritorios (spaces) de macOS
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  window.center();
  window.show();
  window.focus();
});

ipcMain.on('quit-app', () => {
    app.quit();
});

// OAuth IPC Handlers
ipcMain.handle('oauth-login', async (event, clientId, clientSecret) => {
  try {
    oauth.setCredentials(clientId, clientSecret);
    const tokens = await oauth.login(window);
    return { success: true, tokens: tokens };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('oauth-refresh', async (event, clientId, clientSecret, refreshToken) => {
  try {
    oauth.setCredentials(clientId, clientSecret);
    const tokens = await oauth.refreshToken(refreshToken);
    return { success: true, tokens: tokens };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

const { dialog } = require('electron');
ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});
