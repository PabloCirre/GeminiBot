const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// UI Elements
const settingsToggle = document.getElementById('settings-toggle');
const agentsToggle = document.getElementById('agents-toggle');
const closeAppBtn = document.getElementById('close-app');

const settingsPanel = document.getElementById('settings-panel');
const agentsPanel = document.getElementById('agents-panel');
const saveSettingsBtn = document.getElementById('save-settings');

// Auth & Models
const clientIdInput = document.getElementById('client-id');
const clientSecretInput = document.getElementById('client-secret');
const oauthLoginBtn = document.getElementById('oauth-login');
const authStatus = document.getElementById('auth-status');
const projectSelect = document.getElementById('project-select');
const modelSelect = document.getElementById('model-select');
const systemPromptInput = document.getElementById('system-prompt');
const selectFolderBtn = document.getElementById('select-folder-btn');
const selectedFolderDisplay = document.getElementById('selected-folder-display');

// Custom Model Selector
const customModelSelector = document.getElementById('custom-model-selector');
const modelDropdown = document.getElementById('model-dropdown');
const selectedModelText = document.getElementById('selected-model-text');

// Chat UI
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

// Agents UI
const agentsList = document.getElementById('agents-list');
const agentNameInput = document.getElementById('agent-name');
const agentCronSelect = document.getElementById('agent-cron');
const agentFolderBtn = document.getElementById('agent-folder-btn');
const agentFolderDisplay = document.getElementById('agent-folder-display');
const agentFolderPathHidden = document.getElementById('agent-folder-path');
const agentPromptInput = document.getElementById('agent-prompt');
const addAgentBtn = document.getElementById('add-agent-btn');
const editingAgentIdInput = document.getElementById('editing-agent-id');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Global State
let accessToken = null;
let chatHistory = [];
let localContextPath = null;
let savedAgents = [];
let activeCronJobs = {}; // maps agent id to cron task

// Cron Mapping Dict
const CRON_LABELS = {
    '* * * * *': 'Cada Minuto (Test)',
    '0 * * * *': 'Cada Hora',
    '0 9 * * *': 'Cada Día (9:00 AM)',
    '0 3 * * *': 'Cada Noche (3:00 AM)'
};

// 1. Initialization
let loadSettings = () => {
    // Auth
    clientIdInput.value = localStorage.getItem('oauth_client_id') || '';
    clientSecretInput.value = localStorage.getItem('oauth_client_secret') || '';
    projectSelect.value = localStorage.getItem('gemini_project') || 'none';
    systemPromptInput.value = localStorage.getItem('gemini_system') || '';
    
    // Context
    localContextPath = localStorage.getItem('local_context_path') || null;
    if (localContextPath) {
        selectedFolderDisplay.innerText = "Context: " + localContextPath;
    }
    
    // Auth Refresh
    const savedModel = localStorage.getItem('gemini_model');
    const refreshToken = localStorage.getItem('oauth_refresh_token');
    
    if (refreshToken && clientIdInput.value && clientSecretInput.value) {
        authStatus.innerText = "Refreshing token...";
        ipcRenderer.invoke('oauth-refresh', clientIdInput.value, clientSecretInput.value, refreshToken)
            .then(res => {
                if (res.success) {
                    accessToken = res.tokens.access_token;
                    authStatus.innerText = "Authenticated ✓";
                    authStatus.style.color = "#4caf50";
                    fetchModels(savedModel);
                } else {
                    authStatus.innerText = "Session expired. Please login again.";
                    authStatus.style.color = "#ff5252";
                }
            });
    }

    // Load Agents
    try {
        savedAgents = JSON.parse(localStorage.getItem('antigravity_agents') || '[]');
    } catch(e) { savedAgents = []; }
    renderAgents();
    scheduleAllAgents();
};

loadSettings();

// 2. Global Event Listeners
settingsToggle.addEventListener('click', () => {
    agentsPanel.classList.remove('active');
    settingsPanel.classList.toggle('active');
});
agentsToggle.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
    agentsPanel.classList.toggle('active');
});
closeAppBtn.addEventListener('click', () => ipcRenderer.send('quit-app'));

// Folder Selections
selectFolderBtn.addEventListener('click', async () => {
    const folderPath = await ipcRenderer.invoke('open-directory-dialog');
    if (folderPath) {
        localContextPath = folderPath;
        localStorage.setItem('local_context_path', folderPath);
        selectedFolderDisplay.innerText = "Context: " + folderPath;
    }
});

agentFolderBtn.addEventListener('click', async () => {
    const folderPath = await ipcRenderer.invoke('open-directory-dialog');
    if (folderPath) {
        agentFolderPathHidden.value = folderPath;
        const shortPath = folderPath.length > 30 ? '...' + folderPath.slice(-27) : folderPath;
        agentFolderDisplay.innerText = "Target: " + shortPath;
    }
});

// Custom Model UI Logic
customModelSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    customModelSelector.classList.toggle('open');
    modelDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => {
    customModelSelector.classList.remove('open');
    modelDropdown.classList.add('hidden');
});

// 3. Dynamic Models Fetching
async function fetchModels(savedModelName) {
    if (!accessToken) return;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error("Failed to load models");
        
        const data = await response.json();
        modelDropdown.innerHTML = '';
        
        let hasSavedModel = false;
        let proModelFallback = null;
        let firstModelFallback = null;
        
        data.models.forEach(m => {
            if (!m.supportedGenerationMethods.includes("generateContent")) return;
            const cleanName = m.name.replace('models/', '');
            if (!firstModelFallback) firstModelFallback = cleanName;
            
            const card = document.createElement('div');
            card.className = 'model-card';
            
            let displayName = m.displayName || cleanName;
            let icon = '';
            let desc = 'Modelo de propósito general.';

            if (cleanName.includes('pro')) {
                card.classList.add('pro-model');
                icon = '✨';
                desc = 'Razonamiento complejo. Ideal para leer múltiples archivos de código.';
                if (!proModelFallback) proModelFallback = cleanName;
            } else if (cleanName.includes('flash')) {
                card.classList.add('flash-model');
                icon = '⚡';
                desc = 'Respuestas a la velocidad de la luz para consultas rápidas.';
            }

            card.innerHTML = `
                <div class="model-card-title">${icon} ${displayName}</div>
                <div class="model-card-desc">${desc}</div>
            `;
            
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                modelSelect.value = cleanName;
                selectedModelText.innerText = `${icon} ${displayName}`;
                customModelSelector.classList.remove('open');
                modelDropdown.classList.add('hidden');
                localStorage.setItem('gemini_model', cleanName);
            });
            
            if (cleanName === savedModelName) {
                hasSavedModel = true;
                selectedModelText.innerText = `${icon} ${displayName}`;
            }
            modelDropdown.appendChild(card);
        });

        if (hasSavedModel) {
            modelSelect.value = savedModelName;
        } else if (proModelFallback || firstModelFallback) {
            const fallback = proModelFallback || firstModelFallback;
            modelSelect.value = fallback;
            selectedModelText.innerText = fallback;
        }
    } catch (err) {
        console.error("Models fetch error:", err);
        selectedModelText.innerText = 'Error loading models';
    }
}

// Auth Login
oauthLoginBtn.addEventListener('click', async () => {
    const id = clientIdInput.value.trim();
    const secret = clientSecretInput.value.trim();
    if (!id || !secret) { alert("Please enter Client ID and Client Secret first."); return; }
    
    localStorage.setItem('oauth_client_id', id);
    localStorage.setItem('oauth_client_secret', secret);
    oauthLoginBtn.innerText = "Logging in...";
    authStatus.innerText = "Waiting for browser...";
    
    const res = await ipcRenderer.invoke('oauth-login', id, secret);
    if (res.success) {
        accessToken = res.tokens.access_token;
        if (res.tokens.refresh_token) localStorage.setItem('oauth_refresh_token', res.tokens.refresh_token);
        authStatus.innerText = "Authenticated ✓";
        authStatus.style.color = "#4caf50";
        fetchModels();
    } else {
        authStatus.innerText = "Login failed: " + res.error;
        authStatus.style.color = "#ff5252";
    }
    oauthLoginBtn.innerText = "Login with Google";
});

saveSettingsBtn.addEventListener('click', () => {
    localStorage.setItem('gemini_project', projectSelect.value);
    if (modelSelect.value) localStorage.setItem('gemini_model', modelSelect.value);
    localStorage.setItem('gemini_system', systemPromptInput.value.trim());
    settingsPanel.classList.remove('active');
});

// 4. File Reading Logic (Re-usable)
function readContextFolder(dirPath, allowedExtensions = ['.js', '.py', '.php', '.html', '.css', '.md', '.json', '.txt']) {
    let result = '';
    const ignoreDirs = ['node_modules', '.git', 'vendor', '__pycache__', 'dist', 'build', 'artifacts'];
    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (!ignoreDirs.includes(file)) {
                    result += readContextFolder(fullPath, allowedExtensions);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(file).toLowerCase();
                if (allowedExtensions.includes(ext) || file.startsWith('.')) {
                    if (stat.size < 1000 * 1024) {  // < 1MB limit per file
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            result += `\n--- File: ${fullPath} ---\n${content}\n`;
                        } catch (e) { console.warn("Could not read", fullPath); }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error reading directory", dirPath, e);
    }
    return result;
}

// 5. Chat Engine
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', () => { sendMessage(); });

function appendMessage(role, text) {
    if (document.getElementById('welcome-message')) document.getElementById('welcome-message').remove();
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    let formattedText = text.replace(/```([\s\S]*?)```/gs, '<pre><code>$1</code></pre>');
    formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    formattedText = formattedText.replace(/\n\n/g, '<br><br>');
    msgDiv.innerHTML = role === 'bot' ? formattedText : text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (!accessToken) { alert("Please Login with Google first."); return; }

    appendMessage('user', text);
    chatHistory.push({ role: 'user', parts: [{ text: text }] });
    chatInput.value = '';
    chatInput.style.height = '20px';

    const selectedModel = modelSelect.value || 'gemini-1.5-pro';
    let sysPrompt = systemPromptInput.value.trim();
    
    appendMessage('bot', `<i style="color: grey;" id="loading-msg">Connecting to Gemini...</i>`);
    
    if (localContextPath) {
        document.getElementById('loading-msg').innerText = "Reading local files context...";
        const fileData = readContextFolder(localContextPath);
        if (fileData) {
            sysPrompt += "\n\n# LOCAL PROJECT CONTEXT:\n" + fileData;
        }
        document.getElementById('loading-msg').innerText = "Thinking...";
    }

    try {
        const payload = {
            contents: chatHistory,
            systemInstruction: sysPrompt ? { parts: [{ text: sysPrompt }] } : undefined
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify(payload)
        });

        const loadingE = document.getElementById('loading-msg');
        if (loadingE) loadingE.parentElement.remove();

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[No response]";
        
        appendMessage('bot', botText);
        chatHistory.push({ role: 'model', parts: [{ text: botText }] });
    } catch (error) {
        console.error(error);
        const loadingE = document.getElementById('loading-msg');
        if (loadingE) loadingE.parentElement.remove();
        appendMessage('bot', `**Error**: \n\`\`\`\n${error.message}\n\`\`\``);
    }
}

// 6. Agents (Cron) Subsystem
function resetAgentForm() {
    agentNameInput.value = '';
    agentPromptInput.value = '';
    agentFolderPathHidden.value = '';
    agentFolderDisplay.innerText = '';
    editingAgentIdInput.value = '';
    addAgentBtn.innerText = '➕ Create Agent';
    cancelEditBtn.style.display = 'none';
}

cancelEditBtn.addEventListener('click', resetAgentForm);

addAgentBtn.addEventListener('click', () => {
    const name = agentNameInput.value.trim();
    const cronExp = agentCronSelect.value;
    const folder = agentFolderPathHidden.value;
    const prompt = agentPromptInput.value.trim();
    const editingId = editingAgentIdInput.value;

    if (!name || !folder || !prompt) {
        alert("Name, Folder and Prompt are required to save an agent.");
        return;
    }

    if (editingId) {
        // Update
        const idx = savedAgents.findIndex(a => a.id === editingId);
        if (idx > -1) {
            savedAgents[idx].name = name;
            savedAgents[idx].cron = cronExp;
            savedAgents[idx].folder = folder;
            savedAgents[idx].prompt = prompt;
        }
    } else {
        // Create
        const agent = {
            id: 'agent_' + Date.now(),
            name: name,
            cron: cronExp,
            folder: folder,
            prompt: prompt,
            lastOutput: null
        };
        savedAgents.push(agent);
    }

    localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
    resetAgentForm();
    renderAgents();
    scheduleAllAgents();
});

function renderAgents() {
    agentsList.innerHTML = '';
    if (savedAgents.length === 0) {
        agentsList.innerHTML = '<div style="color: var(--text-secondary); text-align: center; font-size: 12px; padding: 10px;">No active agents.</div>';
        return;
    }
    
    savedAgents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        const friendlyCron = CRON_LABELS[agent.cron] || agent.cron;
        
        let viewOutputHtml = '';
        if (agent.lastOutput) {
            viewOutputHtml = `
            <div class="agent-actions" style="margin-top: 0;">
                <button class="agent-btn view view-btn" data-id="${agent.id}">📄 Ver Resultado</button>
            </div>`;
        }
        
        card.innerHTML = `
            <div class="agent-header">
                <span class="agent-name">🤖 ${agent.name}</span>
                <span class="agent-cron">🕒 ${friendlyCron}</span>
            </div>
            <div class="agent-folder">Context: ...${agent.folder.slice(-25)}</div>
            ${viewOutputHtml}
            <div class="agent-actions">
                <button class="agent-btn run run-btn" data-id="${agent.id}" id="run-btn-${agent.id}">▶️ Ejecutar</button>
                <button class="agent-btn edit edit-btn" data-id="${agent.id}">✏️ Editar</button>
                <button class="agent-btn danger del-btn" data-id="${agent.id}">🗑️ Borrar</button>
            </div>
        `;
        agentsList.appendChild(card);
    });

    // Attach Action Events
    document.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            savedAgents = savedAgents.filter(a => a.id !== id);
            localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
            renderAgents();
            scheduleAllAgents();
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            const agent = savedAgents.find(a => a.id === id);
            if (agent) {
                agentNameInput.value = agent.name;
                agentCronSelect.value = agent.cron;
                agentFolderPathHidden.value = agent.folder;
                agentFolderDisplay.innerText = "Target: ..." + agent.folder.slice(-25);
                agentPromptInput.value = agent.prompt;
                editingAgentIdInput.value = agent.id;
                
                addAgentBtn.innerText = '💾 Update Agent';
                cancelEditBtn.style.display = 'block';
            }
        });
    });

    document.querySelectorAll('.run-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            const agent = savedAgents.find(a => a.id === id);
            if (agent) executeAgentJob(agent);
        });
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            const agent = savedAgents.find(a => a.id === id);
            if (agent && agent.lastOutput) {
                 shell.openPath(agent.lastOutput).then(msg => {
                    if (msg) console.error("Error opening file:", msg);
                 });
            }
        });
    });
}

function scheduleAllAgents() {
    // 1. Destroy existing jobs
    for (const id in activeCronJobs) {
        activeCronJobs[id].stop();
    }
    activeCronJobs = {};

    // 2. Schedule new jobs
    savedAgents.forEach(agent => {
        if (cron.validate(agent.cron)) {
            const task = cron.schedule(agent.cron, () => {
                console.log(`[Agents] Firing scheduled agent: ${agent.name}`);
                executeAgentJob(agent);
            });
            activeCronJobs[agent.id] = task;
        } else {
            console.error(`Invalid cron expression for agent ${agent.name}: ${agent.cron}`);
        }
    });
    console.log(`[Agents] Scheduled ${Object.keys(activeCronJobs).length} active jobs.`);
}

async function executeAgentJob(agent) {
    if (!accessToken) {
        new Notification("Antigravity Agent Failed", { body: `Agent '${agent.name}' failed to run: You are not logged in.`});
        return;
    }

    const runBtn = document.getElementById(`run-btn-${agent.id}`);
    if (runBtn) {
        runBtn.innerHTML = '⏳ Pensando...';
        runBtn.disabled = true;
    }

    console.log(`[Agents] Executing job for ${agent.name} targeting ${agent.folder}`);
    new Notification("Antigravity Agent Running", { body: `Agent '${agent.name}' has woken up and is processing files...`});
    
    try {
        const memoryPath = path.join(agent.folder, `.agent_memory_${agent.id}.txt`);
        let memoryContent = '';
        if (fs.existsSync(memoryPath)) {
            try { memoryContent = fs.readFileSync(memoryPath, 'utf8'); } catch(e){}
        }

        const contextData = readContextFolder(agent.folder);
        let sysPrompt = agent.prompt;
        
        if (memoryContent) {
            sysPrompt += "\n\n# TU MEMORIA DE LA SESIÓN ANTERIOR (RETOMA DESDE AQUÍ):\n" + memoryContent;
        }

        if (contextData) {
            sysPrompt += "\n\n# TARGET PROJECT FILES FOR YOU TO ANALYZE:\n" + contextData;
        }

        // Strict Memory Constraint
        sysPrompt += "\n\n# INSTRUCCIÓN OBLIGATORIA DE MEMORIA:\nAl final de tu respuesta, DEBES incluir un bloque envolviendo tu progreso para tu yo del futuro, usando exactamente estas etiquetas HTML:\n<AGENT_MEMORY>\n(Escribe aquí tu estado, qué has hecho y qué debes hacer la próxima vez que te despiertes)\n</AGENT_MEMORY>\nEsto es vital para mantener tu continuidad.";

        const payload = {
            contents: [{ role: 'user', parts: [{ text: "Despierta. Revisa tus instrucciones de sistema, tu memoria y el código local, y cumple con tu tarea." }] }],
            systemInstruction: { parts: [{ text: sysPrompt }] }
        };

        const currentModel = localStorage.getItem('gemini_model') || 'gemini-1.5-pro';

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (outputText) {
            let cleanOutput = outputText;
            const memoryMatch = outputText.match(/<AGENT_MEMORY>([\s\S]*?)<\/AGENT_MEMORY>/i);
            
            if (memoryMatch && memoryMatch[1]) {
                fs.writeFileSync(memoryPath, memoryMatch[1].trim());
                cleanOutput = outputText.replace(/<AGENT_MEMORY>[\s\S]*?<\/AGENT_MEMORY>/i, '').trim();
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `AgentReport_${agent.name.replace(/\s+/g, '_')}_${timestamp}.md`;
            const outPath = path.join(agent.folder, fileName);
            fs.writeFileSync(outPath, `# 🤖 Agent Report: ${agent.name}\n**Time:** ${new Date().toLocaleString()}\n**Instruction:** ${agent.prompt}\n\n---\n\n${cleanOutput}`);
            
            // Save state
            agent.lastOutput = outPath;
            localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
            renderAgents();
            
            new Notification("Antigravity Agent Completed", { body: `Report: ${fileName} ${memoryMatch ? '(Memory Updated)' : ''}`});
        }
    } catch (error) {
        console.error(`Agent ${agent.name} Error:`, error);
        new Notification(`Antigravity Agent Error`, { body: `Agent '${agent.name}' encountered an error: ${error.message}`});
        
        if (runBtn) {
            runBtn.innerHTML = '▶️ Ejecutar';
            runBtn.disabled = false;
        }
    }
}
