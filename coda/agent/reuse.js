// coda · 复用引擎 —— 扫项目 B 命中同行业 → 弹"有现成轮子"（方案 §9.2）
// matchScore(wheel) = |intent ∩ (证据词 ∪ 文件名词)| / |intent|，≥0.4 命中。
// 匹配用"子串双向包含"做模糊交：让"身份证校验"能命中证据词"身份证"等。
'use strict';

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'industry-lib');
const ROOT = path.join(__dirname, '..');
const THRESHOLD = 0.4;

function loadLib(industry) {
  const p = path.join(LIB_DIR, `${industry}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 从扫盘结果构造"信号集"：证据词 + 文件名拆词（长度≥2，降噪）
function buildSignals(scan) {
  const top = (scan.candidates || [])[0];
  const sig = new Set();
  if (top) for (const w of top.evidenceWords || []) sig.add(w.toLowerCase());
  for (const f of scan.allFiles || []) {
    for (const tok of f.toLowerCase().split(/[^a-z0-9一-龥]+/)) {
      if (tok.length >= 2) sig.add(tok);
    }
  }
  return [...sig];
}

function matchScore(wheel, signals) {
  const intent = wheel.intent.map((s) => s.toLowerCase());
  let hit = 0;
  for (const t of intent) {
    if (signals.some((s) => s.includes(t) || t.includes(s))) hit++;
  }
  return hit / intent.length;
}

/**
 * 对扫盘结果做复用命中。
 * @param {object} scan 扫盘输出（§7.4）
 * @param {object} [opts] { currentProject?:string 当前项目名，用于排除自身来源 }
 * @returns {{ industry, hits:[{ ...wheel, matchScore, snippet }] }}
 */
function matchReuse(scan, opts = {}) {
  const top = (scan.candidates || [])[0];
  if (!top) return { industry: null, hits: [] };
  const lib = loadLib(top.industry);
  if (!lib) return { industry: top.industry, hits: [] };

  const signals = buildSignals(scan);
  const current = opts.currentProject
    || path.basename(scan.rootDir || '');

  const hits = [];
  for (const wheel of lib.wheels) {
    // 不向轮子的来源项目自身推荐它（你已经有了）
    if (wheel.sourceProject === current) continue;
    const ms = +matchScore(wheel, signals).toFixed(2);
    if (ms >= THRESHOLD) {
      let snippet = '';
      try { snippet = fs.readFileSync(path.join(ROOT, wheel.file), 'utf8'); } catch {}
      hits.push({
        id: wheel.id, name: wheel.name, desc: wheel.desc,
        sourceProject: wheel.sourceProject, tags: wheel.tags,
        matchScore: ms, file: wheel.file, snippet,
      });
    }
  }
  hits.sort((a, b) => b.matchScore - a.matchScore);
  return { industry: top.industry, threshold: THRESHOLD, hits };
}

module.exports = { matchReuse, THRESHOLD };
