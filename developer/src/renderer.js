/**
 * PIBOT Renderer Process
 * UI state, projects, agents, settings, and FREE BIRD provider orchestration.
 */
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const {
  DEFAULT_MODEL_CONFIG,
  normalizeModelConfig,
  getSuggestedModels
} = require('./model_runtime');

const settingsToggle = document.getElementById('settings-toggle');
const agentsToggle = document.getElementById('agents-toggle');
const projectsToggle = document.getElementById('projects-toggle');
const closeAppBtn = document.getElementById('close-app');
const zenToggleBtn = document.getElementById('zen-toggle');

const settingsPanel = document.getElementById('settings-panel');
const agentsPanel = document.getElementById('agents-panel');
const projectsPanel = document.getElementById('projects-panel');

const saveSettingsBtn = document.getElementById('save-settings');
const toggleDeployBtn = document.getElementById('toggle-deploy-btn');
const deployAgentContainer = document.getElementById('deploy-agent-container');
const closeDeployBtn = document.getElementById('close-deploy-btn');
const initDemoBtn = document.getElementById('init-demo');

const logPopupContainer = document.getElementById('log-popup-container');
const closeLogBtn = document.getElementById('close-log-btn');
const logContentBody = document.getElementById('log-content-body');
const logAgentName = document.getElementById('log-agent-name');
const logAgentColorIcon = document.getElementById('log-agent-color-icon');

const clientIdInput = document.getElementById('client-id');
const clientSecretInput = document.getElementById('client-secret');
const oauthLoginBtn = document.getElementById('oauth-login');
const authStatus = document.getElementById('auth-status');
const toggleCloudAuthBtn = document.getElementById('toggle-cloud-auth-btn');
const cloudAuthControls = document.getElementById('cloud-auth-controls');
const systemPromptInput = document.getElementById('system-prompt');
const autonomousModeInput = document.getElementById('autonomous-mode');

const modeCloudBtn = document.getElementById('mode-cloud-btn');
const modeFreeBirdBtn = document.getElementById('mode-free-bird-btn');
const providerSelect = document.getElementById('provider-select');
const providerBaseUrlInput = document.getElementById('provider-base-url');
const providerApiKeyInput = document.getElementById('provider-api-key');
const providerApiKeyGroup = document.getElementById('provider-api-key-group');
const cloudProviderCard = document.getElementById('cloud-provider-card');
const freeBirdProviderCard = document.getElementById('free-bird-provider-card');
const ollamaOneClickPanel = document.getElementById('ollama-one-click-panel');
const toggleAdvancedProviderBtn = document.getElementById('toggle-advanced-provider-btn');
const advancedProviderControls = document.getElementById('advanced-provider-controls');
const verifyProviderBtn = document.getElementById('verify-provider-btn');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const installOllamaBtn = document.getElementById('install-ollama-btn');
const installFreeBirdBtn = document.getElementById('install-free-bird-btn');
const uninstallFreeBirdBtn = document.getElementById('uninstall-free-bird-btn');
const installModelBtn = document.getElementById('install-model-btn');
const removeModelBtn = document.getElementById('remove-model-btn');
const installModelNameInput = document.getElementById('install-model-name');
const oneClickNote = document.getElementById('one-click-note');
const modelLibraryList = document.getElementById('model-library-list');
const providerStatusBadge = document.getElementById('provider-status-badge');
const providerStatusDetail = document.getElementById('provider-status-detail');
const connectionPulse = document.getElementById('connection-pulse');
const connectionStatusText = document.getElementById('connection-status-text');

const modelSelect = document.getElementById('model-select');
const modelSelectorContainer = document.getElementById('model-selector-container');
const customModelSelector = document.getElementById('custom-model-selector');
const modelDropdown = document.getElementById('model-dropdown');
const selectedModelText = document.getElementById('selected-model-text');
const lockedSettings = document.querySelectorAll('.locked-settings');

const agentsList = document.getElementById('agents-list');
const agentNameInput = document.getElementById('agent-name');
const agentGroupInput = document.getElementById('agent-group');
const agentCronSelect = document.getElementById('agent-cron');
const agentModelSelect = document.getElementById('agent-model');
const agentFolderBtn = document.getElementById('agent-folder-btn');
const agentFolderDisplay = document.getElementById('agent-folder-display');
const agentFolderPathHidden = document.getElementById('agent-folder-path');
const agentPromptInput = document.getElementById('agent-prompt');
const addAgentBtn = document.getElementById('add-agent-btn');
const editingAgentIdInput = document.getElementById('editing-agent-id');

const projectsList = document.getElementById('projects-list');
const addProjectCard = document.getElementById('add-project-card');
const scanWorkspaceBtn = document.getElementById('scan-workspace-btn');
const backToProjectsBtn = document.getElementById('back-to-projects-btn');

const AGENT_PALETTE = ['#48C9B0', '#ED4E9E', '#A855F7', '#22C55E', '#EAB308', '#F97316'];

let savedAgents = safeParse(localStorage.getItem('pibot_agents'), []);
let savedProjects = safeParse(localStorage.getItem('pibot_projects'), []);
let modelConfig = loadModelConfig();
let activeCronJobs = {};
let executingAgents = new Set();
let currentProjectId = null;
let lastActivePanel = 'agents-panel';
let availableModels = [];
let lastProviderStatus = null;
let isZenMode = false;
let zenBots = [];
let zenAnimationFrame = null;
let isAdvancedProviderOpen = false;
let isCloudAuthOpen = false;

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function loadLocalEnvFile() {
  const candidates = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env')
  ];

  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, 'utf8');
      const parsed = {};

      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex === -1) return;
        const key = trimmed.slice(0, equalIndex).trim();
        let value = trimmed.slice(equalIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        parsed[key] = value;
      });

      return parsed;
    } catch (error) {
      console.error('Unable to read local env file:', error);
    }
  }

  return {};
}

function getAgentColor(agent) {
  if (agent.color) return agent.color;
  const idStr = agent.id || agent.name || 'default';
  let hash = 0;
  for (let i = 0; i < idStr.length; i += 1) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

function loadModelConfig() {
  const localEnv = loadLocalEnvFile();
  const stored = safeParse(localStorage.getItem('pibot_model_config'), null) || {};
  const legacy = {
    oauthClientId: localStorage.getItem('oauth_client_id') || localEnv.PIBOT_GOOGLE_CLIENT_ID || '',
    oauthClientSecret: localStorage.getItem('oauth_client_secret') || localEnv.PIBOT_GOOGLE_CLIENT_SECRET || '',
    accessToken: localStorage.getItem('oauth_access_token') || '',
    refreshToken: localStorage.getItem('oauth_refresh_token') || '',
    systemPrompt: localStorage.getItem('pibot_system') || '',
    model: localStorage.getItem('pibot_model') || DEFAULT_MODEL_CONFIG.model,
    autonomousMode: safeParse(localStorage.getItem('pibot_autonomous_mode'), false)
  };

  const merged = normalizeModelConfig({
    ...legacy,
    ...stored
  });

  if (!stored.provider) {
    merged.provider = (legacy.oauthClientId || legacy.accessToken) ? 'google' : 'ollama';
    merged.mode = merged.provider === 'google' ? 'cloud' : 'free-bird';
  }

  const hasCloudCredentials = Boolean(
    merged.oauthClientId ||
    merged.oauthClientSecret ||
    merged.accessToken ||
    merged.refreshToken
  );

  if (merged.provider === 'google' && !hasCloudCredentials) {
    merged.provider = 'ollama';
    merged.mode = 'free-bird';
    merged.model = DEFAULT_MODEL_CONFIG.model;
    merged.baseUrl = DEFAULT_MODEL_CONFIG.baseUrl;
  }

  return merged;
}

function persistModelConfig() {
  const normalized = normalizeModelConfig(modelConfig);
  modelConfig = normalized;

  localStorage.setItem('pibot_model_config', JSON.stringify(normalized));
  localStorage.setItem('oauth_client_id', normalized.oauthClientId || '');
  localStorage.setItem('oauth_client_secret', normalized.oauthClientSecret || '');
  localStorage.setItem('oauth_access_token', normalized.accessToken || '');
  localStorage.setItem('oauth_refresh_token', normalized.refreshToken || '');
  localStorage.setItem('pibot_system', normalized.systemPrompt || '');
  localStorage.setItem('pibot_model', normalized.model || '');
  localStorage.setItem('pibot_autonomous_mode', JSON.stringify(Boolean(normalized.autonomousMode)));
}

function collectConfigFromInputs() {
  const provider = providerSelect.value;
  return normalizeModelConfig({
    ...modelConfig,
    provider,
    mode: provider === 'google' ? 'cloud' : 'free-bird',
    oauthClientId: clientIdInput.value.trim(),
    oauthClientSecret: clientSecretInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
    model: modelSelect.value || selectedModelText.innerText.trim(),
    systemPrompt: systemPromptInput.value.trim(),
    autonomousMode: autonomousModeInput.checked
  });
}

function setMode(mode) {
  if (mode === 'cloud') {
    providerSelect.value = 'google';
  } else if (providerSelect.value === 'google') {
    providerSelect.value = 'ollama';
  }
  modelConfig = collectConfigFromInputs();
  syncProviderUi();
}

function updateLockState() {
  const unlocked = modelConfig.mode === 'free-bird' || Boolean(modelConfig.accessToken);
  lockedSettings.forEach((element) => element.classList.toggle('unlocked', unlocked));
}

function setInlineAuthStatus(message, isError = false) {
  if (!authStatus) return;
  authStatus.classList.remove('hidden-note');
  authStatus.style.color = isError ? '#b91c1c' : 'var(--text-secondary)';
  authStatus.innerText = message;
}

function clearInlineAuthStatus() {
  if (!authStatus) return;
  authStatus.innerText = '';
  authStatus.classList.add('hidden-note');
}

function buildFallbackStatus() {
  if (modelConfig.provider === 'google') {
    if (modelConfig.accessToken) {
      return {
        level: 'ready',
        headline: 'Google Cloud connected',
        detail: 'OAuth tokens are stored locally for this app.',
        models: getSuggestedModels('google')
      };
    }

    return {
      level: 'warning',
      headline: 'Google Cloud disconnected',
      detail: 'Save your Client ID and Client Secret or switch to FREE BIRD for local execution.',
      models: getSuggestedModels('google')
    };
  }

  if (modelConfig.provider === 'openai-compatible') {
    return {
      level: 'warning',
      headline: 'FREE BIRD: Awaiting endpoint',
      detail: 'Point PIBOT at an OpenAI-compatible base URL and verify the runtime.',
      models: getSuggestedModels('openai-compatible')
    };
  }

  return {
    level: 'warning',
    headline: 'FREE BIRD: Awaiting Ollama',
    detail: 'Use "1-Click Install FREE BIRD" to install Ollama and the selected Qwen model in the normal flow.',
    models: getSuggestedModels('ollama')
  };
}

function getModelCatalog(extraModels = []) {
  const mergedAvailable = mergeModels(availableModels, getSuggestedModels(modelConfig.provider));
  return mergeModels(extraModels, mergedAvailable);
}

function getModelMeta(modelId) {
  if (!modelId) return null;
  return getModelCatalog().find((model) => model.id === modelId) || null;
}

function getModelLabel(modelId) {
  const match = getModelMeta(modelId);
  return (match && (match.title || match.id)) || modelId || 'Unassigned';
}

function getAgentAssignedModel(agent) {
  return (agent && agent.model) || modelConfig.model || DEFAULT_MODEL_CONFIG.model;
}

function ensureAgentsHaveModels() {
  let modified = false;
  savedAgents = savedAgents.map((agent) => {
    const resolvedModel = getAgentAssignedModel(agent);
    if (agent.model === resolvedModel) return agent;
    modified = true;
    return {
      ...agent,
      model: resolvedModel
    };
  });

  if (modified) {
    saveAgents();
  }
}

function mergeModels(primaryModels = [], fallbackModels = []) {
  const merged = new Map();
  [...primaryModels, ...fallbackModels].forEach((model) => {
    if (!model) return;
    const normalized = typeof model === 'string'
      ? { id: model, title: model, description: 'Detected model' }
      : {
          id: model.id || model.name || model.title,
          title: model.title || model.id || model.name,
          description: model.description || 'Detected model'
        };

    if (normalized.id) {
      merged.set(normalized.id, normalized);
    }
  });
  return Array.from(merged.values());
}

function renderModelLibrary() {
  if (!modelLibraryList) return;

  const models = getModelCatalog();
  modelLibraryList.innerHTML = '';

  if (!models.length) {
    const emptyState = document.createElement('span');
    emptyState.className = 'model-chip model-chip-missing';
    emptyState.innerText = 'No models available yet.';
    modelLibraryList.appendChild(emptyState);
    return;
  }

  models.forEach((model) => {
    const chip = document.createElement('span');
    chip.className = `model-chip ${model.id === modelConfig.model ? 'default' : ''}`;
    chip.title = model.id;
    chip.innerText = model.id === modelConfig.model
      ? `${model.title || model.id} · Default`
      : (model.title || model.id);
    modelLibraryList.appendChild(chip);
  });
}

function renderAgentModelOptions(selectedModel = '') {
  if (!agentModelSelect) return;

  const preferredModel = selectedModel || agentModelSelect.value || modelConfig.model || DEFAULT_MODEL_CONFIG.model;
  const extraModel = preferredModel && !getModelMeta(preferredModel)
    ? [{ id: preferredModel, title: preferredModel, description: 'Assigned model' }]
    : [];
  const models = getModelCatalog(extraModel);

  agentModelSelect.innerHTML = '';

  models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.innerText = model.title && model.title !== model.id
      ? `${model.title} (${model.id})`
      : model.id;
    agentModelSelect.appendChild(option);
  });

  if (models.some((model) => model.id === preferredModel)) {
    agentModelSelect.value = preferredModel;
  } else if (models[0]) {
    agentModelSelect.value = models[0].id;
  } else {
    agentModelSelect.value = '';
  }
}

function syncAdvancedProviderUi(forceOpen = null) {
  if (!advancedProviderControls || !toggleAdvancedProviderBtn) return;

  const providerRequiresAdvanced = modelConfig.provider === 'openai-compatible';
  if (providerRequiresAdvanced) {
    isAdvancedProviderOpen = true;
  } else if (typeof forceOpen === 'boolean') {
    isAdvancedProviderOpen = forceOpen;
  }

  const showAdvanced = providerRequiresAdvanced || isAdvancedProviderOpen;
  advancedProviderControls.classList.toggle('hidden', !showAdvanced);

  if (modelConfig.provider === 'openai-compatible') {
    toggleAdvancedProviderBtn.innerText = 'Endpoint settings required';
    toggleAdvancedProviderBtn.disabled = true;
  } else {
    toggleAdvancedProviderBtn.disabled = false;
    toggleAdvancedProviderBtn.innerText = showAdvanced
      ? 'Hide advanced runtime options'
      : 'Show advanced runtime options';
  }
}

function syncCloudAuthUi(forceOpen = null) {
  if (!cloudAuthControls || !toggleCloudAuthBtn) return;

  if (typeof forceOpen === 'boolean') {
    isCloudAuthOpen = forceOpen;
  }

  const hasCloudCredentials = Boolean(
    modelConfig.oauthClientId ||
    modelConfig.oauthClientSecret ||
    modelConfig.accessToken ||
    modelConfig.refreshToken
  );

  const showCloudControls = isCloudAuthOpen || hasCloudCredentials;
  cloudAuthControls.classList.toggle('hidden', !showCloudControls);
  toggleCloudAuthBtn.innerText = showCloudControls
    ? 'Hide cloud credentials'
    : 'Show cloud credentials';
}

function setAvailableModels(models = []) {
  availableModels = mergeModels(models, getSuggestedModels(modelConfig.provider));

  if (!availableModels.length) {
    availableModels = getSuggestedModels(modelConfig.provider);
  }

  if (!availableModels.some((model) => model.id === modelConfig.model)) {
    const fallback = availableModels[0];
    if (fallback) {
      modelConfig.model = fallback.id;
    }
  }

  modelSelect.value = modelConfig.model || '';
  selectedModelText.innerText = modelConfig.model || 'Select a model';
  if (!installModelNameInput.value.trim()) {
    installModelNameInput.value = modelConfig.model || '';
  }
  persistModelConfig();
  renderModelDropdown();
  renderModelLibrary();
  renderAgentModelOptions();
  renderAgents();
}

function renderModelDropdown() {
  if (!modelDropdown) return;
  modelDropdown.innerHTML = '';

  availableModels.forEach((model) => {
    const card = document.createElement('div');
    card.className = `model-card ${model.id === modelConfig.model ? 'active' : ''}`;
    if (model.id.toLowerCase().includes('coder')) {
      card.classList.add('pro-model');
    } else if (modelConfig.provider === 'google') {
      card.classList.add('flash-model');
    }
    card.dataset.model = model.id;
    card.innerHTML = `
      <div class="model-card-title">${model.title}</div>
      <div class="model-card-desc">${model.description || ''}</div>
    `;
    modelDropdown.appendChild(card);
  });
}

function pickModel(modelId) {
  if (!modelId) return;
  modelConfig.model = modelId;
  modelSelect.value = modelId;
  selectedModelText.innerText = modelId;
  installModelNameInput.value = modelId;
  persistModelConfig();
  renderModelDropdown();
  renderModelLibrary();
  renderAgentModelOptions(modelId);
}

function applyProviderStatus(status) {
  lastProviderStatus = status || buildFallbackStatus();
  const safeStatus = lastProviderStatus;
  const badgeLevel = ['ready', 'warning', 'error', 'working'].includes(safeStatus.level) ? safeStatus.level : 'warning';

  providerStatusBadge.className = `status-badge ${badgeLevel}`;
  providerStatusBadge.innerText = badgeLevel === 'ready'
    ? 'Ready'
    : badgeLevel === 'error'
      ? 'Error'
      : badgeLevel === 'working'
        ? 'Working'
        : 'Warning';

  providerStatusDetail.innerText = safeStatus.detail || '';
  connectionStatusText.innerText = safeStatus.headline || 'Provider status unavailable';
  connectionPulse.classList.toggle('online', badgeLevel === 'ready');

  if (Array.isArray(safeStatus.models) && safeStatus.models.length) {
    setAvailableModels(safeStatus.models);
  } else {
    setAvailableModels(getSuggestedModels(modelConfig.provider));
  }

  updateLockState();
}

function syncProviderUi() {
  modelConfig = collectConfigFromInputs();

  if (modeCloudBtn) modeCloudBtn.classList.toggle('active', modelConfig.mode === 'cloud');
  if (modeFreeBirdBtn) modeFreeBirdBtn.classList.toggle('active', modelConfig.mode === 'free-bird');

  cloudProviderCard.classList.remove('hidden');
  freeBirdProviderCard.classList.remove('hidden');
  if (ollamaOneClickPanel) {
    ollamaOneClickPanel.classList.toggle('hidden', modelConfig.provider !== 'ollama');
  }
  providerApiKeyGroup.classList.toggle('hidden', modelConfig.provider !== 'openai-compatible');

  installOllamaBtn.style.display = modelConfig.provider === 'ollama' ? 'inline-flex' : 'none';
  installFreeBirdBtn.style.display = modelConfig.provider === 'ollama' ? 'inline-flex' : 'none';
  uninstallFreeBirdBtn.style.display = modelConfig.provider === 'ollama' ? 'inline-flex' : 'none';
  installModelBtn.style.display = modelConfig.provider === 'ollama' ? 'inline-flex' : 'none';
  removeModelBtn.style.display = modelConfig.provider === 'ollama' ? 'inline-flex' : 'none';
  installModelNameInput.placeholder = modelConfig.provider === 'ollama'
    ? 'qwen2.5:1.5b'
    : 'Model id exposed by your endpoint';
  oneClickNote.innerText = modelConfig.provider === 'ollama'
    ? '1-click install installs Ollama if needed and downloads the selected model. 1-click uninstall removes only the selected model and keeps Ollama ready for a fast reinstall.'
    : 'One-click install is available only for Ollama because PIBOT can manage that runtime locally.';

  providerBaseUrlInput.value = modelConfig.baseUrl || '';
  providerApiKeyInput.value = modelConfig.apiKey || '';
  clientIdInput.value = modelConfig.oauthClientId || '';
  clientSecretInput.value = modelConfig.oauthClientSecret || '';
  systemPromptInput.value = modelConfig.systemPrompt || '';
  autonomousModeInput.checked = Boolean(modelConfig.autonomousMode);

  modelSelectorContainer.classList.toggle('unlocked', modelConfig.mode === 'free-bird' || Boolean(modelConfig.accessToken));
  syncAdvancedProviderUi();
  syncCloudAuthUi();

  applyProviderStatus(lastProviderStatus || buildFallbackStatus());
  renderModelLibrary();
  renderAgentModelOptions();
}

function saveAgents() {
  localStorage.setItem('pibot_agents', JSON.stringify(savedAgents));
}

function saveProjects() {
  localStorage.setItem('pibot_projects', JSON.stringify(savedProjects));
}

function generateDefaultTestBots() {
  const rootPath = __dirname.includes('src') ? path.join(__dirname, '..', '..') : __dirname;
  const agentsDirPath = path.join(rootPath, 'agents');
  if (!fs.existsSync(agentsDirPath)) fs.mkdirSync(agentsDirPath, { recursive: true });

  const tests = [
    { name: 'Security Guard', group: 'Safety', prompt: 'Audit file permissions.', color: '#48C9B0' },
    { name: 'Code Refactorer', group: 'Quality', prompt: 'Find redundant logic.', color: '#A855F7' },
    { name: 'SEO Optimizer', group: 'Growth', prompt: 'Check meta tags.', color: '#22C55E' }
  ];

  tests.forEach((testAgent) => {
    const folderName = testAgent.name.replace(/ /g, '_');
    const folderPath = path.join(agentsDirPath, folderName);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    if (savedAgents.some((agent) => agent.folder === folderPath || agent.name === testAgent.name)) {
      return;
    }

    savedAgents.push({
      id: `agent_test_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: testAgent.name,
      group: testAgent.group,
      cron: '0 * * * *',
      model: modelConfig.model || DEFAULT_MODEL_CONFIG.model,
      folder: folderPath,
      prompt: testAgent.prompt,
      lastOutput: null,
      color: testAgent.color,
      hasUnreadOutput: false
    });
  });

  saveAgents();
}

function discoverLocalAgents() {
  try {
    const rootPath = __dirname.includes('src') ? path.join(__dirname, '..', '..') : __dirname;
    const agentsDirPath = path.join(rootPath, 'agents');
    if (!fs.existsSync(agentsDirPath)) return;

    const folders = fs.readdirSync(agentsDirPath)
      .filter((folderName) => fs.lstatSync(path.join(agentsDirPath, folderName)).isDirectory());

    let modified = false;

    folders.forEach((folderName) => {
      const folderPath = path.join(agentsDirPath, folderName);
      const agentJsonPath = path.join(folderPath, 'agent.json');
      let agentData = {};

      if (fs.existsSync(agentJsonPath)) {
        try {
          agentData = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'));
        } catch (error) {
          console.error('Error parsing agent.json for', folderName, error);
        }
      }

      const existingIndex = savedAgents.findIndex((agent) => agent.folder === folderPath);
      if (existingIndex === -1) {
        savedAgents.push({
          id: `agent_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          name: agentData.name || folderName.replace(/_/g, ' '),
          group: agentData.group || 'Discovered',
          cron: agentData.cron || '0 * * * *',
          model: agentData.model || modelConfig.model || DEFAULT_MODEL_CONFIG.model,
          folder: folderPath,
          prompt: agentData.prompt || 'Analyze files.',
          lastOutput: null,
          hasUnreadOutput: false
        });
        modified = true;
      } else {
        const existing = savedAgents[existingIndex];
        ['name', 'group', 'cron', 'prompt', 'model'].forEach((key) => {
          if (agentData[key] && existing[key] !== agentData[key]) {
            existing[key] = agentData[key];
            modified = true;
          }
        });
        if (!existing.model) {
          existing.model = modelConfig.model || DEFAULT_MODEL_CONFIG.model;
          modified = true;
        }
      }
    });

    if (modified) saveAgents();
  } catch (error) {
    console.error(error);
  }
}

async function runAgent(agent) {
  if (executingAgents.has(agent.id)) return;

  executingAgents.add(agent.id);
  renderAgents();

  try {
    const resolvedModel = getAgentAssignedModel(agent);
    const result = await ipcRenderer.invoke('run-agent', {
      agentId: agent.id,
      folder: agent.folder,
      prompt: agent.prompt,
      modelConfig: normalizeModelConfig({
        ...modelConfig,
        model: resolvedModel
      })
    });

    agent.lastOutput = result.output || 'Execution finished with no output.';
    agent.hasUnreadOutput = true;
    saveAgents();
  } catch (error) {
    agent.lastOutput = `Execution failed: ${error.message}`;
    agent.hasUnreadOutput = true;
    saveAgents();
  } finally {
    executingAgents.delete(agent.id);
    renderAgents();
  }
}

function switchPanel(panelId) {
  if (isZenMode) toggleZenMode();

  agentsPanel.classList.remove('active');
  projectsPanel.classList.remove('active');
  settingsPanel.classList.remove('active');
  agentsToggle.classList.remove('active');
  projectsToggle.classList.remove('active');
  settingsToggle.classList.remove('active');

  const target = document.getElementById(panelId);
  if (target) target.classList.add('active');

  if (panelId === 'agents-panel') agentsToggle.classList.add('active');
  if (panelId === 'projects-panel') projectsToggle.classList.add('active');
  if (panelId === 'settings-panel') settingsToggle.classList.add('active');

  if (panelId !== 'settings-panel') lastActivePanel = panelId;
}

function renderAgents() {
  if (!agentsList) return;
  agentsList.innerHTML = '';

  const grouped = savedAgents.reduce((acc, agent) => {
    const groupName = agent.group || 'General';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(agent);
    return acc;
  }, {});

  Object.keys(grouped).sort().forEach((groupName) => {
    const header = document.createElement('div');
    header.className = 'agent-group-header';
    header.innerText = groupName;
    agentsList.appendChild(header);

    grouped[groupName].forEach((agent) => {
      const color = getAgentColor(agent);
      const isExecuting = executingAgents.has(agent.id);
      const assignedModel = getAgentAssignedModel(agent);
      const modelAvailable = Boolean(getModelMeta(assignedModel));
      const modelLabel = getModelLabel(assignedModel);
      const card = document.createElement('div');
      card.className = `agent-card ${isExecuting ? 'is-active' : ''}`;
      card.innerHTML = `
        <div class="agent-header">
          <div class="agent-title-group">
            <img src="../assets/icon.png" class="agent-avatar ${isExecuting ? 'status-active' : (agent.hasUnreadOutput ? 'status-ready' : 'status-idle')}" alt="PI-Bot" style="border: 2px solid ${isExecuting ? color : 'rgba(0,0,0,0.05)'};">
            <div>
              <div class="agent-name">${agent.name}</div>
              <div class="agent-status-label" style="color: ${isExecuting ? color : 'inherit'}">${isExecuting ? 'Executing...' : (agent.hasUnreadOutput ? 'New Feedback' : 'Ready')}</div>
            </div>
          </div>
        </div>
        <div class="agent-meta-row">
          <div class="agent-folder">📂 ${path.basename(agent.folder)}</div>
          <div class="agent-model-badge ${modelAvailable ? '' : 'missing'}" title="${assignedModel}">
            ${modelAvailable ? `Model: ${modelLabel}` : `Missing model: ${assignedModel}`}
          </div>
        </div>
        <div class="agent-actions">
          <button class="agent-btn activity-btn ${agent.hasUnreadOutput ? 'lit-up' : ''}" data-id="${agent.id}" title="View Feedback" style="${agent.hasUnreadOutput ? `border-color:${color}; color:${color};` : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            Log
          </button>
          <button class="agent-btn run-btn" data-id="${agent.id}" style="border-color: ${color}4D; color: ${color};">🚀 Wake</button>
          <button class="agent-btn edit-btn" data-id="${agent.id}">✏️</button>
          <button class="agent-btn danger del-btn" data-id="${agent.id}">🗑️</button>
        </div>
      `;
      agentsList.appendChild(card);
    });
  });
}

function renderProjects() {
  if (!projectsList || !addProjectCard) return;
  projectsList.innerHTML = '';
  projectsList.appendChild(addProjectCard);

  savedProjects.forEach((project) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-del-btn" data-id="${project.id}">✕</div>
      <div class="project-icon">📂</div>
      <div class="project-name">${project.name}</div>
    `;
    card.onclick = (event) => {
      if (event.target.classList.contains('project-del-btn')) {
        event.stopPropagation();
        removeProject(project.id);
      } else {
        selectProject(project);
      }
    };
    projectsList.insertBefore(card, addProjectCard);
  });
}

function removeProject(id) {
  const project = savedProjects.find((item) => item.id === id);
  if (!confirm(`Remove project context for "${project ? project.name : 'this codebase'}"?`)) return;
  savedProjects = savedProjects.filter((item) => item.id !== id);
  saveProjects();
  renderProjects();
}

function selectProject(project) {
  currentProjectId = project.id;
  switchPanel('agents-panel');
}

function resetAgentForm() {
  agentNameInput.value = '';
  agentGroupInput.value = '';
  agentCronSelect.value = '* * * * *';
  renderAgentModelOptions(modelConfig.model);
  agentPromptInput.value = '';
  agentFolderPathHidden.value = '';
  agentFolderDisplay.innerText = 'Target: Not selected';
  editingAgentIdInput.value = '';
  deployAgentContainer.classList.remove('active');
  toggleDeployBtn.classList.remove('active');
}

async function addProjectManually() {
  const folderPath = await ipcRenderer.invoke('open-directory-dialog');
  if (!folderPath) return;

  if (!savedProjects.find((project) => project.path === folderPath)) {
    savedProjects.push({
      id: `proj_${Date.now()}`,
      name: path.basename(folderPath).replace(/_/g, ' '),
      path: folderPath
    });
    saveProjects();
    renderProjects();
  }
}

async function scanWorkspace(rootPath) {
  try {
    const items = fs.readdirSync(rootPath);
    let found = 0;

    items.forEach((item) => {
      const fullPath = path.join(rootPath, item);
      if (!fs.statSync(fullPath).isDirectory()) return;

      const markers = ['.git', 'package.json', 'requirements.txt'];
      if (markers.some((marker) => fs.existsSync(path.join(fullPath, marker)))) {
        if (!savedProjects.find((project) => project.path === fullPath)) {
          savedProjects.push({
            id: `proj_${Date.now()}_${found}`,
            name: item.replace(/_/g, ' '),
            path: fullPath
          });
          found += 1;
        }
      }
    });

    if (found > 0) {
      saveProjects();
      renderProjects();
    }
  } catch (error) {
    console.error(error);
  }
}

function scheduleAllAgents() {
  Object.values(activeCronJobs).forEach((job) => job.stop());
  activeCronJobs = {};

  if (!modelConfig.autonomousMode) return;

  savedAgents.forEach((agent) => {
    if (!cron.validate(agent.cron)) return;
    activeCronJobs[agent.id] = cron.schedule(agent.cron, () => runAgent(agent));
  });
}

function toggleModelDropdown(forceOpen) {
  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : modelDropdown.classList.contains('hidden');

  customModelSelector.classList.toggle('open', shouldOpen);
  modelDropdown.classList.toggle('hidden', !shouldOpen);
}

async function runProviderAction(action, overrides = {}, busyButton = null, busyLabel = '') {
  const nextConfig = collectConfigFromInputs();
  modelConfig = nextConfig;
  persistModelConfig();

  const originalLabel = busyButton ? busyButton.innerText : null;

  try {
    if (busyButton) busyButton.innerText = busyLabel;
    providerStatusBadge.className = 'status-badge working';
    providerStatusBadge.innerText = 'Working';
    providerStatusDetail.innerText = 'Running provider action...';

    const result = await ipcRenderer.invoke('provider-action', {
      action,
      config: nextConfig,
      ...overrides
    });

    if (!result.success) {
      throw new Error(result.error || 'Provider action failed.');
    }

    if (result.status) {
      applyProviderStatus(result.status);
    } else {
      applyProviderStatus(buildFallbackStatus());
    }

    if (Array.isArray(result.models)) {
      setAvailableModels(result.models);
    }

    if (result.message) {
      providerStatusDetail.innerText = `${providerStatusDetail.innerText} ${result.message}`.trim();
    }

    return result;
  } catch (error) {
    applyProviderStatus({
      level: 'error',
      headline: modelConfig.mode === 'free-bird' ? 'FREE BIRD action failed' : 'Cloud action failed',
      detail: error.message,
      models: getSuggestedModels(modelConfig.provider)
    });
    throw error;
  } finally {
    if (busyButton && originalLabel !== null) busyButton.innerText = originalLabel;
  }
}

async function verifyProvider() {
  try {
    await runProviderAction('status', {}, verifyProviderBtn, 'Verifying...');
  } catch (error) {
    console.error(error);
  }
}

async function refreshModels() {
  try {
    await runProviderAction('list-models', {}, refreshModelsBtn, 'Refreshing...');
  } catch (error) {
    console.error(error);
  }
}

async function installRuntime() {
  try {
    await runProviderAction('install-runtime', {}, installOllamaBtn, 'Installing...');
  } catch (error) {
    console.error(error);
  }
}

async function installFreeBirdOneClick() {
  const modelName = installModelNameInput.value.trim() || modelConfig.model;
  if (!modelName) return alert('Model name required.');

  try {
    await runProviderAction('install-free-bird', { modelName }, installFreeBirdBtn, 'Installing...');
    pickModel(modelName);
  } catch (error) {
    console.error(error);
  }
}

async function uninstallFreeBirdOneClick() {
  const modelName = installModelNameInput.value.trim() || modelConfig.model;
  if (!confirm(`1-click uninstall will remove only "${modelName}". Ollama will stay installed. Continue?`)) return;

  try {
    const result = await runProviderAction('uninstall-free-bird', { modelName }, uninstallFreeBirdBtn, 'Uninstalling...');
    const nextModel = (result.models && result.models[0] && result.models[0].id) || getSuggestedModels(modelConfig.provider)[0]?.id || '';
    if (nextModel) {
      pickModel(nextModel);
    }
  } catch (error) {
    console.error(error);
  }
}

async function installModel() {
  const modelName = installModelNameInput.value.trim() || modelConfig.model;
  if (!modelName) return alert('Model name required.');

  try {
    await runProviderAction('install-model', { modelName }, installModelBtn, 'Installing...');
    pickModel(modelName);
  } catch (error) {
    console.error(error);
  }
}

async function removeModel() {
  const modelName = installModelNameInput.value.trim() || modelConfig.model;
  if (!modelName) return alert('Model name required.');
  if (!confirm(`Remove model "${modelName}"?`)) return;

  try {
    const result = await runProviderAction('remove-model', { modelName }, removeModelBtn, 'Removing...');
    const nextModel = (result.models && result.models[0] && result.models[0].id) || getSuggestedModels(modelConfig.provider)[0]?.id || '';
    if (modelConfig.model === modelName && nextModel) {
      pickModel(nextModel);
    }
  } catch (error) {
    console.error(error);
  }
}

async function connectGoogleCloud() {
  const cid = clientIdInput.value.trim();
  const secret = clientSecretInput.value.trim();

  if (!cid || !secret) {
    alert('Client ID and Client Secret required.');
    return;
  }

  clearInlineAuthStatus();
  oauthLoginBtn.innerText = 'Connecting...';

  try {
    const response = await ipcRenderer.invoke('oauth-login', cid, secret);
    if (!response.success) {
      throw new Error(response.error || 'Connection failed.');
    }

    modelConfig = normalizeModelConfig({
      ...collectConfigFromInputs(),
      provider: 'google',
      mode: 'cloud',
      oauthClientId: cid,
      oauthClientSecret: secret,
      accessToken: response.tokens.access_token || '',
      refreshToken: response.tokens.refresh_token || modelConfig.refreshToken || ''
    });

    persistModelConfig();
    setInlineAuthStatus('Google Cloud connected successfully.');
    applyProviderStatus({
      level: 'ready',
      headline: 'Google Cloud connected',
      detail: 'OAuth tokens were stored locally for this PIBOT session.',
      models: getSuggestedModels('google')
    });
    syncProviderUi();
  } catch (error) {
    setInlineAuthStatus(error.message, true);
    applyProviderStatus({
      level: 'error',
      headline: 'Google Cloud connection failed',
      detail: error.message,
      models: getSuggestedModels('google')
    });
  } finally {
    oauthLoginBtn.innerText = 'Connect PIBOT API';
  }
}

function saveSettings() {
  modelConfig = collectConfigFromInputs();
  persistModelConfig();
  syncProviderUi();
  scheduleAllAgents();

  const currentStatus = lastProviderStatus || buildFallbackStatus();
  applyProviderStatus({
    ...currentStatus,
    detail: `${currentStatus.detail} Configuration saved locally.`.trim()
  });
}

function initializeFromState() {
  if (savedAgents.length === 0) generateDefaultTestBots();
  discoverLocalAgents();
  syncProviderUi();
  ensureAgentsHaveModels();
  renderProjects();
  renderAgents();
  scheduleAllAgents();
}

function toggleZenMode() {
  isZenMode = !isZenMode;
  const overlay = document.getElementById('zen-overlay');
  const container = document.querySelector('.app-container');

  if (isZenMode) {
    overlay.classList.add('active');
    container.classList.add('zen-active');
    zenToggleBtn.classList.add('active');
    initZenBots();
    animateZen();
  } else {
    overlay.classList.remove('active');
    container.classList.remove('zen-active');
    zenToggleBtn.classList.remove('active');
    cancelAnimationFrame(zenAnimationFrame);
    overlay.innerHTML = '';
  }
}

function initZenBots() {
  const overlay = document.getElementById('zen-overlay');
  overlay.innerHTML = '';
  zenBots = [];
  const bounds = overlay.getBoundingClientRect();

  savedAgents.forEach((agent) => {
    const botEl = document.createElement('div');
    botEl.className = 'floating-bot';
    botEl.style.pointerEvents = 'auto';

    const isExecuting = executingAgents.has(agent.id);
    const color = getAgentColor(agent);
    const statusText = agent.lastOutput || 'Waiting for instructions...';

    botEl.innerHTML = `
      <div class="comic-bubble">
        <div class="comic-bubble-text">${statusText}</div>
      </div>
      <img src="../assets/icon.png" class="agent-avatar ${isExecuting ? 'status-active' : (agent.hasUnreadOutput ? 'status-ready' : 'status-idle')}" style="border: 2px solid ${isExecuting ? color : 'rgba(0,0,0,0.05)'}">
      <div class="zen-name" style="color: ${isExecuting ? color : 'inherit'}">${agent.name}</div>
    `;
    overlay.appendChild(botEl);

    const botObj = {
      el: botEl,
      id: agent.id,
      x: Math.random() * Math.max(1, bounds.width - 60),
      y: Math.random() * Math.max(1, bounds.height - 60),
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      isPaused: false
    };

    botEl.addEventListener('click', (event) => {
      event.stopPropagation();
      botObj.isPaused = !botObj.isPaused;
      const bubble = botEl.querySelector('.comic-bubble');
      const bubbleText = botEl.querySelector('.comic-bubble-text');
      const currentAgent = savedAgents.find((item) => item.id === agent.id);
      if (botObj.isPaused) {
        bubbleText.innerText = (currentAgent && currentAgent.lastOutput) || 'Waiting for instructions...';
        bubble.classList.add('active');
      } else {
        bubble.classList.remove('active');
      }
    });

    zenBots.push(botObj);
  });
}

function animateZen() {
  const overlay = document.getElementById('zen-overlay');
  if (!overlay || !isZenMode) return;
  const bounds = overlay.getBoundingClientRect();

  zenBots.forEach((bot) => {
    if (bot.isPaused) return;

    bot.x += bot.vx;
    bot.y += bot.vy;

    if (bot.x <= 0 || bot.x >= bounds.width - 50) bot.vx *= -1;
    if (bot.y <= 0 || bot.y >= bounds.height - 70) bot.vy *= -1;

    bot.el.style.transform = `translate(${bot.x}px, ${bot.y}px)`;
  });

  zenAnimationFrame = requestAnimationFrame(animateZen);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeFromState();
  switchPanel('agents-panel');

  agentsToggle.addEventListener('click', () => switchPanel('agents-panel'));
  projectsToggle.addEventListener('click', () => switchPanel('projects-panel'));
  settingsToggle.addEventListener('click', () => {
    if (settingsPanel.classList.contains('active')) switchPanel(lastActivePanel);
    else switchPanel('settings-panel');
  });

  closeAppBtn.addEventListener('click', () => ipcRenderer.send('hide-window'));
  closeDeployBtn.addEventListener('click', resetAgentForm);
  closeLogBtn.addEventListener('click', () => logPopupContainer.classList.remove('active'));
  zenToggleBtn.addEventListener('click', toggleZenMode);

  toggleDeployBtn.addEventListener('click', () => {
    const shouldOpen = !deployAgentContainer.classList.contains('active');
    if (shouldOpen) {
      resetAgentForm();
      deployAgentContainer.classList.add('active');
      toggleDeployBtn.classList.add('active');
    } else {
      resetAgentForm();
    }
  });

  backToProjectsBtn.addEventListener('click', () => switchPanel('projects-panel'));
  scanWorkspaceBtn.addEventListener('click', () => {
    const desktopPath = path.join(__dirname, '..', '..', '..');
    scanWorkspace(desktopPath);
  });
  addProjectCard.addEventListener('click', addProjectManually);

  if (toggleCloudAuthBtn) {
    toggleCloudAuthBtn.addEventListener('click', () => {
      isCloudAuthOpen = !isCloudAuthOpen;
      syncCloudAuthUi();
    });
  }

  addAgentBtn.addEventListener('click', () => {
    const existingAgent = savedAgents.find((item) => item.id === editingAgentIdInput.value);
    const agent = {
      id: editingAgentIdInput.value || `agent_${Date.now()}`,
      name: agentNameInput.value.trim(),
      group: agentGroupInput.value.trim() || 'General',
      cron: agentCronSelect.value,
      model: agentModelSelect.value || modelConfig.model || DEFAULT_MODEL_CONFIG.model,
      folder: agentFolderPathHidden.value,
      prompt: agentPromptInput.value.trim(),
      lastOutput: existingAgent ? existingAgent.lastOutput : null,
      hasUnreadOutput: existingAgent ? existingAgent.hasUnreadOutput : false,
      color: existingAgent ? existingAgent.color : undefined
    };

    if (!agent.name || !agent.folder) {
      alert('Name and Folder required.');
      return;
    }

    const index = savedAgents.findIndex((item) => item.id === agent.id);
    if (index > -1) {
      savedAgents[index] = {
        ...savedAgents[index],
        ...agent
      };
    } else {
      savedAgents.push(agent);
    }

    saveAgents();
    resetAgentForm();
    renderAgents();
    scheduleAllAgents();
  });

  agentsList.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const agent = savedAgents.find((item) => item.id === id);
    if (!agent) return;

    if (btn.classList.contains('del-btn')) {
      if (!confirm(`Delete agent "${agent.name}"?`)) return;
      savedAgents = savedAgents.filter((item) => item.id !== id);
      saveAgents();
      renderAgents();
      scheduleAllAgents();
      return;
    }

    if (btn.classList.contains('edit-btn')) {
      agentNameInput.value = agent.name;
      agentGroupInput.value = agent.group || 'General';
      agentCronSelect.value = agent.cron || '* * * * *';
      renderAgentModelOptions(getAgentAssignedModel(agent));
      agentFolderPathHidden.value = agent.folder;
      agentFolderDisplay.innerText = `Target: ${path.basename(agent.folder)}`;
      agentPromptInput.value = agent.prompt;
      editingAgentIdInput.value = agent.id;
      deployAgentContainer.classList.add('active');
      toggleDeployBtn.classList.add('active');
      return;
    }

    if (btn.classList.contains('run-btn')) {
      runAgent(agent);
      return;
    }

    if (btn.classList.contains('activity-btn')) {
      logAgentName.innerText = agent.name;
      logAgentColorIcon.style.background = getAgentColor(agent);
      logContentBody.innerText = agent.lastOutput || "No activity logs recorded yet. Click 'Wake' to start.";
      logPopupContainer.classList.add('active');
      agent.hasUnreadOutput = false;
      saveAgents();
      renderAgents();
    }
  });

  agentFolderBtn.addEventListener('click', async () => {
    const folderPath = await ipcRenderer.invoke('select-folder');
    if (!folderPath) return;
    agentFolderPathHidden.value = folderPath;
    agentFolderDisplay.innerText = `Target: ${path.basename(folderPath)}`;
  });

  oauthLoginBtn.addEventListener('click', connectGoogleCloud);
  if (modeCloudBtn) modeCloudBtn.addEventListener('click', () => setMode('cloud'));
  if (modeFreeBirdBtn) modeFreeBirdBtn.addEventListener('click', () => setMode('free-bird'));
  providerSelect.addEventListener('change', () => {
    modelConfig = collectConfigFromInputs();
    clearInlineAuthStatus();
    lastProviderStatus = null;
    if (modelConfig.provider !== 'openai-compatible') {
      isAdvancedProviderOpen = false;
    }
    syncProviderUi();
  });

  if (toggleAdvancedProviderBtn) {
    toggleAdvancedProviderBtn.addEventListener('click', () => {
      if (modelConfig.provider === 'openai-compatible') return;
      isAdvancedProviderOpen = !isAdvancedProviderOpen;
      syncAdvancedProviderUi();
    });
  }

  verifyProviderBtn.addEventListener('click', verifyProvider);
  refreshModelsBtn.addEventListener('click', refreshModels);
  installOllamaBtn.addEventListener('click', installRuntime);
  installFreeBirdBtn.addEventListener('click', installFreeBirdOneClick);
  uninstallFreeBirdBtn.addEventListener('click', uninstallFreeBirdOneClick);
  installModelBtn.addEventListener('click', installModel);
  removeModelBtn.addEventListener('click', removeModel);

  customModelSelector.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleModelDropdown();
  });

  modelDropdown.addEventListener('click', (event) => {
    const card = event.target.closest('.model-card');
    if (!card) return;
    pickModel(card.dataset.model);
    toggleModelDropdown(false);
  });

  document.addEventListener('click', (event) => {
    if (!customModelSelector.contains(event.target) && !modelDropdown.contains(event.target)) {
      toggleModelDropdown(false);
    }
  });

  saveSettingsBtn.addEventListener('click', saveSettings);
  autonomousModeInput.addEventListener('change', () => {
    modelConfig = collectConfigFromInputs();
    persistModelConfig();
    scheduleAllAgents();
    syncProviderUi();
  });

  initDemoBtn.addEventListener('click', () => {
    generateDefaultTestBots();
    discoverLocalAgents();
    renderAgents();
    scheduleAllAgents();
  });

  if (modelConfig.mode === 'free-bird') {
    verifyProvider();
  } else {
    applyProviderStatus(buildFallbackStatus());
  }
});
