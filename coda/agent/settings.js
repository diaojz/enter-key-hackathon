// coda · 全局配置读写（~/.coda/settings.json）
// 纯 Node 标准库，零依赖；负责 LLM provider/apiKey 持久化 + 脱敏。
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CODA_DIR = path.join(os.homedir(), '.coda');
const SETTINGS_PATH = path.join(CODA_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  llm: { provider: 'none', apiKey: '', model: '', baseURL: '' },
  workspaces: [],
};

function ensureDir() {
  try { fs.mkdirSync(CODA_DIR, { recursive: true, mode: 0o700 }); } catch {}
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const obj = JSON.parse(raw);
    // 浅合并兜底
    return {
      ...DEFAULT_SETTINGS,
      ...obj,
      llm: { ...DEFAULT_SETTINGS.llm, ...(obj.llm || {}) },
      workspaces: Array.isArray(obj.workspaces) ? obj.workspaces : [],
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

function saveSettings(obj) {
  ensureDir();
  const safe = {
    ...DEFAULT_SETTINGS,
    ...(obj || {}),
    llm: { ...DEFAULT_SETTINGS.llm, ...((obj && obj.llm) || {}) },
    workspaces: Array.isArray(obj && obj.workspaces) ? obj.workspaces : [],
  };
  // 写文件 + 收紧权限（含 apiKey，不让其他用户读）
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(safe, null, 2), { mode: 0o600 });
  try { fs.chmodSync(SETTINGS_PATH, 0o600); } catch {}
  return safe;
}

// "sk-abc...xyz" / 太短直接 "***"
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

function getLLMConfig() {
  const s = loadSettings();
  return {
    provider: s.llm.provider || 'none',
    apiKey: s.llm.apiKey || '',
    model: s.llm.model || '',
    baseURL: s.llm.baseURL || '',
  };
}

module.exports = { loadSettings, saveSettings, maskApiKey, getLLMConfig, SETTINGS_PATH };

// ── self-test ──────────────────────────────────────────────
if (require.main === module) {
  const sample = {
    llm: { provider: 'anthropic', apiKey: 'sk-ant-test-abcdef1234567890', model: 'claude-haiku-4-5-20251001' },
    workspaces: [{ root: '/tmp/demo', label: 'demo' }],
  };
  saveSettings(sample);
  const back = loadSettings();
  console.log('[settings] path:', SETTINGS_PATH);
  console.log('[settings] read:', JSON.stringify({ ...back, llm: { ...back.llm, apiKey: maskApiKey(back.llm.apiKey) } }));
  if (back.llm.apiKey !== sample.llm.apiKey) throw new Error('roundtrip mismatch');
  if (!maskApiKey(sample.llm.apiKey).includes('...')) throw new Error('mask failed');
  if (maskApiKey('').length !== 0) throw new Error('empty key not handled');
  if (maskApiKey('short').length !== 3) throw new Error('short key not masked');
  console.log('[settings] mask demo:', maskApiKey(sample.llm.apiKey));
  console.log('[settings] OK');
}
