#!/usr/bin/env node
/**
 * PIBOT Unified CLI Engine
 * Absolute Control via Terminal.
 */

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../../');
const AGENTS_DIR = path.join(ROOT_DIR, 'agents');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'developer/scripts');
const HANDLER_PATH = path.join(ROOT_DIR, 'developer/src/agent_handler.js');

// --- ANSI Colors ---
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    pink: "\x1b[35m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    dim: "\x1b[2m"
};

const log = (msg) => console.log(`${C.cyan}[PIBOT]${C.reset} ${msg}`);
const error = (msg) => console.error(`${C.red}[ERROR]${C.reset} ${msg}`);
const banner = () => {
    console.log(`\n${C.bright}${C.cyan}🤖 PIBOT CLI v1.1${C.reset}`);
    console.log(`${C.dim}Absolute Autonomous Control${C.reset}\n`);
};

// --- Commands ---

function showHelp() {
    banner();
    console.log(`${C.bright}Usage:${C.reset} pibot <command> [options]`);
    console.log(`\n${C.bright}Commands:${C.reset}`);
    console.log(`  ${C.yellow}status${C.reset}           Check system health and API connectivity`);
    console.log(`  ${C.yellow}agents list${C.reset}      List all available agents`);
    console.log(`  ${C.yellow}agents wake <id>${C.reset} Manually trigger an agent`);
    console.log(`  ${C.yellow}agents new <id>${C.reset}  Create a new agent folder and config`);
    console.log(`  ${C.yellow}build${C.reset}            Package the application`);
    console.log(`  ${C.yellow}doctor${C.reset}           Run diagnostic validation scripts`);
    console.log(`\n${C.bright}Global Flags:${C.reset}`);
    console.log(`  --help           Show this screen`);
}

async function runStatus() {
    banner();
    log("Checking Diagnostics...");
    try {
        const verify = execSync(`bash ${path.join(SCRIPTS_DIR, 'verify_bot.sh')}`).toString();
        console.log(verify);
    } catch (e) {
        error("Diagnostics failed.");
    }
}

function listAgents() {
    if (!fs.existsSync(AGENTS_DIR)) return error("Agents directory not found.");
    const agents = fs.readdirSync(AGENTS_DIR).filter(f => fs.lstatSync(path.join(AGENTS_DIR, f)).isDirectory());
    
    log(`${C.bright}Stored Agents:${C.reset}`);
    agents.forEach(a => {
        const configPath = path.join(AGENTS_DIR, a, 'agent.json');
        let meta = { name: a, group: 'General' };
        if (fs.existsSync(configPath)) {
            try { meta = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
        }
        console.log(`  ${C.green}•${C.reset} ${C.bright}${meta.name || a}${C.reset} [${C.dim}${meta.group}${C.reset}]`);
    });
}

function wakeAgent(agentId) {
    const agentFolder = path.join(AGENTS_DIR, agentId);
    if (!fs.existsSync(agentFolder)) return error(`Agent folder not found: ${agentId}`);
    
    const configPath = path.join(agentFolder, 'agent.json');
    let prompt = "Analyze files and report status.";
    if (fs.existsSync(configPath)) {
        try { prompt = JSON.parse(fs.readFileSync(configPath, 'utf8')).prompt; } catch(e) {}
    }

    log(`Waking ${C.pink}${agentId}${C.reset}...`);
    exec(`node "${HANDLER_PATH}" "${agentId}" "${agentFolder}" "${prompt}"`, (err, stdout, stderr) => {
        if (err) return error(stderr || err.message);
        try {
            const res = JSON.parse(stdout);
            console.log(`\n${C.bright}━━━━ FEEDBACK REPORT ━━━━${C.reset}`);
            console.log(`${C.cyan}STATUS:${C.reset} ${res.status}`);
            console.log(`${C.cyan}TARGET:${C.reset} ${res.target}`);
            console.log(`${C.cyan}FINDINGS:${C.reset}`);
            res.findings.forEach(f => console.log(`  - ${f}`));
            console.log(`${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);
        } catch (e) {
            console.log(stdout);
        }
    });
}

function newAgent(id) {
    const folderPath = path.join(AGENTS_DIR, id);
    if (fs.existsSync(folderPath)) return error(`Agent "${id}" already exists.`);
    
    log(`Deploying agent: ${C.bright}${id}${C.reset}`);
    fs.mkdirSync(folderPath, { recursive: true });
    const config = {
        name: id.replace(/_/g, ' '),
        group: "CLI Created",
        cron: "0 * * * *",
        prompt: "Perform autonomous task audit.",
        active: true
    };
    fs.writeFileSync(path.join(folderPath, 'agent.json'), JSON.stringify(config, null, 2));
    log(`${C.green}SUCCESS:${C.reset} Agent folder and agent.json created.`);
}

function runDoctor() {
    log("Running FULL PROJECT AUDIT...");
    try {
        const res = execSync(`cd ${ROOT_DIR}/developer && bash scripts/validate_project.sh`, { stdio: 'inherit' });
    } catch (e) {}
}

function runBuild() {
    log(`${C.pink}Initiating Build Process...${C.reset}`);
    try {
        execSync(`cd ${ROOT_DIR}/developer && npm run build:mac`, { stdio: 'inherit' });
    } catch (e) {
        error("Build failed.");
    }
}

// --- Main Router ---

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '--help') {
    showHelp();
} else {
    switch (cmd) {
        case 'status':
            runStatus();
            break;
        case 'agents':
            const sub = args[1];
            const target = args[2];
            if (sub === 'list') listAgents();
            else if (sub === 'wake') target ? wakeAgent(target) : error("Agent ID required: pibot agents wake <id>");
            else if (sub === 'new') target ? newAgent(target) : error("Agent ID required: pibot agents new <id>");
            else error("Unknown agents command. Use 'list', 'wake' or 'new'.");
            break;
        case 'doctor':
            runDoctor();
            break;
        case 'build':
            runBuild();
            break;
        default:
            error(`Unknown command: ${cmd}`);
            showHelp();
    }
}
