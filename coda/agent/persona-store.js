// coda · 长期持久化用户画像存储
// ───────────────────────────────────────────────────────────────
// 三层数据：
//   ~/.coda/persona-history.jsonl  — 每次扫描 append 一条 decision（永不删）
//   ~/.coda/persona-edits.json     — 用户手动编辑/纠正/确认的覆盖层
//   实时聚合在 personaSummary() 里完成 —— KG + history + edits 融合
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CODA_HOME = process.env.CODA_HOME || path.join(os.homedir(), '.coda');
const HISTORY_PATH = path.join(CODA_HOME, 'persona-history.jsonl');
const EDITS_PATH = path.join(CODA_HOME, 'persona-edits.json');
const HALF_LIFE_MS = 30 * 24 * 3600 * 1000; // 30 天半衰期

const ensureHome = () => { fs.mkdirSync(CODA_HOME, { recursive: true }); };

// ── append-only 历史 ───────────────────────────────────────
function appendDecision(decision) {
  ensureHome();
  const line = JSON.stringify({
    ts: decision.ts || new Date().toISOString(),
    root: decision.root || '',
    industry: decision.industry || null,
    industryLabel: decision.industryLabel || null,
    confidence: decision.confidence != null ? decision.confidence : null,
    evidenceWords: decision.evidenceWords || [],
    topRedlines: decision.topRedlines || [],
    score: decision.score != null ? decision.score : null,
  });
  fs.appendFileSync(HISTORY_PATH, line + '\n');
}

function loadHistory({ limit = 100 } = {}) {
  let lines = [];
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf8');
    lines = raw.split('\n').filter(Boolean);
  } catch { return { all: [], byProject: {} }; }
  const recent = lines.slice(-limit).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  // 按 root 分组 —— 每个项目只保留最近 1 条
  const byProject = {};
  for (const d of recent) {
    if (!d.root) continue;
    const prev = byProject[d.root];
    if (!prev || (d.ts || '') > (prev.ts || '')) byProject[d.root] = d;
  }
  return { all: recent, byProject };
}

// ── 用户编辑层 ─────────────────────────────────────────────
function loadEdits() {
  try { return JSON.parse(fs.readFileSync(EDITS_PATH, 'utf8')); }
  catch { return { identity: {}, industryOverrides: {}, traits: [], corrections: [] }; }
}

function saveEdits(obj) {
  ensureHome();
  fs.writeFileSync(EDITS_PATH, JSON.stringify(obj, null, 2));
}

function recordCorrection({ ts, kind, before, after, reason }) {
  const edits = loadEdits();
  edits.corrections = edits.corrections || [];
  edits.corrections.push({
    ts: ts || new Date().toISOString(),
    kind: kind || 'unknown',
    before: before != null ? before : null,
    after: after != null ? after : null,
    reason: reason || '',
  });
  // 行业级 correction 同步写入 overrides，方便聚合时快速读取
  if (kind === 'industry' && after) {
    edits.industryOverrides = edits.industryOverrides || {};
    edits.industryOverrides[String(before || 'default')] = after;
  }
  saveEdits(edits);
  return edits;
}

// ── 聚合：合成最终画像 ─────────────────────────────────────
function personaSummary({ kg, history, edits } = {}) {
  history = history || loadHistory({ limit: 100 });
  edits = edits || loadEdits();
  kg = kg || { nodes: [], edges: [] };

  const all = history.all || [];
  const byProject = history.byProject || {};
  const now = Date.now();

  // identity：来自 history 第一条 + edits 覆盖
  const first = all[0] || {};
  const identity = {
    name: (edits.identity && edits.identity.name) || os.userInfo().username || 'developer',
    hostName: (edits.identity && edits.identity.hostName) || os.hostname() || '',
    firstSeen: first.ts || null,
  };

  // industries：按 root 取最近一条，按行业聚合，使用 recency-weighted 半衰期权重
  const indMap = new Map();
  for (const root of Object.keys(byProject)) {
    const rec = byProject[root];
    const indKey = (edits.industryOverrides && edits.industryOverrides[rec.industry]) || rec.industry;
    if (!indKey) continue;
    const ts = Date.parse(rec.ts || '') || now;
    const w = Math.exp(-(now - ts) / HALF_LIFE_MS);
    const entry = indMap.get(indKey) || {
      key: indKey,
      label: rec.industryLabel || indKey,
      weight: 0,
      confidence: 0,
      _confW: 0,
      projects: [],
      evidenceWords: new Set(),
    };
    entry.weight += w;
    if (rec.confidence != null) {
      entry.confidence += rec.confidence * w;
      entry._confW += w;
    }
    entry.projects.push({
      name: path.basename(root),
      root,
      lastSeen: rec.ts,
      confidence: rec.confidence,
    });
    for (const w0 of (rec.evidenceWords || [])) entry.evidenceWords.add(w0);
    indMap.set(indKey, entry);
  }
  const industries = [...indMap.values()].map((e) => ({
    key: e.key,
    label: e.label,
    weight: Number(e.weight.toFixed(4)),
    confidence: e._confW > 0 ? Number((e.confidence / e._confW).toFixed(3)) : 0,
    projects: e.projects.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')),
    evidenceWords: [...e.evidenceWords].slice(0, 10),
  })).sort((a, b) => b.weight - a.weight);

  // skills：从 KG IndustryWord 取高频
  const skills = [];
  try {
    const wordScores = new Map();
    for (const e of (kg.edges || [])) {
      if (e.type !== 'INDICATES') continue;
      const cnt = (e.props && e.props.count) || 0;
      wordScores.set(e.to, (wordScores.get(e.to) || 0) + cnt);
    }
    const ranked = [...wordScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [id, sc] of ranked) {
      const node = (kg.nodes || []).find((n) => n.id === id);
      const word = node && node.props && (node.props.word || node.props.label);
      if (word) skills.push({ word, score: sc });
    }
  } catch {}

  // traits：从 corrections + industries weight 推断
  const traits = [];
  const corrections = edits.corrections || [];
  if (corrections.filter((c) => c.kind === 'industry').length > 0) {
    traits.push('对行业定位有强烈偏好（已主动纠正）');
  }
  if (industries.length === 1) {
    traits.push(`专注 ${industries[0].label} 单一领域`);
  } else if (industries.length >= 3) {
    traits.push('多领域交叉，跨行业经验丰富');
  }
  if (industries[0] && industries[0].projects.length >= 3) {
    traits.push(`${industries[0].label} 深度从业（${industries[0].projects.length} 个项目）`);
  }
  for (const t of (edits.traits || [])) traits.push(t);

  // timeline：history 摘要，最近的 10 条
  const timeline = all.slice(-10).reverse().map((d) => ({
    ts: d.ts,
    summary: `扫了 ${path.basename(d.root || '')}${d.industryLabel ? ` · 行业 ${d.industryLabel}` : ''}${d.score != null ? ` · 评分 ${d.score}` : ''}`,
  }));

  return {
    identity,
    industries,
    skills,
    traits,
    timeline,
    corrections: corrections.slice(-10).reverse(),
    stats: {
      totalScans: all.length,
      uniqueProjects: Object.keys(byProject).length,
      uniqueIndustries: industries.length,
    },
  };
}

module.exports = {
  appendDecision,
  loadHistory,
  loadEdits,
  saveEdits,
  recordCorrection,
  personaSummary,
  HISTORY_PATH,
  EDITS_PATH,
};
