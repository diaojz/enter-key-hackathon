// coda · LLM 客户端（anthropic / openai，零依赖）
// 由 ~/.coda/settings.json 配置；调用方决定是否回退到规则引擎。
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getLLMConfig } = require('./settings');

const DEFAULT_MODEL = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  moonshot: 'moonshot-v1-8k',
};
const DEFAULT_BASE_URL = {
  openai: 'https://api.openai.com',
  deepseek: 'https://api.deepseek.com',
  moonshot: 'https://api.moonshot.cn',
};
const TIMEOUT_MS = 8000;

function isEnabled() {
  const c = getLLMConfig();
  return c.provider !== 'none' && !!c.apiKey;
}

// 兼容旧调用：refineIssue 在 review 中被使用，保留壳函数（未启用返回 null）
async function refineIssue() { return null; }

function postJSON(urlStr, headers, body, onChunk) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = Buffer.from(JSON.stringify(body));
    const t0 = Date.now();
    const req = lib.request({
      method: 'POST',
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + (u.search || ''),
      headers: { 'Content-Length': payload.length, ...headers },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => {
        chunks.push(c);
        if (onChunk) onChunk(c.toString('utf8'));
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        }
        resolve({ raw, status: res.statusCode, latencyMs: Date.now() - t0 });
      });
    });
    req.on('error', (e) => reject(new Error('network: ' + e.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout after ' + TIMEOUT_MS + 'ms')); });
    req.write(payload);
    req.end();
  });
}

// 解析 SSE：行级解码，回调每个 event 的 data 字段
function parseSSE(raw, onEvent) {
  raw.split(/\r?\n/).forEach((line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try { onEvent(JSON.parse(data)); } catch {}
  });
}

async function callAnthropic({ apiKey, baseURL, model, system, user, maxTokens, onChunk }) {
  // 支持自定义 baseURL，让兼容 Anthropic 协议的网关（如 DeepSeek、第三方代理）也能用
  const base = (baseURL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const url = base + (base.endsWith('/v1') || base.endsWith('/anthropic') ? '/messages' : '/v1/messages');
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'accept': onChunk ? 'text/event-stream' : 'application/json',
  };
  const body = {
    model: model || DEFAULT_MODEL.anthropic,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    stream: !!onChunk,
  };

  let collected = '';
  let tokensIn = 0, tokensOut = 0;
  const innerOnChunk = onChunk ? (txt) => {
    parseSSE(txt, (evt) => {
      if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
        collected += evt.delta.text;
        onChunk(evt.delta.text);
      } else if (evt.type === 'message_delta' && evt.usage) {
        tokensOut = evt.usage.output_tokens || tokensOut;
      } else if (evt.type === 'message_start' && evt.message && evt.message.usage) {
        tokensIn = evt.message.usage.input_tokens || 0;
      }
    });
  } : null;

  const { raw, latencyMs } = await postJSON(url, headers, body, innerOnChunk);
  if (!onChunk) {
    const j = JSON.parse(raw);
    const text = (j.content || []).map((b) => b.text || '').join('');
    return {
      text, model: j.model || body.model, latencyMs,
      tokensIn: j.usage && j.usage.input_tokens || 0,
      tokensOut: j.usage && j.usage.output_tokens || 0,
    };
  }
  return { text: collected, model: body.model, latencyMs, tokensIn, tokensOut };
}

async function callOpenAI({ apiKey, baseURL, model, system, user, maxTokens, onChunk }) {
  const base = (baseURL || 'https://api.openai.com').replace(/\/+$/, '');
  const url = base + '/v1/chat/completions';
  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Accept': onChunk ? 'text/event-stream' : 'application/json',
  };
  const body = {
    model: model || DEFAULT_MODEL.openai,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    stream: !!onChunk,
  };

  let collected = '';
  const innerOnChunk = onChunk ? (txt) => {
    parseSSE(txt, (evt) => {
      const piece = evt.choices && evt.choices[0] && evt.choices[0].delta && evt.choices[0].delta.content;
      if (piece) { collected += piece; onChunk(piece); }
    });
  } : null;

  const { raw, latencyMs } = await postJSON(url, headers, body, innerOnChunk);
  if (!onChunk) {
    const j = JSON.parse(raw);
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    return {
      text, model: j.model || body.model, latencyMs,
      tokensIn: j.usage && j.usage.prompt_tokens || 0,
      tokensOut: j.usage && j.usage.completion_tokens || 0,
    };
  }
  return { text: collected, model: body.model, latencyMs, tokensIn: 0, tokensOut: 0 };
}

async function chatCompletion({ system = '', user, maxTokens = 800, onChunk = null } = {}) {
  if (!user) throw new Error('chatCompletion: user is required');
  const cfg = getLLMConfig();
  if (cfg.provider === 'none' || !cfg.apiKey) throw new Error('LLM not configured');
  if (cfg.provider === 'anthropic') {
    return callAnthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, model: cfg.model, system, user, maxTokens, onChunk });
  }
  if (cfg.provider === 'openai') {
    return callOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL || DEFAULT_BASE_URL.openai, model: cfg.model, system, user, maxTokens, onChunk });
  }
  if (cfg.provider === 'deepseek') {
    // DeepSeek 用 OpenAI 兼容 API
    return callOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL || DEFAULT_BASE_URL.deepseek, model: cfg.model || DEFAULT_MODEL.deepseek, system, user, maxTokens, onChunk });
  }
  if (cfg.provider === 'moonshot') {
    // Kimi 同样是 OpenAI 兼容
    return callOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL || DEFAULT_BASE_URL.moonshot, model: cfg.model || DEFAULT_MODEL.moonshot, system, user, maxTokens, onChunk });
  }
  if (cfg.provider === 'custom') {
    // 兜底：完全用户配置，要求传 baseURL
    if (!cfg.baseURL) throw new Error('custom provider 需要在 settings 里配 baseURL');
    return callOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, model: cfg.model, system, user, maxTokens, onChunk });
  }
  throw new Error('unknown provider: ' + cfg.provider);
}

module.exports = { isEnabled, chatCompletion, refineIssue };

// ── self-test ──────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    if (!isEnabled()) {
      console.log('LLM not configured, set provider+apiKey in ~/.coda/settings.json');
      return;
    }
    const cfg = getLLMConfig();
    console.log('[llm] provider=', cfg.provider, 'model=', cfg.model || DEFAULT_MODEL[cfg.provider]);
    try {
      const r1 = await chatCompletion({ system: 'You reply briefly.', user: 'say hi' });
      console.log('[llm] non-stream:', r1.text, '| model=', r1.model, '| latencyMs=', r1.latencyMs);
    } catch (e) { console.log('[llm] non-stream error:', e.message); }
    try {
      process.stdout.write('[llm] stream: ');
      const r2 = await chatCompletion({
        system: 'You reply briefly.', user: 'say hi again',
        onChunk: (c) => process.stdout.write(c),
      });
      console.log('\n[llm] stream done, latencyMs=', r2.latencyMs);
    } catch (e) { console.log('\n[llm] stream error:', e.message); }
  })();
}
