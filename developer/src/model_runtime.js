const { execFile, spawn } = require('child_process');

const DEFAULT_MODEL_CONFIG = {
  mode: 'free-bird',
  provider: 'ollama',
  model: 'qwen2.5:1.5b',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: '',
  oauthClientId: '',
  oauthClientSecret: '',
  accessToken: '',
  refreshToken: '',
  systemPrompt: '',
  autonomousMode: false
};

const MODEL_LIBRARY = {
  google: [
    {
      id: 'gemini-2.5-pro',
      title: 'Gemini 2.5 Pro',
      description: 'Cloud model for deeper reasoning once Google execution is wired.'
    },
    {
      id: 'gemini-2.5-flash',
      title: 'Gemini 2.5 Flash',
      description: 'Lower-latency cloud model option for lightweight tasks.'
    }
  ],
  ollama: [
    {
      id: 'qwen2.5:1.5b',
      title: 'Qwen 2.5 1.5B',
      description: 'Recommended one-click local starter model.'
    },
    {
      id: 'qwen2.5-coder:7b',
      title: 'Qwen 2.5 Coder 7B',
      description: 'Balanced local coding model for FREE BIRD.'
    },
    {
      id: 'qwen2.5-coder:14b',
      title: 'Qwen 2.5 Coder 14B',
      description: 'Stronger local coding model if your machine can carry it.'
    },
    {
      id: 'qwen2.5:7b',
      title: 'Qwen 2.5 7B',
      description: 'General local assistant model.'
    },
    {
      id: 'qwen2.5:3b',
      title: 'Qwen 2.5 3B',
      description: 'Smaller local option for faster responses.'
    }
  ],
  'openai-compatible': [
    {
      id: 'qwen2.5-coder',
      title: 'Qwen Coder',
      description: 'Example model id for self-hosted OpenAI-compatible APIs.'
    },
    {
      id: 'qwen2.5-instruct',
      title: 'Qwen Instruct',
      description: 'Example instruction-tuned model id for auto-hosted runtimes.'
    }
  ]
};

function defaultModelForProvider(provider) {
  return (MODEL_LIBRARY[provider] && MODEL_LIBRARY[provider][0] && MODEL_LIBRARY[provider][0].id) || DEFAULT_MODEL_CONFIG.model;
}

function normalizeBaseUrl(value, fallback) {
  const url = (value || fallback || '').trim();
  return url.replace(/\/+$/, '');
}

function normalizeModelConfig(raw = {}) {
  const merged = {
    ...DEFAULT_MODEL_CONFIG,
    ...raw
  };

  merged.provider = merged.provider || (merged.mode === 'cloud' ? 'google' : 'ollama');
  merged.mode = merged.mode || (merged.provider === 'google' ? 'cloud' : 'free-bird');

  if (merged.provider === 'google') {
    merged.mode = 'cloud';
  } else {
    merged.mode = 'free-bird';
  }

  if (merged.provider === 'ollama') {
    merged.baseUrl = normalizeBaseUrl(merged.baseUrl, DEFAULT_MODEL_CONFIG.baseUrl) || DEFAULT_MODEL_CONFIG.baseUrl;
  } else if (merged.provider === 'openai-compatible') {
    merged.baseUrl = normalizeBaseUrl(merged.baseUrl, 'http://127.0.0.1:8000/v1') || 'http://127.0.0.1:8000/v1';
  } else {
    merged.baseUrl = normalizeBaseUrl(merged.baseUrl, '');
  }

  merged.model = (merged.model || '').trim() || defaultModelForProvider(merged.provider);
  merged.apiKey = merged.apiKey || '';
  merged.oauthClientId = merged.oauthClientId || '';
  merged.oauthClientSecret = merged.oauthClientSecret || '';
  merged.accessToken = merged.accessToken || '';
  merged.refreshToken = merged.refreshToken || '';
  merged.systemPrompt = merged.systemPrompt || '';
  merged.autonomousMode = Boolean(merged.autonomousMode);

  return merged;
}

function getSuggestedModels(provider) {
  return MODEL_LIBRARY[provider] ? [...MODEL_LIBRARY[provider]] : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execFileAsync(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      maxBuffer: 1024 * 1024 * 25,
      ...options
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout || '';
        error.stderr = stderr || '';
        reject(error);
        return;
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

async function findCommand(command) {
  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-lc', `command -v ${command}`]);
    return stdout.trim() || null;
  } catch (error) {
    return null;
  }
}

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function mapStatus(level, headline, detail, extra = {}) {
  return {
    level,
    headline,
    detail,
    ...extra
  };
}

async function pingOllama(baseUrl) {
  try {
    await fetchJson(`${baseUrl}/api/tags`, {}, 2500);
    return true;
  } catch (error) {
    return false;
  }
}

async function startOllamaServer(config, binaryPath) {
  const normalized = normalizeModelConfig(config);
  const brewPath = await findCommand('brew');

  if (await pingOllama(normalized.baseUrl)) {
    return true;
  }

  if (brewPath) {
    try {
      await execFileAsync(brewPath, ['services', 'start', 'ollama'], { timeout: 30000 });
    } catch (error) {
      // Ignore here and try starting a detached serve process below.
    }
  }

  const child = spawn(binaryPath, ['serve'], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION || '1',
      OLLAMA_KV_CACHE_TYPE: process.env.OLLAMA_KV_CACHE_TYPE || 'q8_0'
    }
  });

  child.unref();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(1000);
    if (await pingOllama(normalized.baseUrl)) {
      return true;
    }
  }

  return false;
}

async function ensureOllamaReady(config) {
  const normalized = normalizeModelConfig(config);
  const binaryPath = await findCommand('ollama');

  if (!binaryPath) {
    throw new Error('Ollama is not installed. Use "1-Click Install FREE BIRD" in settings first.');
  }

  if (await pingOllama(normalized.baseUrl)) {
    return true;
  }

  const started = await startOllamaServer(normalized, binaryPath);
  if (!started) {
    throw new Error(`Ollama is installed but the API at ${normalized.baseUrl} is not reachable.`);
  }

  return true;
}

async function getOllamaModels(config) {
  const normalized = normalizeModelConfig(config);
  await ensureOllamaReady(normalized);
  const payload = await fetchJson(`${normalized.baseUrl}/api/tags`, {}, 5000);

  return (payload.models || []).map((model) => ({
    id: model.name,
    title: model.name,
    description: model.details && model.details.family
      ? `${model.details.family} (${Math.round((model.size || 0) / 1024 / 1024)} MB)`
      : `Installed local model (${Math.round((model.size || 0) / 1024 / 1024)} MB)`
  }));
}

async function getOllamaStatus(config) {
  const normalized = normalizeModelConfig(config);
  const binaryPath = await findCommand('ollama');

  if (!binaryPath) {
    return mapStatus(
      'warning',
      'FREE BIRD: Ollama missing',
      'Use "1-Click Install FREE BIRD" to add Ollama and a local Qwen model.',
      { installed: false, reachable: false, models: getSuggestedModels('ollama') }
    );
  }

  try {
    const models = await getOllamaModels(normalized);
    return mapStatus(
      'ready',
      'FREE BIRD: Ollama ready',
      models.length
        ? `${models.length} local model(s) available.`
        : 'Ollama is running but there are no local models yet.',
      { installed: true, reachable: true, models }
    );
  } catch (error) {
    return mapStatus(
      'warning',
      'FREE BIRD: Ollama installed',
      error.message,
      { installed: true, reachable: false, models: getSuggestedModels('ollama') }
    );
  }
}

async function installOllama(config) {
  const existingBinary = await findCommand('ollama');
  if (existingBinary) {
    await startOllamaServer(config, existingBinary);
    return getOllamaStatus(config);
  }

  const brewPath = await findCommand('brew');

  if (!brewPath) {
    throw new Error('Homebrew is not available. Install Ollama manually from https://ollama.com/download.');
  }

  await execFileAsync(brewPath, ['install', 'ollama'], { timeout: 1000 * 60 * 20 });
  const binaryPath = await findCommand('ollama');

  if (!binaryPath) {
    throw new Error('Ollama installation finished, but the binary is still not on PATH.');
  }

  await startOllamaServer(config, binaryPath);
  return getOllamaStatus(config);
}

async function stopOllamaService() {
  const brewPath = await findCommand('brew');
  if (!brewPath) return;

  try {
    await execFileAsync(brewPath, ['services', 'stop', 'ollama'], { timeout: 30000 });
  } catch (error) {
    // Ignore stop failures so uninstall can still proceed.
  }
}

async function uninstallOllama() {
  const brewPath = await findCommand('brew');
  if (!brewPath) {
    throw new Error('Homebrew is not available. Uninstall Ollama manually from your system.');
  }

  await stopOllamaService();

  try {
    await execFileAsync(brewPath, ['uninstall', 'ollama'], { timeout: 1000 * 60 * 10 });
  } catch (error) {
    if (!/No such keg|No available formula/i.test(error.stderr || error.message || '')) {
      throw error;
    }
  }
}

async function installOllamaModel(config, modelName) {
  const trimmed = (modelName || '').trim();
  if (!trimmed) {
    throw new Error('Model name required.');
  }

  await ensureOllamaReady(config);
  const existingModels = await getOllamaModels(config);
  if (existingModels.some((model) => model.id === trimmed)) {
    return existingModels;
  }

  await execFileAsync('ollama', ['pull', trimmed], { timeout: 1000 * 60 * 60 });
  return getOllamaModels(config);
}

async function removeOllamaModel(config, modelName) {
  const trimmed = (modelName || '').trim();
  if (!trimmed) {
    throw new Error('Model name required.');
  }

  const binaryPath = await findCommand('ollama');
  if (!binaryPath) {
    throw new Error('Ollama is not installed.');
  }

  await execFileAsync(binaryPath, ['rm', trimmed], { timeout: 1000 * 60 * 10 });
  return getOllamaModels(config);
}

async function installFreeBirdBundle(config, modelName) {
  const normalized = normalizeModelConfig(config);
  const targetModel = (modelName || normalized.model || DEFAULT_MODEL_CONFIG.model).trim();

  await installOllama(normalized);
  const models = await installOllamaModel({ ...normalized, model: targetModel }, targetModel);
  const status = await getOllamaStatus({ ...normalized, model: targetModel });

  return {
    status,
    models,
    model: targetModel,
    message: `1-click install completed with ${targetModel}.`
  };
}

async function uninstallFreeBirdBundle(config, modelName) {
  const normalized = normalizeModelConfig(config);
  const targetModel = (modelName || normalized.model || '').trim();
  const binaryPath = await findCommand('ollama');
  let modelsBefore = [];
  let modelsAfter = [];
  let removedModel = false;

  if (!binaryPath) {
    return {
      status: await getOllamaStatus(normalized),
      models: [],
      model: targetModel || null,
      message: 'FREE BIRD runtime is already absent.'
    };
  }

  try {
    modelsBefore = await getOllamaModels(normalized);
  } catch (error) {
    modelsBefore = [];
  }

  if (targetModel && modelsBefore.some((model) => model.id === targetModel)) {
    await execFileAsync(binaryPath, ['rm', targetModel], { timeout: 1000 * 60 * 10 });
    removedModel = true;
  }

  try {
    modelsAfter = await getOllamaModels(normalized);
  } catch (error) {
    modelsAfter = [];
  }

  return {
    status: await getOllamaStatus(normalized),
    models: modelsAfter,
    model: targetModel || null,
    message: removedModel
      ? `1-click uninstall removed ${targetModel}. Ollama stays installed for fast reinstall.`
      : 'No installed model was removed. Ollama stays installed.'
  };
}

async function generateWithOllama(config, prompt, options = {}) {
  const normalized = normalizeModelConfig(config);
  await ensureOllamaReady(normalized);

  const payload = {
    model: normalized.model,
    prompt,
    stream: false
  };

  if (options.systemPrompt) {
    payload.system = options.systemPrompt;
  }

  const response = await fetchJson(`${normalized.baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }, 1000 * 60 * 10);

  return response.response || '';
}

async function getOpenAICompatibleModels(config) {
  const normalized = normalizeModelConfig(config);
  const headers = {};

  if (normalized.apiKey) {
    headers.Authorization = `Bearer ${normalized.apiKey}`;
  }

  const payload = await fetchJson(`${normalized.baseUrl}/models`, { headers }, 5000);
  return (payload.data || []).map((model) => ({
    id: model.id,
    title: model.id,
    description: 'Detected from OpenAI-compatible /models endpoint.'
  }));
}

async function getOpenAICompatibleStatus(config) {
  const normalized = normalizeModelConfig(config);

  try {
    const models = await getOpenAICompatibleModels(normalized);
    return mapStatus(
      'ready',
      'FREE BIRD: Endpoint ready',
      models.length
        ? `${models.length} model(s) exposed by the endpoint.`
        : 'Endpoint is reachable, but it returned no models.',
      { installed: true, reachable: true, models }
    );
  } catch (error) {
    return mapStatus(
      'warning',
      'FREE BIRD: Endpoint unreachable',
      error.message,
      { installed: false, reachable: false, models: getSuggestedModels('openai-compatible') }
    );
  }
}

function extractOpenAICompatibleText(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  const content = choice && choice.message ? choice.message.content : '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

async function generateWithOpenAICompatible(config, prompt, options = {}) {
  const normalized = normalizeModelConfig(config);
  const headers = {
    'Content-Type': 'application/json'
  };

  if (normalized.apiKey) {
    headers.Authorization = `Bearer ${normalized.apiKey}`;
  }

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const payload = await fetchJson(`${normalized.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: normalized.model,
      messages,
      temperature: 0.2
    })
  }, 1000 * 60 * 5);

  return extractOpenAICompatibleText(payload);
}

async function getGoogleStatus(config) {
  const normalized = normalizeModelConfig(config);

  if (normalized.accessToken) {
    return mapStatus(
      'ready',
      'Google Cloud connected',
      'OAuth tokens are available locally. Cloud model execution can be wired next.',
      { installed: true, reachable: true, models: getSuggestedModels('google') }
    );
  }

  if (normalized.oauthClientId && normalized.oauthClientSecret) {
    return mapStatus(
      'warning',
      'Google Cloud configured',
      'Client ID and Secret are saved, but the session is not authenticated yet.',
      { installed: true, reachable: false, models: getSuggestedModels('google') }
    );
  }

  return mapStatus(
    'warning',
    'Google Cloud disconnected',
    'Add Client ID and Client Secret if you want to keep a cloud provider available.',
    { installed: false, reachable: false, models: getSuggestedModels('google') }
  );
}

async function getProviderStatus(config) {
  const normalized = normalizeModelConfig(config);

  switch (normalized.provider) {
    case 'ollama':
      return getOllamaStatus(normalized);
    case 'openai-compatible':
      return getOpenAICompatibleStatus(normalized);
    case 'google':
    default:
      return getGoogleStatus(normalized);
  }
}

async function listProviderModels(config) {
  const normalized = normalizeModelConfig(config);

  switch (normalized.provider) {
    case 'ollama':
      return getOllamaModels(normalized);
    case 'openai-compatible':
      return getOpenAICompatibleModels(normalized);
    case 'google':
    default:
      return getSuggestedModels('google');
  }
}

async function installProviderRuntime(config) {
  const normalized = normalizeModelConfig(config);

  if (normalized.provider !== 'ollama') {
    throw new Error('Runtime installation is only available for Ollama-backed FREE BIRD mode.');
  }

  return installOllama(normalized);
}

async function installProviderModel(config, modelName) {
  const normalized = normalizeModelConfig(config);

  if (normalized.provider !== 'ollama') {
    throw new Error('Model installation is only supported for Ollama providers.');
  }

  return installOllamaModel(normalized, modelName);
}

async function removeProviderModel(config, modelName) {
  const normalized = normalizeModelConfig(config);

  if (normalized.provider !== 'ollama') {
    throw new Error('Model removal is only supported for Ollama providers.');
  }

  return removeOllamaModel(normalized, modelName);
}

async function installFreeBird(config, modelName) {
  const normalized = normalizeModelConfig(config);

  if (normalized.provider !== 'ollama') {
    throw new Error('One-click FREE BIRD install is currently available for Ollama providers only.');
  }

  return installFreeBirdBundle(normalized, modelName);
}

async function uninstallFreeBird(config, modelName) {
  const normalized = normalizeModelConfig(config);

  if (normalized.provider !== 'ollama') {
    throw new Error('One-click FREE BIRD uninstall is currently available for Ollama providers only.');
  }

  return uninstallFreeBirdBundle(normalized, modelName);
}

async function generateText(config, prompt, options = {}) {
  const normalized = normalizeModelConfig(config);

  switch (normalized.provider) {
    case 'ollama':
      return generateWithOllama(normalized, prompt, options);
    case 'openai-compatible':
      return generateWithOpenAICompatible(normalized, prompt, options);
    case 'google':
    default:
      throw new Error('Google Cloud generation is not wired yet. Switch to FREE BIRD to run local or self-hosted models now.');
  }
}

module.exports = {
  DEFAULT_MODEL_CONFIG,
  MODEL_LIBRARY,
  defaultModelForProvider,
  normalizeModelConfig,
  getSuggestedModels,
  getProviderStatus,
  listProviderModels,
  installProviderRuntime,
  installProviderModel,
  removeProviderModel,
  installFreeBird,
  uninstallFreeBird,
  generateText
};
