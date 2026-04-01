/**
 * PIBOT Main Process
 * Menubar window, IPC bridge, provider runtime actions, and agent execution.
 */

const { app, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const { menubar } = require('menubar');
const { exec, execFile } = require('child_process');

const oauth = require('./oauth');
const {
  normalizeModelConfig,
  getProviderStatus,
  listProviderModels,
  installProviderRuntime,
  installProviderModel,
  removeProviderModel,
  installFreeBird,
  uninstallFreeBird
} = require('./model_runtime');

function buildAgentFeedback(result) {
  const lines = [
    '[PIBOT BOT FEEDBACK]',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `AGENT: ${result.agentId || 'Task Execution Complete'}`,
    `TARGET: ${result.target}`,
    `STATUS: ${result.status || 'SUCCESS'}`,
    `MODE: ${result.mode || 'diagnostic'}`,
    `PROVIDER: ${result.provider || 'local-heuristics'}`,
    `MODEL: ${result.model || 'n/a'}`,
    `TIMESTAMP: ${new Date(result.timestamp).toLocaleTimeString()}`
  ];

  if (Array.isArray(result.findings) && result.findings.length) {
    lines.push('FINDINGS:');
    result.findings.forEach((finding) => lines.push(`• ${finding}`));
  }

  if (result.analysis) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('MODEL OUTPUT:');
    lines.push(result.analysis);
  }

  if (result.error) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`RUNTIME NOTE: ${result.error}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

let mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  icon: path.join(__dirname, '..', 'assets', 'iconTemplate.png'),
  browserWindow: {
    width: 480,
    height: 620,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  },
  preloadWindow: true,
  showOnAllWorkspaces: false
});

mb.on('ready', () => {
  console.log('PIBOT is ready for takeoff.');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'PIBOT Autonomous Agent', enabled: false },
    { type: 'separator' },
    { label: 'Show Dashboard', click: () => mb.showWindow() },
    { label: 'Quit PIBOT', click: () => app.quit() }
  ]);

  mb.tray.on('right-click', () => {
    mb.tray.popUpContextMenu(contextMenu);
  });
});

ipcMain.on('quit-app', () => app.quit());
ipcMain.on('hide-window', () => {
  if (mb.window) mb.window.hide();
});

ipcMain.handle('oauth-login', async (event, clientId, clientSecret) => {
  try {
    oauth.setCredentials(clientId, clientSecret);
    const tokens = await oauth.login(mb.window);
    return { success: true, tokens };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('oauth-refresh', async (event, clientId, clientSecret, refreshToken) => {
  try {
    oauth.setCredentials(clientId, clientSecret);
    const tokens = await oauth.refreshToken(refreshToken);
    return { success: true, tokens };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog(mb.window, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mb.window, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('provider-action', async (event, payload = {}) => {
  const action = payload.action;
  const config = normalizeModelConfig(payload.config || {});

  try {
    switch (action) {
      case 'status': {
        const status = await getProviderStatus(config);
        return { success: true, status, models: status.models || [] };
      }
      case 'list-models': {
        const models = await listProviderModels(config);
        const status = await getProviderStatus(config);
        return { success: true, models, status };
      }
      case 'install-runtime': {
        const status = await installProviderRuntime(config);
        return {
          success: true,
          status,
          models: status.models || [],
          message: 'Runtime installed successfully.'
        };
      }
      case 'install-model': {
        const models = await installProviderModel(config, payload.modelName);
        const status = await getProviderStatus(config);
        return {
          success: true,
          models,
          status,
          message: `${payload.modelName} installed successfully.`
        };
      }
      case 'remove-model': {
        const models = await removeProviderModel(config, payload.modelName);
        const status = await getProviderStatus(config);
        return {
          success: true,
          models,
          status,
          message: `${payload.modelName} removed successfully.`
        };
      }
      case 'install-free-bird': {
        const result = await installFreeBird(config, payload.modelName);
        return {
          success: true,
          ...result
        };
      }
      case 'uninstall-free-bird': {
        const result = await uninstallFreeBird(config, payload.modelName);
        return {
          success: true,
          ...result
        };
      }
      default:
        return { success: false, error: `Unknown provider action: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('run-agent', async (event, payloadOrId, folderArg, promptArg) => {
  const payload = typeof payloadOrId === 'object' && payloadOrId !== null
    ? payloadOrId
    : {
        agentId: payloadOrId,
        folder: folderArg,
        prompt: promptArg,
        modelConfig: {}
      };

  const { agentId, folder, prompt, modelConfig } = payload;
  const handlerPath = path.join(__dirname, 'agent_handler.js');
  const normalized = normalizeModelConfig(modelConfig || {});

  return new Promise((resolve) => {
    execFile(process.execPath, [handlerPath, agentId, folder, prompt || ''], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PIBOT_MODEL_CONFIG: JSON.stringify(normalized),
        PIBOT_SYSTEM_PROMPT: normalized.systemPrompt || ''
      },
      maxBuffer: 1024 * 1024 * 25
    }, (error, stdout, stderr) => {
      try {
        if (error) {
          throw new Error(stderr || error.message);
        }

        const result = JSON.parse(stdout);
        resolve({
          success: true,
          output: buildAgentFeedback(result),
          raw: result
        });
      } catch (runtimeError) {
        resolve({
          success: false,
          output: `Execution failed: ${runtimeError.message}`
        });
      }
    });
  });
});

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
