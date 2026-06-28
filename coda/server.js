#!/usr/bin/env node
// coda · 评价 Agent HTTP 服务 —— 小哒 Coda 后端
// ───────────────────────────────────────────────────────────────
// 串起 扫盘→画像→评审→复用；供 coda-desktop 的 coda-eval.html 工作台调用。
// 端口：默认 8848（对齐 coda-eval.html 默认端口），可用 CODA_PORT 覆盖。
//
// 端点契约（按 coda-eval.html 实际 fetch 出来的形态对齐）：
//   GET  /                        自身信息（便于健康检查）
//   GET  /persona                 人设摘要（跨项目累积画像）
//   POST /profile/override        手改画像（按 root 持久化）
//   POST /scan                    扫盘 → 画像 + 复用 + 各文件评审
//   GET  /projects                项目地图（用户授权过的项目列表）
//   POST /review                  单文件评审
//   GET  /reuse?root=…            复用命中
//   POST /chat                    自然语言提问（结合项目上下文+画像）
//
// 兼容旧端点（coda/ 自带 web/ 仍可用）：
//   GET  /api/config · /api/analyze?dir=… · /api/scan?dir=…
//   GET  /api/profile  · POST /api/profile  · POST /api/profile/reset
//   GET  /app.js · /style.css  · /index.html → web/ (保留 demo 入口)
//
// 安全：对被扫目录全程只读（scanner/scan.js 写死了只读契约）。
//       唯一可写：~/.coda/  （profile.json + projects.json + kg.json）
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { scanDir } = require('./scanner/scan');
const { buildProfile } = require('./agent/profile');
const { reviewProject } = require('./agent/review');
const { matchReuse } = require('./agent/reuse');
const { scoreProject } = require('./agent/score');
const kg = require('./agent/kg');
const llm = require('./agent/llm');
const personaStore = require('./agent/persona-store');

const PORT = Number(process.env.CODA_PORT || 8848);
const WEB_DIR = path.join(__dirname, 'web');
const CODA_HOME = process.env.CODA_HOME || path.join(os.homedir(), '.coda');
const PROFILE_PATH = path.join(CODA_HOME, 'profile.json');
const PROJECTS_PATH = path.join(CODA_HOME, 'projects.json');
const KG_PATH = path.join(CODA_HOME, 'kg.json');

// ── 持久化工具 ───────────────────────────────────────────────
const ensureHome = () => { fs.mkdirSync(CODA_HOME, { recursive: true }); };
const readJSON = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
};
const writeJSON = (p, obj) => {
  ensureHome();
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
};

// ── 项目地图（用户授权过的目录历史）────────────────────────────
function loadProjects() { return readJSON(PROJECTS_PATH, { items: [] }); }
function recordProject(rootDir, industry, confidence) {
  const map = loadProjects();
  map.items = map.items || [];
  const idx = map.items.findIndex((x) => x.root === rootDir);
  const now = new Date().toISOString();
  if (idx >= 0) {
    map.items[idx].lastSeen = now; map.items[idx].visits = (map.items[idx].visits || 0) + 1;
    if (industry) map.items[idx].industry = industry;
    if (confidence != null) map.items[idx].confidence = confidence;
  } else {
    map.items.push({
      id: 'P' + (map.items.length + 1),
      root: rootDir, name: path.basename(rootDir),
      firstSeen: now, lastSeen: now, visits: 1,
      industry: industry || null, confidence: confidence || null,
    });
  }
  writeJSON(PROJECTS_PATH, map);
  return map.items;
}

// ── 人设摘要（跨项目累积·飞轮）────────────────────────────────
// 行业英文 key → 中文 label（读 dict/*.json，找不到回退英文）
let _labelCache = null;
function industryLabel(key) {
  if (!_labelCache) {
    _labelCache = {};
    try {
      const dictDir = path.join(__dirname, 'dict');
      for (const f of fs.readdirSync(dictDir)) {
        if (!f.endsWith('.json')) continue;
        const d = JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8'));
        if (d.industry) _labelCache[d.industry] = d.label || d.industry;
      }
    } catch { /* 词库读不到就回退英文 */ }
  }
  return _labelCache[key] || key;
}

function buildPersona() {
  const map = loadProjects();
  const items = map.items || [];
  if (items.length === 0) return null;

  const indCount = new Map();
  for (const p of items) if (p.industry) indCount.set(p.industry, (indCount.get(p.industry) || 0) + 1);
  const sortedInd = [...indCount.entries()].sort((a, b) => b[1] - a[1]);
  const topInd = sortedInd[0];
  const headline = topInd
    ? `你做过 ${topInd[1]} 个${industryLabel(topInd[0])}类项目 · 共 ${items.length} 个项目`
    : `你做过 ${items.length} 个项目`;

  const skills = [...new Set([
    ...sortedInd.map(([k]) => `${industryLabel(k)}行业经验`),
    ...items.filter((p) => p.visits >= 2).map((p) => `${p.name}（复访 ${p.visits} 次）`),
  ])].slice(0, 8);

  return { projectsSeen: items.length, headline, skills };
}

// ── 一站式分析（coda-eval.html /scan 期望的形态）─────────────
// 拆分：fullAnalyzeWithProgress(rootDir, onEvent) 在每个阶段开始/结束 emit 事件；
// fullAnalyze 是其屏蔽事件的薄封装（保持向后兼容）。
async function fullAnalyzeWithProgress(rootDir, onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};

  // ── scan 阶段 ──
  emit('scan', { status: 'start', message: '📁 遍历项目目录…' });
  const tScan0 = Date.now();
  const scan = scanDir(rootDir);
  const rootAbs = scan.rootDir;
  if ((scan.totalFiles || 0) > 50) {
    emit('scan', { status: 'progress', current: scan.totalFiles, total: scan.totalFiles });
  }
  emit('scan', { status: 'done', fileCount: scan.totalFiles, durationMs: Date.now() - tScan0 });

  // ── profile 阶段 ──
  emit('profile', { status: 'start', message: '🧠 命中行业词库，反推画像…' });
  const tProf0 = Date.now();
  const profile = buildProfile(scan);
  const detectedIndustry = profile.industry;

  const map0 = readJSON(PROJECTS_PATH, {});
  const override = (map0.overrides || {})[rootAbs];
  if (override && override.industry === detectedIndustry) {
    for (const k of ['label', 'emoji', 'summary', 'jargons']) {
      if (override[k] != null) profile[k] = override[k];
    }
    profile.edited = true;
  }
  emit('profile', {
    status: 'done',
    industry: profile.industry,
    label: profile.label,
    confidence: profile.confidence,
    durationMs: Date.now() - tProf0,
  });

  // 读文件（review / score / llm 共用）
  const files = scan.allFiles.map((rel) => {
    let content = '';
    try { content = fs.readFileSync(path.join(rootAbs, rel), 'utf8'); } catch {}
    return { file: rel, content };
  });

  // ── llm 阶段（可选：未配置则整段跳过，不 emit start）──
  if (llm.isEnabled()) {
    let modelName = 'LLM';
    try {
      const { getLLMConfig } = require('./agent/settings');
      const cfg = getLLMConfig();
      modelName = cfg.model || cfg.provider || 'LLM';
    } catch {}
    emit('llm', { status: 'start', message: `🤖 调用 ${modelName} 分析代码风格…` });
    const tLLM0 = Date.now();
    try {
      const r = await llm.chatCompletion({
        system: '你是看代码的资深工程师，用 2 句中文（合计 ≤60 字）评价这个项目的代码风格与潜在结构问题。直接说，不要前缀。',
        user: `项目 ${path.basename(rootAbs)}，行业 ${profile.label}，主要文件：${scan.allFiles.slice(0, 10).join(', ')}`,
        onChunk: (t) => emit('llm', { status: 'chunk', text: t }),
      });
      emit('llm', { status: 'done', durationMs: Date.now() - tLLM0, tokensOut: (r && r.tokensOut) || 0 });
    } catch (e) {
      emit('llm', { status: 'done', durationMs: Date.now() - tLLM0, tokensOut: 0, error: String(e.message || e) });
    }
  }

  // ── redlines 阶段（review 内部产出 issues，按红线分级）──
  emit('redlines', { status: 'start', message: '⚠️ 检查行业合规红线…' });
  const tRed0 = Date.now();
  const review = await reviewProject({ ...profile, industry: detectedIndustry }, files);
  const allIssues = review.issues || [];
  for (const i of allIssues) {
    emit('redlines', { status: 'hit', name: i.redlineName, level: i.redlineLevel, loc: i.loc || null });
  }
  emit('redlines', { status: 'done', count: allIssues.length, durationMs: Date.now() - tRed0 });

  // ── score 阶段（微软MI+McCabe+OWASP+重复+合规闸门）──
  emit('score', { status: 'start', message: '📊 多维度跑分（微软MI+McCabe+OWASP+合规闸门）…' });
  const tScore0 = Date.now();
  const scorecard = scoreProject(files, allIssues);
  for (const d of scorecard.dimensions || []) {
    emit('score', { status: 'dim', name: d.label, value: d.score });
  }
  emit('score', { status: 'done', total: scorecard.total, level: scorecard.level, durationMs: Date.now() - tScore0 });

  // ── reuse 阶段 ──
  emit('reuse', { status: 'start', message: '🔧 跨项目轮子匹配…' });
  const tReuse0 = Date.now();
  const reuse = matchReuse(scan, { currentProject: path.basename(rootAbs) });
  emit('reuse', { status: 'done', count: (reuse.hits || []).length, durationMs: Date.now() - tReuse0 });

  recordProject(rootAbs, detectedIndustry, profile.confidence);

  const reviews = (review.perFile || []).map((r) => ({
    file: r.file,
    score: r.score,
    scoreLevel: r.scoreLevel,
    summary: r.summary,
    issues: (r.issues || []).map((i) => ({
      id: i.id,
      redlineLevel: i.redlineLevel,
      redlineName: i.redlineName,
      problem: i.problem,
      techDetail: i.techDetail,
      fix: i.fix,
      loc: i.loc ? { file: i.loc.split(':')[0], line: Number((i.loc.split(':')[1]) || 1) } : null,
    })),
  }));

  const reuseOut = {
    candidates: (reuse.hits || []).map((h) => ({
      id: h.id, name: h.name, desc: h.desc,
      fromProject: h.sourceProject, file: h.file,
      matchScore: h.matchScore, snippet: h.snippet, tags: h.tags,
    })),
    hint: (reuse.hits || []).length ? {
      message: `小哒认出你是做${profile.label}的——有 ${reuse.hits.length} 个相关项目的轮子可复用`,
      candidates: (reuse.hits || []).map((h) => ({ name: h.name, fromProject: h.sourceProject })),
    } : null,
  };

  // ── 阶段感知 + 类比学习法（coda-eval.html 的 _scanResult.stage 会渲染）──
  const stage = buildStage(profile, review);

  // ── kg 阶段（跨项目知识图谱入库）──
  emit('kg', { status: 'start', message: '🕸️ 知识图谱入库…' });
  const tKG0 = Date.now();
  let kgNodes = 0, kgEdges = 0;
  try {
    const kgData = kg.loadKG();
    const kgAfter = kg.ingestScan(kgData, scan, profile, review, reuse, scorecard);
    kg.saveKG(kgAfter);
    kgNodes = (kgAfter.nodes || []).length;
    kgEdges = (kgAfter.edges || []).length;
  } catch (e) { /* KG 写入失败不阻塞主流程 */ }
  emit('kg', { status: 'done', nodes: kgNodes, edges: kgEdges, durationMs: Date.now() - tKG0 });

  // ── 长期画像 history append（永不删 jsonl 决策日志）──
  try {
    personaStore.appendDecision({
      ts: new Date().toISOString(),
      root: rootAbs,
      industry: profile.industry,
      industryLabel: profile.label,
      confidence: profile.confidence,
      evidenceWords: (profile.evidence || []).map((e) => e.word).slice(0, 8),
      topRedlines: (allIssues || []).slice(0, 3).map((i) => i.redlineName),
      score: scorecard && scorecard.total,
    });
  } catch { /* 历史写入失败不阻塞主流程 */ }

  const result = {
    scan_summary: { scanId: scan.scanId, rootDir: rootAbs, fileCount: scan.totalFiles },
    // profile：对齐 coda-eval.html renderProfile —— industry 用中文显示串、
    // evidence/redlines 拍平成字符串数组；详细对象另存 *Detail 供自带 demo 用。
    profile: {
      industry: profile.label || profile.industry,
      industryKey: profile.industry,
      emoji: profile.emoji,
      confidence: profile.confidence,
      summary: profile.summary,
      subDomain: profile.summary,
      roleGuess: `${profile.label}从业者`,
      evidence: (profile.evidence || []).map((e) => `${e.word}（${e.file}）`),
      redlines: (profile.redlines || []).map((r) => `${r.name} · ${r.level === 'high' ? '高危' : r.level === 'medium' ? '中危' : '提示'}`),
      jargons: profile.jargons,
      candidates: profile.candidates,
      edited: profile.edited || false,
      // 详细对象（自带 demo 页用，不影响 coda-eval.html）
      evidenceDetail: profile.evidence,
      redlinesDetail: profile.redlines,
    },
    stage,
    scorecard,
    reuse: reuseOut,
    reviews,
    scan, report: review,
  };

  emit('complete', { result });
  return result;
}

// 向后兼容：屏蔽事件流的薄封装
async function fullAnalyze(rootDir) {
  let result;
  await fullAnalyzeWithProgress(rootDir, (phase, data) => {
    if (phase === 'complete') result = data.result;
  });
  return result;
}

// ── 阶段感知 + 类比学习法 ───────────────────────────────────
// 把"代码当前阶段"用用户行业的类比讲出来——让行业专家秒懂技术状态。
function buildStage(profile, review) {
  const highN = (review.issues || []).filter((i) => i.redlineLevel === 'high').length;
  const score = review.score;
  let stage, analogy;
  const ind = profile.industry;

  if (score >= 85) {
    stage = '项目基本健康，可以继续往前走';
  } else if (highN > 0) {
    stage = `踩了 ${highN} 条高危红线，建议先处理再加新功能`;
  } else {
    stage = '有一些待改进项，但不阻塞';
  }

  // 行业类比（类比学习法）——把抽象的代码问题映射到用户熟悉的行业场景
  const ANALOGY = {
    medical: highN > 0
      ? '就像给病人开药前忘了核对过敏史——流程能跑，但漏了关键一步，迟早出事。'
      : '就像一次规范的接诊：流程齐全，偶有小项可优化。',
    ecommerce: highN > 0
      ? '就像收银台没对账就关店——当天看着没事，月底盘点准出窟窿。'
      : '就像一笔正常的交易闭环：下单到结算都走通了。',
    education: highN > 0
      ? '就像没批改就发了成绩单——错漏会一路传下去。'
      : '就像一堂备课充分的课：环节完整。',
    finance: highN > 0
      ? '就像放款前没做风控审批——钱是放出去了，风险也一起放出去了。'
      : '就像一笔合规的交易：审批链路完整。',
  };
  analogy = ANALOGY[ind] || (highN > 0 ? '关键环节缺了一道把关，先补上更稳。' : '整体流程通顺，细节可打磨。');

  return { stage, analogy };
}

// ── HTTP 工具 ──────────────────────────────────────────────
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(body);
}
function serveStatic(res, file) {
  const ext = path.extname(file).toLowerCase();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  });
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
async function withBody(req, res, fn) {
  try { return fn(await readBody(req)); }
  catch (e) { sendJSON(res, 400, { ok: false, error: String(e && e.message || e) }); }
}

// ── 路由 ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') return sendJSON(res, 200, {});

  try {
    if (pathname === '/' && req.method === 'GET') {
      return sendJSON(res, 200, {
        service: 'coda-agent', port: PORT,
        endpoints: ['/scan', '/scan/stream', '/persona', '/persona/detailed', '/persona/correction', '/persona/history',
          '/profile/override', '/projects', '/review', '/reuse', '/chat',
          '/kg/graph', '/kg/related', '/kg/similar'],
        note: '对接 coda-desktop 工作台；契约见 coda/README.md',
      });
    }

    if (pathname === '/scan' && req.method === 'POST') {
      return withBody(req, res, async (body) => {
        if (!body.root) return sendJSON(res, 400, { error: '缺少 root' });
        sendJSON(res, 200, await fullAnalyze(body.root));
      });
    }

    // ── SSE 流式扫描：让前端看到 review 每一步 ─────────────────
    if (pathname === '/scan/stream' && req.method === 'POST') {
      const body = await readBody(req);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      });
      const emit = (phase, data) => {
        try {
          res.write(`data: ${JSON.stringify({ phase, ...data, ts: Date.now() })}\n\n`);
        } catch { /* socket 已断，忽略 */ }
      };
      try {
        if (!body.root) {
          emit('error', { message: '缺少 root' });
        } else {
          emit('start', { root: body.root });
          await fullAnalyzeWithProgress(body.root, emit);
        }
      } catch (e) {
        emit('error', { message: String(e && e.message || e) });
      } finally {
        res.end();
      }
      return;
    }

    if (pathname === '/persona' && req.method === 'GET') {
      return sendJSON(res, 200, { persona: buildPersona() });
    }

    // ── 长期持久化画像：3 层（KG + history + edits）合成的完整 personaSummary ──
    if (pathname === '/persona/detailed' && req.method === 'GET') {
      try {
        const kgData = kg.loadKG();
        const history = personaStore.loadHistory({ limit: 200 });
        const edits = personaStore.loadEdits();
        const summary = personaStore.personaSummary({ kg: kgData, history, edits });
        return sendJSON(res, 200, { ok: true, persona: summary });
      } catch (e) {
        return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
      }
    }

    if (pathname === '/persona/correction' && req.method === 'POST') {
      return withBody(req, res, (body) => {
        const { kind, before, after, reason } = body || {};
        if (!kind) return sendJSON(res, 400, { ok: false, error: '缺少 kind' });
        const edits = personaStore.recordCorrection({
          ts: new Date().toISOString(),
          kind, before, after, reason,
        });
        sendJSON(res, 200, { ok: true, saved: personaStore.EDITS_PATH, corrections: (edits.corrections || []).length });
      });
    }

    if (pathname === '/persona/history' && req.method === 'GET') {
      const limit = Number(parsed.searchParams.get('limit') || 50);
      return sendJSON(res, 200, personaStore.loadHistory({ limit }));
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      const settingsMod = require('./agent/settings');
      const s = settingsMod.loadSettings();
      const masked = JSON.parse(JSON.stringify(s));
      if (masked.llm && masked.llm.apiKey) masked.llm.apiKey = settingsMod.maskApiKey(masked.llm.apiKey);
      return sendJSON(res, 200, masked);
    }
    if (pathname === '/api/settings' && req.method === 'POST') {
      return withBody(req, res, async (body) => {
        const settingsMod = require('./agent/settings');
        const cur = settingsMod.loadSettings();
        // 如果传来的 apiKey 是脱敏形态（含 "..."），保留原 key
        if (body && body.llm && body.llm.apiKey && body.llm.apiKey.includes('...')) {
          body.llm.apiKey = (cur.llm && cur.llm.apiKey) || '';
        }
        settingsMod.saveSettings(body);
        sendJSON(res, 200, { ok: true });
      });
    }
    if (pathname === '/api/llm/test' && req.method === 'POST') {
      try {
        const llm = require('./agent/llm');
        if (!llm.isEnabled()) return sendJSON(res, 200, { ok: false, error: 'LLM 未配置' });
        const r = await llm.chatCompletion({ system: 'You reply in 5 Chinese chars.', user: '你好' });
        return sendJSON(res, 200, { ok: true, reply: r.text, model: r.model, latencyMs: r.latencyMs });
      } catch (e) { return sendJSON(res, 200, { ok: false, error: String(e.message || e) }); }
    }

    if (pathname === '/profile/override' && req.method === 'POST') {
      return withBody(req, res, (body) => {
        const { root, override, editedAt } = body;
        if (!root || !override) return sendJSON(res, 400, { ok: false, error: '缺少 root/override' });
        const map = readJSON(PROJECTS_PATH, { items: [] });
        map.overrides = map.overrides || {};
        map.overrides[root] = { ...(map.overrides[root] || {}), ...override, editedAt };
        writeJSON(PROJECTS_PATH, map);
        sendJSON(res, 200, { ok: true, saved: PROJECTS_PATH });
      });
    }

    if (pathname === '/projects' && req.method === 'GET') {
      return sendJSON(res, 200, loadProjects());
    }

    if (pathname === '/kg/graph' && req.method === 'GET') {
      return sendJSON(res, 200, kg.graphForViz(kg.loadKG()));
    }

    if (pathname === '/kg/related' && req.method === 'GET') {
      let nodeId = parsed.searchParams.get('nodeId');
      const depth = Number(parsed.searchParams.get('depth') || 1);
      if (!nodeId) return sendJSON(res, 400, { error: '缺少 nodeId' });
      if (nodeId.startsWith('/')) nodeId = 'P:' + nodeId; // 兜底：绝对路径自动加 P:
      return sendJSON(res, 200, kg.queryRelated(kg.loadKG(), nodeId, depth));
    }

    if (pathname === '/kg/similar' && req.method === 'GET') {
      let project = parsed.searchParams.get('project');
      if (!project) return sendJSON(res, 400, { error: '缺少 project' });
      if (project.startsWith('/')) project = 'P:' + project; // 兜底：绝对路径自动加 P:
      const limit = Number(parsed.searchParams.get('limit') || 3);
      return sendJSON(res, 200, kg.querySimilarProjects(kg.loadKG(), project, limit));
    }

    if (pathname === '/reuse' && req.method === 'GET') {
      const root = parsed.searchParams.get('root') || '.';
      const scan = scanDir(root);
      return sendJSON(res, 200, { industry: scan.candidates[0] && scan.candidates[0].industry, ...matchReuse(scan) });
    }

    if (pathname === '/review' && req.method === 'POST') {
      return withBody(req, res, async (body) => {
        if (!body.root) return sendJSON(res, 400, { error: '缺少 root' });
        const r = await fullAnalyze(body.root);
        sendJSON(res, 200, r.reviews);
      });
    }

    if (pathname === '/chat' && req.method === 'POST') {
      return withBody(req, res, async (body) => {
        const { root, question } = body;
        if (!root || !question) return sendJSON(res, 400, { error: '缺少 root 或 question' });
        const r = await fullAnalyze(root);
        sendJSON(res, 200, composeAdvice(question, r.profile, r.reviews[0], r.reuse, kg.loadKG()));
      });
    }

    // ── 兼容旧 API（coda/web/index.html demo）──
    if (pathname === '/app.js') return serveStatic(res, path.join(WEB_DIR, 'app.js'));
    if (pathname === '/style.css') return serveStatic(res, path.join(WEB_DIR, 'style.css'));
    if (pathname === '/index.html') return serveStatic(res, path.join(WEB_DIR, 'index.html'));
    if (pathname === '/web/graph.html' || pathname === '/graph.html') return serveStatic(res, path.join(WEB_DIR, 'graph.html'));
    if (pathname === '/api/config') {
      return sendJSON(res, 200, { defaultDir: 'fixtures/clinic-booking', cwd: process.cwd(),
        fixtures: ['fixtures/clinic-booking', 'fixtures/clinic-checkup'] });
    }
    if (pathname === '/api/analyze') {
      return sendJSON(res, 200, await fullAnalyze(parsed.searchParams.get('dir') || 'fixtures/clinic-booking'));
    }
    if (pathname === '/api/scan') {
      return sendJSON(res, 200, scanDir(parsed.searchParams.get('dir') || 'fixtures/clinic-booking'));
    }
    if (pathname === '/api/profile' && req.method === 'POST') {
      return withBody(req, res, (body) => {
        const map = readJSON(PROJECTS_PATH, { items: [] });
        map.overrides = map.overrides || {};
        map.overrides['__default__'] = body;
        writeJSON(PROJECTS_PATH, map);
        sendJSON(res, 200, { ok: true });
      });
    }
    if (pathname === '/api/profile' && req.method === 'GET') {
      const map = readJSON(PROJECTS_PATH, { items: [] });
      return sendJSON(res, 200, (map.overrides && map.overrides['__default__']) || {});
    }
    if (pathname === '/api/profile/reset' && req.method === 'POST') {
      try { fs.unlinkSync(PROJECTS_PATH); } catch {}
      return sendJSON(res, 200, { ok: true });
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    sendJSON(res, 500, { error: String(e && e.message || e) });
  }
});

// ── 自然语言应答（规则引擎·不依赖 LLM）──────────────────────
function composeAdvice(question, profile, topReview, reuseOut, kgData) {
  const q = (question || '').trim();
  const ind = (profile && profile.label) || '这个';
  const j = (profile && profile.jargons && profile.jargons[0]) || '';
  const lines = [];

  if (/接下来|下一步|怎么做|怎么改|下一步怎么/i.test(q) && topReview) {
    const i0 = (topReview.issues && topReview.issues[0]) || {};
    lines.push(`基于你${ind}行业的小哒评分（${topReview.score} 分），最高优先级是修「${i0.redlineName || '第一条问题'}」——${i0.problem || ''}`);
    if (i0.fix) lines.push(`改法：${i0.fix}`);
  } else if (/其他项目|相关|学过|做过|姊妹|同行业|历史|相似|类似|之前/i.test(q) && kgData) {
    // KG 智能：用 querySimilarProjects 找同行业项目，附上名字 + 评分
    try {
      const projectId = kg.ID.project(/* rootDir */ '');
      // 因为 chat 不传 rootDir 给 composeAdvice，从 KG 里挑当前行业最近的 Project
      const indKey = profile && profile.industryKey;
      let curId = null;
      if (indKey) {
        const candidates = kgData.edges
          .filter((e) => e.type === 'IS_IN' && e.to === `I:${indKey}`)
          .map((e) => e.from);
        // 取 lastSeen 最近的那个
        const projs = candidates
          .map((id) => kgData.nodes.find((n) => n.id === id))
          .filter(Boolean)
          .sort((a, b) => (b.props.lastSeen || '').localeCompare(a.props.lastSeen || ''));
        curId = projs[0] && projs[0].id;
      }
      const sims = curId ? kg.querySimilarProjects(kgData, curId, 3) : [];
      if (sims.length) {
        lines.push(`小哒在知识图谱里翻了翻——你做过 ${sims.length} 个同行业的相似项目：`);
        for (const s of sims) {
          const node = kgData.nodes.find((n) => n.id === s.id);
          const score = node && node.props && node.props.score;
          lines.push(`  · ${s.name}${score != null ? `（评分 ${score}）` : ''} · 相似度 ${(s.weight * 100 | 0)}%`);
        }
      } else {
        lines.push(`小哒目前还没在知识图谱里找到同行业的姊妹项目——多扫几个项目就能看出共性。`);
      }
    } catch { lines.push(`知识图谱暂未建立同行业关联，多扫几个项目试试。`); }
  } else if (/复用|轮子|之前做|类似的|现成/i.test(q) && reuseOut.candidates && reuseOut.candidates.length) {
    const w = reuseOut.candidates[0];
    lines.push(`你做过 ${profile.industry} 类项目，「${w.name}」能直接复用——来自 ${w.fromProject}，匹配度 ${(w.matchScore * 100 | 0)}%。`);
  } else if (/行业|画像|我是谁|懂我|什么行业/i.test(q)) {
    lines.push(`根据你的项目代码扫描，小哒判断你是做${ind}的（置信度 ${((profile.confidence || 0) * 100 | 0)}%）。${j ? '你最常用的行话是「' + j + '」。' : ''}`);
  } else {
    lines.push(`${ind}项目当前 ${(topReview && topReview.score) != null ? topReview.score : '--'} 分。最高优先级问题：${(topReview && topReview.issues && topReview.issues[0] && topReview.issues[0].problem) || '暂无'}`);
    if (reuseOut.candidates && reuseOut.candidates.length) lines.push(`跨项目可复用：${reuseOut.candidates.map((c) => c.name).join('、')}`);
  }
  return { reply: lines.join('\n\n'), profile: profile && profile.industry, sources: { profile, topReview, reuse: reuseOut } };
}

server.listen(PORT, () => {
  console.log(`\n🐕 小哒 Coda · 评价 Agent 已启动`);
  console.log(`   监听端口：http://localhost:${PORT}`);
  console.log(`   状态存储：${CODA_HOME}`);
  console.log(`   KG 节点数: ${kg.loadKG().nodes.length}`);
  console.log(`   对接：coda-desktop 工作台 (coda-eval.html)`);
  console.log(`   端点：GET /persona · POST /scan · POST /profile/override · GET /projects · POST /chat · GET /kg/graph\n`);
});