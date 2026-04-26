/**
 * Configuration manager
 * Stores config in ~/.videocut/config.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.videocut');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default configuration
const defaults = {
  asr: {
    provider: 'volcengine',
    cloud: {
      baseURL: '',
      apiKey: '',
      apiKeyHeader: 'Authorization',
      language: 'zh-CN',
      submitPath: '/submit',
      queryPath: '/query',
      submitMethod: 'POST',
      queryMethod: 'GET',
      extraQuery: {},
      extraHeaders: {},
      pollInterval: 5000,
      maxAttempts: 120,
      successCode: 0,
      pendingCode: null,
      taskIdPath: 'id',
      resultPath: 'utterances',
      wordsPath: 'words',
      textField: 'text',
      startField: 'start_time',
      endField: 'end_time',
      timeUnit: 1000,
      uploadService: 'uguu',
    },
    volcengine: {
      apiKey: '',
      language: 'zh-CN',
      useItn: true,
      useCapitalize: true,
    },
    whisper: {
      model: 'large-v3',
      localPath: '',
    },
  },
  cut: {
    silenceThreshold: 0.3,
    repeatPrefixLength: 5,
    reviewMode: 'web',
  },
  output: {
    defaultDir: './output',
  },
  server: {
    port: 8899,
  },
};

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...defaults };
  }
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

function save(cfg) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function get(keyPath) {
  const cfg = load();
  const parts = keyPath.split('.');
  let val = cfg;
  for (const p of parts) {
    if (val === undefined || val === null) return undefined;
    val = val[p];
  }
  return val;
}

function set(keyPath, value) {
  const cfg = load();
  const parts = keyPath.split('.');
  let target = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in target) || typeof target[p] !== 'object') {
      target[p] = {};
    }
    target = target[p];
  }
  // Try to parse as number/boolean
  const last = parts[parts.length - 1];
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (!isNaN(value) && value !== '') {
    const n = Number(value);
    if (String(n) === value) value = n;
  }
  target[last] = value;
  save(cfg);
}

function list() {
  return JSON.stringify(load(), null, 2);
}

// Migration: load .env file if config is empty
function migrateFromEnv() {
  const cfg = load();
  if (!cfg.asr.volcengine.apiKey) {
    // Search for .env in common locations
    const searchPaths = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '..', '.env'),
      path.join(os.homedir(), '.claude', 'skills', '.env'),
    ];
    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const match = content.match(/VOLCENGINE_API_KEY=([^\s]+)/);
        if (match) {
          set('asr.volcengine.apiKey', match[1]);
          console.log('Migrated API key from:', p);
          return;
        }
      }
    }
  }
}

migrateFromEnv();

module.exports = {
  get,
  set,
  list,
  load,
  save,
  path: CONFIG_FILE,
};
