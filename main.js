/**
 * GeminiBot Main Process
 * Handles window persistence, system tray, and secure OAuth communication.
 */
const { app, BrowserWindow, Tray, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const oauth = require('./oauth.js');

let tray = null;
let window = null;

/**
 * Creates the macOS system tray icon and menu.
 */
function createTray() {
  // Use icon.png for the tray if robotTemplate.svg is problematic in some macOS versions
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const iconImage = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  
  tray = new Tray(iconImage);
  tray.setToolTip('GeminiBot Autonomous Agents');
  
  tray.on('click', () => toggleWindow());
}

/**
 * Initializes the main application window with glassmorphism support.
 */
function createWindow() {
  window = new BrowserWindow({
    width: 650,
    height: 750,
    // Setting the Dock icon explicitly for macOS
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: true,
    frame: false,
    fullscreenable: false,
    resizable: true,
    minWidth: 500,
    minHeight: 600,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // Critical for background cron execution
    }
  });

  window.loadFile('index.html');
}

/**
 * Toggles window visibility between tray and foreground.
 */
function toggleWindow() {
  if (window.isVisible()) {
    window.hide();
  } else {
    window.show();
    window.focus();
  }
}

// --- Lifecycle Events ---

app.on('ready', () => {
  // macOS Dock Icon Configuration
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
    app.dock.show();
  }

  createTray();
  createWindow();
  
  // Floating Window Setup
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.center();
  window.show();
  window.focus();
});

// --- IPC Communication Handlers ---

ipcMain.on('quit-app', () => app.quit());

/**
 * Handles the Google OAuth 2.0 Login flow.
 */
ipcMain.handle('oauth-login', async (event, clientId, clientSecret) => {
  try {
    oauth.setCredentials(clientId, clientSecret);
    const tokens = await oauth.login(window);
    return { success: true, tokens };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Refreshes an expired OAuth access token.
 */
ipcMain.handle('oauth-refresh', async (event, clientId, clientSecret, refreshToken) => {
  try {
    oauth.setCredentials(clientId, clientSecret);
    const tokens = await oauth.refreshToken(refreshToken);
    return { success: true, tokens };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Triggers a native system dialog for folder selection.
 */
ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

const { exec } = require('child_process');
/**
 * Safe Shell Bridge
 * Executes commands in the agent's target folder.
 */
ipcMain.handle('exec-command', async (event, command, cwd) => {
  return new Promise((resolve) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null
      });
    });
  });
});

