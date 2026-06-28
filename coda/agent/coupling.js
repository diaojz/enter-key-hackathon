/**
 * 耦合度分析（Coupling Analysis）—— 屎山代码的核心特征
 * 
 * 业界共识：屎山 = 高耦合 + 低内聚 + 循环依赖 + 上帝类。
 * 这是 Robert C. Martin《Agile Software Development》和
 * Edward Yourdon《Structured Design》的核心指标。
 * 
 * 本模块不依赖 AST（保持零依赖），用正则提取 import/require 边，
 * 然后在文件依赖图上算：
 *   Ce (Efferent Coupling)   = 出度 = 该文件 import 了几个内部文件
 *   Ca (Afferent Coupling)   = 入度 = 几个内部文件 import 了它
 *   Instability I            = Ce / (Ca + Ce)  ∈ [0,1]，1=最不稳定
 *   循环依赖                  = 依赖图里的环（DFS 找）
 *   上帝文件                  = Ce > 15 OR Ca > 15
 * 
 * 参考：
 *   - Martin, Robert C. "Agile Principles, Patterns, and Practices" 2002 (Ce/Ca/I)
 *   - Yourdon & Constantine "Structured Design" 1979 (耦合/内聚)
 *   - SonarQube `coupling_between_objects` / Java Depend / Sonargraph
 */
'use strict';

const path = require('path');

// import / require / from-import 三种主流语法
const IMPORT_PATTERNS = [
  /(?:^|[\s;{}])import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g,           // ES6
  /(?:^|[\s;{}=(,])require\s*\(\s*["']([^"']+)["']\s*\)/g,                       // CommonJS
  /(?:^|\n)\s*from\s+([\w.]+)\s+import\s+/g,                                     // Python from X import
  /(?:^|\n)\s*import\s+([\w.]+)(?:\s+as\s+\w+)?\s*$/gm,                          // Python import X
];

const SKIP_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'os', 'url', 'crypto', 'util', 'events', 'stream', 'child_process', 'net',
  'os.path', 'sys', 'json', 're', 'time', 'datetime', 'random', 'logging', 'collections',
]);

function extractImports(content) {
  const refs = new Set();
  for (const pat of IMPORT_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(content)) !== null) {
      let r = m[1];
      if (!r) continue;
      // 只关心相对路径或同项目模块；node_modules / pip 包通常无 . 前缀
      if (r.startsWith('.') || r.startsWith('/') || /^[a-zA-Z_]\w*$/.test(r) === false) {
        refs.add(r);
      } else if (!SKIP_BUILTINS.has(r) && !r.startsWith('@') && r.indexOf('/') < 0) {
        // 单段裸名（可能是本项目 module），保留但不强求
        refs.add(r);
      }
    }
  }
  return [...refs];
}

/**
 * 把 import target 解析到实际文件路径（best-effort）
 */
function resolveRef(srcFile, ref, fileSet) {
  // 绝对 / 相对路径
  if (ref.startsWith('.') || ref.startsWith('/')) {
    const base = path.dirname(srcFile);
    const target = path.normalize(path.join(base, ref));
    // 试常见后缀
    for (const ext of ['', '.js', '.ts', '.tsx', '.jsx', '.py', '/index.js', '/index.ts', '/__init__.py']) {
      const cand = target + ext;
      if (fileSet.has(cand)) return cand;
    }
  }
  // Python: from package.module import → package/module.py
  if (ref.includes('.')) {
    const pyPath = ref.replace(/\./g, '/');
    for (const ext of ['.py', '/__init__.py']) {
      const cand = pyPath + ext;
      for (const f of fileSet) if (f.endsWith(cand)) return f;
    }
  }
  // Bare module 名：找 basename 匹配
  for (const f of fileSet) {
    const bn = path.basename(f).replace(/\.(js|ts|tsx|jsx|py)$/, '');
    if (bn === ref) return f;
  }
  return null;
}

/**
 * 构建依赖图
 * @param {Array<{file,content}>} files 每个文件路径相对项目根
 * @returns {{nodes:Set, edges:Map<from, Set<to>>, reverse:Map<to, Set<from>>, fileSet:Set}}
 */
function buildDepGraph(files) {
  const fileSet = new Set(files.map((f) => f.file));
  const edges = new Map();        // from → Set<to>
  const reverse = new Map();      // to → Set<from>

  for (const { file, content } of files) {
    const refs = extractImports(content || '');
    const tos = new Set();
    for (const r of refs) {
      const target = resolveRef(file, r, fileSet);
      if (target && target !== file) tos.add(target);
    }
    edges.set(file, tos);
    for (const t of tos) {
      if (!reverse.has(t)) reverse.set(t, new Set());
      reverse.get(t).add(file);
    }
  }
  return { nodes: fileSet, edges, reverse, fileSet };
}

/**
 * 找循环依赖（强连通分量大小 ≥ 2 的环），用 Tarjan 算法。
 */
function findCycles(graph) {
  const { edges } = graph;
  const cycles = [];
  const index = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  let counter = 0;

  function strongconnect(v) {
    index.set(v, counter); lowlink.set(v, counter); counter++;
    stack.push(v); onStack.add(v);
    for (const w of (edges.get(v) || [])) {
      if (!index.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), index.get(w)));
      }
    }
    if (lowlink.get(v) === index.get(v)) {
      const scc = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length >= 2) cycles.push(scc);
      // 单节点自环
      else if (scc.length === 1 && (edges.get(v) || new Set()).has(v)) cycles.push(scc);
    }
  }
  for (const v of edges.keys()) if (!index.has(v)) strongconnect(v);
  return cycles;
}

/**
 * 每文件耦合指标
 */
function fileMetrics(graph) {
  const { edges, reverse } = graph;
  const out = [];
  for (const file of edges.keys()) {
    const ce = (edges.get(file) || new Set()).size;
    const ca = (reverse.get(file) || new Set()).size;
    const instability = (ca + ce) > 0 ? ce / (ca + ce) : 0;
    out.push({ file, ce, ca, instability: +instability.toFixed(2) });
  }
  return out.sort((a, b) => (b.ce + b.ca) - (a.ce + a.ca));
}

/**
 * 整体耦合分（0-100，越高越好）
 */
function couplingScore(files) {
  if (!files || files.length === 0) {
    return { score: 100, metrics: [], cycles: [], godFiles: [], summary: '无可分析文件' };
  }
  const graph = buildDepGraph(files);
  const metrics = fileMetrics(graph);
  const cycles = findCycles(graph);

  // 上帝文件：Ce > 15 OR Ca > 15
  const godFiles = metrics.filter((m) => m.ce > 15 || m.ca > 15);

  // 扣分制
  let penalty = 0;
  // 每条循环依赖：扣 15 分
  penalty += cycles.length * 15;
  // 每个上帝文件：扣 8 分
  penalty += godFiles.length * 8;
  // 平均 Ce > 5 多扣（团队普遍写得耦合）
  const avgCe = metrics.reduce((s, m) => s + m.ce, 0) / Math.max(1, metrics.length);
  if (avgCe > 5) penalty += Math.min(20, (avgCe - 5) * 3);
  // 不稳定文件占比 > 50%（普遍不抽象）
  const unstableRatio = metrics.filter((m) => m.instability > 0.8 && m.ca + m.ce > 2).length / Math.max(1, metrics.length);
  if (unstableRatio > 0.5) penalty += Math.min(15, (unstableRatio - 0.5) * 30);

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return {
    score,
    metrics: metrics.slice(0, 20),       // 只返回前 20 个最重要的
    cycles: cycles.slice(0, 10),         // 前 10 条循环
    godFiles,
    avgCe: +avgCe.toFixed(1),
    unstableRatio: +(unstableRatio * 100).toFixed(1),
    method: {
      name: '耦合度（依赖图分析）',
      formula: 'Ce(出度) + Ca(入度) + 循环依赖 + 上帝文件',
      source: 'Robert C. Martin · Agile Software Development (Ce/Ca/I); SonarQube coupling_between_objects',
      evidence: `${cycles.length} 条循环依赖，${godFiles.length} 个上帝文件（Ce 或 Ca > 15），平均 Ce=${avgCe.toFixed(1)}`,
    },
  };
}

module.exports = { couplingScore, buildDepGraph, findCycles, fileMetrics, extractImports };

// ── CLI 自测 ────────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const dir = process.argv[2] || 'fixtures/clinic-booking';
  const { scanDir } = require('../scanner/scan');
  const scan = scanDir(dir);
  const files = scan.allFiles.map((rel) => ({
    file: rel,
    content: fs.readFileSync(path.join(scan.rootDir, rel), 'utf8'),
  }));
  const r = couplingScore(files);
  console.log(`\n耦合分: ${r.score} / 100`);
  console.log(`  ${r.method.evidence}`);
  console.log(`\n前 5 高耦合文件:`);
  for (const m of r.metrics.slice(0, 5)) {
    console.log(`  ${m.file.padEnd(40)} Ce=${m.ce} Ca=${m.ca} I=${m.instability}`);
  }
  if (r.cycles.length) {
    console.log(`\n循环依赖:`);
    for (const c of r.cycles) console.log(`  ${c.join(' → ')} → ${c[0]}`);
  }
  if (r.godFiles.length) {
    console.log(`\n上帝文件 (Ce 或 Ca > 15):`);
    for (const m of r.godFiles) console.log(`  ${m.file}: Ce=${m.ce} Ca=${m.ca}`);
  }
}
