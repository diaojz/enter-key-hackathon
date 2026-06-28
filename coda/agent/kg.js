// coda · Agent 层 /kg —— 跨项目知识图谱（设计稿 §一~§十）
// 单文件 JSON 图（~/.coda/kg.json），idempotent 入库：同项目反复扫不膨胀节点/边，
// 只更新 props（visits / lastSeen / hitCountTotal 等）。原子写防崩溃。零依赖。
// 节点：User / Project / Industry / IndustryWord / File / Wheel / Redline
// 边：OWNS / IS_IN / CONTAINS / INDICATES / BELONGS_TO / REUSES / VIOLATES / SIMILAR_TO
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const SCHEMA_VERSION = 1, SCHEMA_NAME = 'coda-kg';

// ── 路径 / 骨架 ────────────────────────────────────────────────
/** 返回 kg.json 的绝对路径（受 CODA_HOME 控制，便于测试隔离）。 */
function kgPath() { return path.join(process.env.CODA_HOME || path.join(os.homedir(), '.coda'), 'kg.json'); }
function emptyKG() {
  const now = new Date().toISOString();
  return {
    meta: { version: SCHEMA_VERSION, schemaName: SCHEMA_NAME, createdAt: now, updatedAt: now, lastScanId: null, counts: {} },
    nodes: [], edges: [],
  };
}

// ── 读 / 写（原子写）───────────────────────────────────────────
/** 读取 kg.json；文件不存在或损坏时返回空骨架。 */
function loadKG() {
  try {
    const kg = JSON.parse(fs.readFileSync(kgPath(), 'utf8'));
    if (!kg || !Array.isArray(kg.nodes) || !Array.isArray(kg.edges)) return emptyKG();
    if (!kg.meta) kg.meta = emptyKG().meta;
    return kg;
  } catch { return emptyKG(); }
}
/** 原子写入：先写 .tmp 再 rename，防崩溃时 kg.json 半截损坏。 */
function saveKG(kg) {
  fs.mkdirSync(path.dirname(kgPath()), { recursive: true });
  recountMeta(kg);
  kg.meta.updatedAt = new Date().toISOString();
  const target = kgPath(), tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(kg, null, 2));
  fs.renameSync(tmp, target);
  return kg;
}

// ── 核心 upsert ────────────────────────────────────────────────
function upsertNode(kg, id, label, props) {
  let n = kg.nodes.find((x) => x.id === id);
  if (!n) { n = { id, label, props: {} }; kg.nodes.push(n); }
  Object.assign(n.props, props || {});
  return n;
}
function upsertEdge(kg, type, from, to, weight, props) {
  const id = `E:${type}:${from}:${to}`;
  let e = kg.edges.find((x) => x.id === id);
  if (!e) { e = { id, type, from, to, weight: 0, props: {} }; kg.edges.push(e); }
  if (typeof weight === 'number') e.weight = weight;
  Object.assign(e.props, props || {});
  return e;
}
const removeEdgesWhere = (kg, pred) => { kg.edges = kg.edges.filter((e) => !pred(e)); };
function recountMeta(kg) {
  const counts = { nodes: kg.nodes.length, edges: kg.edges.length };
  for (const n of kg.nodes) counts[n.label] = (counts[n.label] || 0) + 1;
  kg.meta.counts = counts;
}

// ── ID 约定（设计稿 §二 + 任务里的 :: 分隔约定）─────────────────
const ID = {
  user: () => 'U:local',
  project: (root) => `P:${root}`,
  industry: (key) => `I:${key}`,
  industryWord: (industry, word) => `IW:${industry}::${word}`,
  file: (projectId, relPath) => `F:${projectId}::${relPath}`,
  wheel: (industry, wheelKey) => `W:${industry}::${wheelKey}`,
  redline: (industry, redlineName) => `R:${industry}::${redlineName}`,
};

// ── 入库主入口（idempotent）────────────────────────────────────
/**
 * 把一次 /scan 的产出幂等地写进图。同项目反复扫只更新 props，不膨胀节点/边。
 * @param {object} kg loadKG() 的结果
 * @param {object} scanResult scanner/scan.js 输出
 * @param {object} profile agent/profile.js 输出
 * @param {object} review agent/review.js 输出（含 issues / perFile）
 * @param {object} reuse agent/reuse.js 输出（hits[]）
 * @param {object} scorecard agent/score.js 输出（total / level / dimensions）
 * @returns {object} 更新后的 kg
 */
function ingestScan(kg, scanResult, profile, review, reuse, scorecard) {
  const now = scanResult.scanId || new Date().toISOString();
  const rootAbs = scanResult.rootDir;
  const projectId = ID.project(rootAbs), industryKey = profile.industry;
  const industryId = ID.industry(industryKey), userId = ID.user();
  // User + Project（visits 累加 / firstSeen 保留）
  const u = upsertNode(kg, userId, 'User', { name: process.env.USER || 'local', host: os.hostname(), lastActiveAt: now });
  if (!u.props.createdAt) u.props.createdAt = now;
  const existing = kg.nodes.find((x) => x.id === projectId);
  const visits = existing ? (existing.props.visits || 0) + 1 : 1;
  const firstSeen = existing && existing.props.firstSeen ? existing.props.firstSeen : now;
  upsertNode(kg, projectId, 'Project', {
    root: rootAbs, name: path.basename(rootAbs),
    industry: industryKey, industryConfidence: profile.confidence || 0,
    score: scorecard ? scorecard.total : (review ? review.score : null),
    scoreLevel: scorecard ? scorecard.level : (review ? review.scoreLevel : null),
    fileCount: scanResult.totalFiles || (scanResult.allFiles || []).length,
    visits, firstSeen, lastSeen: now, edited: !!profile.edited,
  });
  upsertEdge(kg, 'OWNS', userId, projectId, 1, { firstSeen, lastSeen: now });
  // Industry + IS_IN（行业变更时先删旧 IS_IN）
  if (industryKey && industryKey !== 'unknown') {
    upsertNode(kg, industryId, 'Industry', {
      key: industryKey, label: profile.label || industryKey, emoji: profile.emoji || '', dictSource: `dict/${industryKey}.json`,
    });
    removeEdgesWhere(kg, (e) => e.type === 'IS_IN' && e.from === projectId && e.to !== industryId);
    upsertEdge(kg, 'IS_IN', projectId, industryId, profile.confidence || 0,
      { confidence: profile.confidence || 0, edited: !!profile.edited, scanId: now });
  }
  // Files + CONTAINS + INDICATES：整批替换本项目子图（容忍文件增删 / 防孤儿）
  removeEdgesWhere(kg, (e) => (e.type === 'CONTAINS' && e.from === projectId)
    || (e.type === 'INDICATES' && e.from.startsWith(`F:${projectId}::`)));
  kg.nodes = kg.nodes.filter((n) => !(n.label === 'File' && n.props.projectId === projectId));
  const perFileMap = new Map(((review && review.perFile) || []).map((r) => [r.file, r]));
  for (const rel of scanResult.allFiles || []) {
    const fileId = ID.file(projectId, rel), rev = perFileMap.get(rel);
    upsertNode(kg, fileId, 'File', {
      projectId, path: rel,
      score: rev ? rev.score : null, scoreLevel: rev ? rev.scoreLevel : null,
      lang: path.extname(rel).slice(1) || null, lastScannedAt: now,
    });
    upsertEdge(kg, 'CONTAINS', projectId, fileId, 1, {});
  }
  // 行业词证据（INDICATES）—— evidence.file 形如 'src/x.js:14' 或 ':name'
  const top = (scanResult.candidates || [])[0];
  if (top && top.industry === industryKey) {
    for (const ev of top.evidence || []) {
      const [relPath, lineHint = ''] = (ev.file || '').split(':');
      if (!relPath) continue;
      const fileId = ID.file(projectId, relPath);
      if (!kg.nodes.find((n) => n.id === fileId)) continue; // 防悬挂边
      const wordId = ID.industryWord(industryKey, ev.word);
      const wn = upsertNode(kg, wordId, 'IndustryWord', { word: ev.word, category: ev.category, industryKey });
      wn.props.weight = wn.props.weight || 1;
      upsertEdge(kg, 'INDICATES', fileId, wordId, ev.count || 1,
        { count: ev.count || 1, loc: `${relPath}:${lineHint}`, category: ev.category });
      upsertEdge(kg, 'BELONGS_TO', wordId, industryId, 1, { category: ev.category });
    }
  }
  // Wheels + REUSES（清旧再加）
  removeEdgesWhere(kg, (e) => e.type === 'REUSES' && e.from === projectId);
  for (const h of (reuse && reuse.hits) || []) {
    const wid = ID.wheel(industryKey, h.id);
    upsertNode(kg, wid, 'Wheel', {
      wheelKey: h.id, name: h.name, industryKey,
      sourceProject: h.sourceProject, file: h.file, desc: h.desc, tags: h.tags || [],
    });
    upsertEdge(kg, 'REUSES', projectId, wid, h.matchScore || 0, { matchScore: h.matchScore || 0, scanId: now });
  }
  // Redlines + VIOLATES（清旧再加；按 redlineName 去重聚合）
  removeEdgesWhere(kg, (e) => e.type === 'VIOLATES' && e.from === projectId);
  const issuesByRed = new Map();
  for (const i of (review && review.issues) || []) {
    const k = i.redlineName || i.id;
    issuesByRed.set(k, (issuesByRed.get(k) || []).concat([i]));
  }
  for (const [name, list] of issuesByRed.entries()) {
    const rid = ID.redline(industryKey, name);
    const lvl = (list[0] && list[0].redlineLevel) || 'low';
    upsertNode(kg, rid, 'Redline', { redlineKey: list[0].id, name, level: lvl, industryKey, desc: list[0].problem || '' });
    upsertEdge(kg, 'VIOLATES', projectId, rid, list.length, { level: lvl, count: list.length, loc: list[0].loc || '', scanId: now });
  }
  // 派生计数（按图实时聚合）
  for (const n of kg.nodes) {
    if (n.label === 'Wheel') n.props.reusedCount = kg.edges.filter((e) => e.type === 'REUSES' && e.to === n.id).length;
    else if (n.label === 'Redline') n.props.violatedCount = kg.edges.filter((e) => e.type === 'VIOLATES' && e.to === n.id).length;
    else if (n.label === 'Industry') n.props.projectCount = kg.edges.filter((e) => e.type === 'IS_IN' && e.to === n.id).length;
    else if (n.label === 'IndustryWord') {
      const ins = kg.edges.filter((e) => e.type === 'INDICATES' && e.to === n.id);
      n.props.hitCountTotal = ins.reduce((s, e) => s + (e.props.count || 0), 0);
      n.props.hitProjects = new Set(ins.map((e) => (e.from.match(/^F:(.+)::/) || [, ''])[1])).size;
    }
  }
  rebuildSimilarTo(kg, industryKey, now);
  kg.meta.lastScanId = now;
  return kg;
}

// ── 相似度（设计稿 §四）─────────────────────────────────────────
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function projectSignals(kg, projectId) {
  const words = new Set(), redlines = new Set(), wheels = new Set();
  for (const e of kg.edges) {
    if (e.type === 'INDICATES' && e.from.startsWith(`F:${projectId}::`)) words.add(e.to);
    else if (e.type === 'VIOLATES' && e.from === projectId) redlines.add(e.to);
    else if (e.type === 'REUSES' && e.from === projectId) wheels.add(e.to);
  }
  return { words, redlines, wheels };
}
function rebuildSimilarTo(kg, industryKey, now) {
  const peers = kg.edges.filter((e) => e.type === 'IS_IN' && e.to === ID.industry(industryKey)).map((e) => e.from);
  removeEdgesWhere(kg, (e) => e.type === 'SIMILAR_TO' && peers.includes(e.from) && peers.includes(e.to));
  const sigs = new Map(peers.map((p) => [p, projectSignals(kg, p)]));
  for (let i = 0; i < peers.length; i++) for (let j = i + 1; j < peers.length; j++) {
    const A = sigs.get(peers[i]), B = sigs.get(peers[j]);
    const jw = jaccard(A.words, B.words), jr = jaccard(A.redlines, B.redlines), jh = jaccard(A.wheels, B.wheels);
    const w = 0.5 * jw + 0.3 * jr + 0.2 * jh;
    if (w >= 0.3) upsertEdge(kg, 'SIMILAR_TO', peers[i], peers[j], +w.toFixed(2),
      { industry: industryKey, wordJaccard: +jw.toFixed(2), redlineJaccard: +jr.toFixed(2), wheelJaccard: +jh.toFixed(2), computedAt: now });
  }
}

// ── 图查询 ─────────────────────────────────────────────────────
/** N 跳邻居（无向遍历）。返回 {nodes, edges} 子图。 */
function queryRelated(kg, nodeId, depth = 1) {
  const seen = new Set([nodeId]);
  let frontier = [nodeId];
  const edges = [];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const e of kg.edges) {
      const fIn = frontier.includes(e.from), tIn = frontier.includes(e.to);
      if (fIn && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); edges.push(e); }
      else if (tIn && !seen.has(e.from)) { seen.add(e.from); next.push(e.from); edges.push(e); }
      else if (fIn && seen.has(e.to) && !edges.includes(e)) edges.push(e);
    }
    if (!next.length) break;
    frontier = next;
  }
  return { nodes: kg.nodes.filter((n) => seen.has(n.id)), edges };
}
/** 找同行业 SIMILAR_TO 边连接的项目，按权重降序。 */
function querySimilarProjects(kg, projectId, limit = 3) {
  const out = [];
  for (const e of kg.edges) {
    if (e.type !== 'SIMILAR_TO') continue;
    if (e.from === projectId) out.push({ id: e.to, weight: e.weight, props: e.props });
    else if (e.to === projectId) out.push({ id: e.from, weight: e.weight, props: e.props });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, limit).map((x) => {
    const n = kg.nodes.find((nn) => nn.id === x.id);
    return { id: x.id, name: n ? n.props.name : x.id, weight: x.weight, props: x.props };
  });
}

// ── 前端 force-directed 视图 ───────────────────────────────────
const GROUP_BY_LABEL = { User: 0, Project: 1, Industry: 2, IndustryWord: 3, File: 4, Wheel: 5, Redline: 6 };
const SIZE_BY_LABEL = { User: 26, Project: 22, Industry: 20, Wheel: 16, Redline: 16, IndustryWord: 12, File: 10 };
/** 转 vis-network / d3-force 喜欢的 {nodes:[{id,label,group,size}], links:[{source,target,type}]}。 */
function graphForViz(kg) {
  return {
    nodes: kg.nodes.map((n) => ({
      id: n.id, label: n.props.name || n.props.word || n.props.path || n.props.label || n.label,
      group: GROUP_BY_LABEL[n.label] != null ? GROUP_BY_LABEL[n.label] : 9,
      size: SIZE_BY_LABEL[n.label] || 12, kind: n.label,
    })),
    links: kg.edges.map((e) => ({ source: e.from, target: e.to, type: e.type, weight: e.weight })),
  };
}

// ── 人设摘要（设计稿 §五：从图实时聚合）─────────────────────────
/** 基于 KG 聚合：行业偏好分布、最常用词、最常用 wheel、最常踩红线。 */
function personaFromKG(kg) {
  const userId = ID.user();
  const projects = kg.edges.filter((e) => e.type === 'OWNS' && e.from === userId).map((e) => e.to);
  if (!projects.length) return null;
  const projSet = new Set(projects);
  const nameOf = (id) => (kg.nodes.find((n) => n.id === id) || { props: {} }).props;

  const indCount = new Map(), wordScore = new Map(), wheelHits = new Map(), redHits = new Map();
  for (const e of kg.edges) {
    if (e.type === 'IS_IN' && projSet.has(e.from)) indCount.set(e.to, (indCount.get(e.to) || 0) + 1);
    else if (e.type === 'INDICATES') {
      const m = e.from.match(/^F:(.+)::/);
      if (m && projSet.has(m[1])) wordScore.set(e.to, (wordScore.get(e.to) || 0) + (e.props.count || 0));
    }
    else if (e.type === 'REUSES' && projSet.has(e.from)) wheelHits.set(e.to, (wheelHits.get(e.to) || 0) + 1);
    else if (e.type === 'VIOLATES' && projSet.has(e.from)) redHits.set(e.to, (redHits.get(e.to) || 0) + 1);
  }
  const sortBy = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  const out = {
    projectsSeen: projects.length,
    topIndustries: sortBy(indCount).map(([id, c]) => ({ industry: id, count: c, label: nameOf(id).label || id })),
    topWords: sortBy(wordScore).slice(0, 8).map(([id, s]) => ({ word: nameOf(id).word || id, score: s })),
    topWheels: sortBy(wheelHits).slice(0, 5).map(([id, c]) => ({ name: nameOf(id).name || id, reused: c })),
    oldPits: sortBy(redHits).slice(0, 3).map(([id, c]) => ({ name: nameOf(id).name || id, hit: c })),
  };

  // ── 增强：叠加 history / edits 长期画像（如果存在 persona-store）──
  try {
    const personaStore = require('./persona-store');
    const history = personaStore.loadHistory({ limit: 100 });
    const edits = personaStore.loadEdits();
    out.longTerm = {
      totalScans: (history.all || []).length,
      uniqueProjects: Object.keys(history.byProject || {}).length,
      corrections: (edits.corrections || []).length,
      lastScanTs: (history.all && history.all.length) ? history.all[history.all.length - 1].ts : null,
      industryOverrides: edits.industryOverrides || {},
    };
  } catch { /* persona-store 不可用时降级，不影响原返回 */ }

  return out;
}

module.exports = {
  kgPath, loadKG, saveKG, ingestScan,
  queryRelated, querySimilarProjects, graphForViz, personaFromKG,
  upsertNode, upsertEdge, ID,
};

// ── CLI 自测：node coda/agent/kg.js test ───────────────────────
if (require.main === module && process.argv[2] === 'test') {
  process.env.CODA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'coda-kg-test-'));
  let pass = 0, fail = 0;
  const ok = (c, m) => { (c ? pass++ : fail++); console.log(`  ${c ? '✓' : '✗'} ${m}`); };
  console.log(`\n[kg.test] CODA_HOME=${process.env.CODA_HOME}\n`);
  const mkScan = (root, files, evid, scanId) => ({ scanId, rootDir: root, totalFiles: files.length,
    allFiles: files, candidates: [{ industry: 'medical', label: '医疗', emoji: '🩺', confidence: 0.78, evidence: evid }] });
  const profile = { industry: 'medical', label: '医疗', emoji: '🩺', confidence: 0.78 };
  const scanA = mkScan('/tmp/clinic-booking', ['src/store/user.js', 'src/api/booking.js'], [
    { category: 'patient', word: '患者', count: 9, file: 'src/store/user.js:3' },
    { category: 'privacy', word: '身份证', count: 6, file: 'src/store/user.js:14' },
    { category: 'visit', word: '挂号', count: 4, file: 'src/api/booking.js:8' },
  ], '2026-06-28T10:00:00.000Z');
  const reviewA = { score: 70, issues: [{ id: 'I4', redlineLevel: 'medium', redlineName: '身份核验过弱', problem: 'x', loc: 'src/store/user.js:22' }],
    perFile: [{ file: 'src/store/user.js', score: 55, scoreLevel: '及格边缘' }] };
  const cardA = { total: 62, level: '及格边缘 · 屎山预警' };

  let kg = loadKG();
  ok(!kg.nodes.length && !kg.edges.length, '初始空骨架');
  kg = ingestScan(kg, scanA, profile, reviewA, { hits: [] }, cardA); saveKG(kg);
  const n1 = kg.nodes.length, e1 = kg.edges.length;
  ok(kg.nodes.find((n) => n.id === 'P:/tmp/clinic-booking'), '建了 Project 节点');
  ok(kg.nodes.find((n) => n.id === 'I:medical'), '建了 Industry 节点');
  ok(kg.nodes.find((n) => n.id === 'F:P:/tmp/clinic-booking::src/store/user.js'), '建了 File 节点');
  ok(kg.edges.find((e) => e.type === 'OWNS' && e.from === 'U:local'), '建了 OWNS 边');
  ok(kg.edges.find((e) => e.type === 'VIOLATES' && e.to.startsWith('R:medical::')), '建了 VIOLATES 边');
  kg = ingestScan(kg, { ...scanA, scanId: '2026-06-28T11:00:00.000Z' }, profile, reviewA, { hits: [] }, cardA); saveKG(kg);
  const proj = kg.nodes.find((n) => n.id === 'P:/tmp/clinic-booking');
  ok(proj.props.visits === 2, `visits 累加到 2 (实际 ${proj.props.visits})`);
  ok(kg.nodes.length === n1 && kg.edges.length === e1, `幂等：节点/边数不变 (${n1}/${e1})`);
  const scanB = mkScan('/tmp/clinic-checkup', ['src/checkup.js'], [
    { category: 'patient', word: '患者', count: 5, file: 'src/checkup.js:3' },
    { category: 'privacy', word: '身份证', count: 3, file: 'src/checkup.js:10' },
  ], '2026-06-28T12:00:00.000Z');
  const reuseB = { hits: [{ id: 'W1', name: '患者 ID 校验', sourceProject: 'clinic-booking', file: 'x.js', desc: 'x', tags: [], matchScore: 0.67 }] };
  kg = ingestScan(kg, scanB, { ...profile, confidence: 0.71 }, { score: 80, issues: [], perFile: [] }, reuseB, { total: 80, level: '合格' });
  saveKG(kg);
  ok(kg.edges.filter((e) => e.type === 'SIMILAR_TO').length === 1, 'SIMILAR_TO 边数 = 1');
  const sim = querySimilarProjects(kg, 'P:/tmp/clinic-booking', 3);
  ok(sim.length >= 1 && sim[0].name === 'clinic-checkup', '查到姊妹项目 clinic-checkup');
  ok(queryRelated(kg, 'F:P:/tmp/clinic-booking::src/store/user.js', 2).nodes.length >= 3, '2 跳邻居 ≥3 个节点');
  const viz = graphForViz(kg);
  ok(viz.nodes.length === kg.nodes.length && viz.links.length === kg.edges.length, 'viz 结构尺寸对齐');
  const persona = personaFromKG(kg);
  ok(persona && persona.projectsSeen === 2 && persona.topIndustries[0].label === '医疗', 'persona 聚合正确');
  const reloaded = loadKG();
  ok(reloaded.nodes.length === kg.nodes.length && reloaded.edges.length === kg.edges.length, 'reload 内容对齐');
  console.log(`\n[kg.test] PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
}
