/**
 * PIBOT Agent Handler (CLI Engine)
 * Executes local diagnostics and, when configured, delegates reasoning to the active model provider.
 */
const fs = require('fs');
const path = require('path');

const { normalizeModelConfig, generateText } = require('./model_runtime');

const TEXT_EXTENSIONS = new Set([
  '.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.txt', '.html', '.css', '.scss',
  '.yml', '.yaml', '.py', '.rb', '.php', '.go', '.rs', '.java', '.c', '.cpp',
  '.cs', '.sh', '.toml', '.env'
]);

function safeParseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function isProbablyTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return path.basename(filePath).toLowerCase().startsWith('readme');
}

function walkFiles(rootPath, maxDepth = 2, maxFiles = 40) {
  const queue = [{ dir: rootPath, depth: 0 }];
  const files = [];

  while (queue.length && files.length < maxFiles) {
    const current = queue.shift();
    let entries = [];

    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const absolute = path.join(current.dir, entry.name);

      if (entry.isDirectory()) {
        if (current.depth < maxDepth && !entry.name.startsWith('.git')) {
          queue.push({ dir: absolute, depth: current.depth + 1 });
        }
        continue;
      }

      files.push(absolute);
    }
  }

  return files;
}

function readTextPreview(filePath, maxChars = 1200) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.slice(0, maxChars).trim();
  } catch (error) {
    return '';
  }
}

function collectProjectContext(targetPath) {
  const files = walkFiles(targetPath, 2, 50);
  const relativeFiles = files.map((filePath) => path.relative(targetPath, filePath));

  const previewFiles = files
    .filter(isProbablyTextFile)
    .sort((a, b) => {
      const aName = path.basename(a).toLowerCase();
      const bName = path.basename(b).toLowerCase();
      const score = (name) => {
        if (name === 'package.json') return 0;
        if (name.startsWith('readme')) return 1;
        if (name === 'requirements.txt') return 2;
        if (name === 'pyproject.toml') return 3;
        if (name === 'go.mod') return 4;
        if (name === 'cargo.toml') return 5;
        return 10;
      };
      return score(aName) - score(bName);
    })
    .slice(0, 5);

  const previews = previewFiles.map((filePath) => ({
    file: path.relative(targetPath, filePath),
    content: readTextPreview(filePath)
  })).filter((preview) => preview.content);

  return {
    files: relativeFiles,
    previews
  };
}

function buildPrompt({ targetPath, prompt, context, heuristics }) {
  const previewBlock = context.previews.length
    ? context.previews.map((preview) => [
        `FILE: ${preview.file}`,
        '```',
        preview.content,
        '```'
      ].join('\n')).join('\n\n')
    : 'No text previews collected.';

  return [
    'You are PIBOT running inside the user\'s local workspace.',
    'Be concrete, useful, and concise.',
    'If you propose actions, keep them safe and explain why.',
    '',
    `TARGET DIRECTORY: ${targetPath}`,
    `USER TASK: ${prompt || 'Inspect the project and report status.'}`,
    '',
    'LOCAL HEURISTICS:',
    heuristics.map((item) => `- ${item}`).join('\n'),
    '',
    'DISCOVERED FILES:',
    context.files.slice(0, 40).map((file) => `- ${file}`).join('\n') || '- No files discovered.',
    '',
    'FILE PREVIEWS:',
    previewBlock,
    '',
    'Return:',
    '1. A short summary of what this agent is looking at.',
    '2. The most important findings.',
    '3. One or two next steps.',
    '4. If relevant, a safe shell command suggestion in plain text.'
  ].join('\n');
}

async function runTask(agentId, targetPath, prompt) {
  const modelConfig = normalizeModelConfig(safeParseJson(process.env.PIBOT_MODEL_CONFIG || '{}'));
  const systemPrompt = process.env.PIBOT_SYSTEM_PROMPT || modelConfig.systemPrompt || '';
  const report = {
    agentId,
    timestamp: new Date().toISOString(),
    target: targetPath,
    status: 'SUCCESS',
    mode: modelConfig.mode,
    provider: modelConfig.provider,
    model: modelConfig.model,
    findings: []
  };

  try {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Target path does not exist: ${targetPath}`);
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`Target is not a directory: ${targetPath}`);
    }

    const files = fs.readdirSync(targetPath);
    report.findings.push(`Analyzed ${files.length} items in directory.`);

    if (files.includes('.git')) report.findings.push('Git repository detected.');
    if (files.includes('package.json')) report.findings.push('Node.js project structure found.');
    if (files.includes('requirements.txt')) report.findings.push('Python environment markers present.');
    if (files.includes('README.md') || files.includes('readme.md')) report.findings.push('README detected at project root.');

    const largeFiles = files.map((fileName) => {
      const absolute = path.join(targetPath, fileName);
      try {
        const fileStats = fs.statSync(absolute);
        return fileStats.isFile() && fileStats.size > 1024 * 1024 ? fileName : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    if (largeFiles.length > 0) {
      report.findings.push(`Identified ${largeFiles.length} large assets (>1MB).`);
    }

    const context = collectProjectContext(targetPath);
    report.findings.push(`Collected ${context.files.length} file paths for context.`);

    if (modelConfig.provider === 'ollama' || modelConfig.provider === 'openai-compatible') {
      const runtimePrompt = buildPrompt({
        targetPath,
        prompt,
        context,
        heuristics: report.findings
      });

      const analysis = await generateText(modelConfig, runtimePrompt, { systemPrompt });
      report.analysis = analysis || 'Model returned an empty response.';
    } else {
      report.status = 'PARTIAL';
      report.error = 'No live FREE BIRD provider is selected. Using local diagnostics only.';
    }

    return report;
  } catch (error) {
    return {
      ...report,
      status: report.findings.length ? 'PARTIAL' : 'FAILED',
      error: error.message
    };
  }
}

const [, , agentId, targetPath, prompt] = process.argv;
if (agentId && targetPath) {
  runTask(agentId, targetPath, prompt).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  });
}
