/**
 * coda · 扫盘引擎（scanner）
 * ───────────────────────────────────────────────────────────────
 * 职责：递归遍历目录 → 命中行业词库 → 按权重反推行业画像。
 * 安全：全程【只读】。本文件仅使用 fs.readFileSync / readdirSync /
 *       statSync / openSync / readSync —— 不出现任何 writeFile /
 *       unlink / rename / rmdir。这是产品的安全承诺（方案 §7.1 / §8.3）。
 * 算法：方案 §7.3
 *   score(ind)      = Σ_cat [ weight(cat) × hitFiles(cat) × log(1+hitCount(cat)) ]
 *   confidence(ind) = score(ind) / Σ score(all_industries)
 *   —— 用 hitFiles（命中文件数）而非 hitCount，类别覆盖广度 > 单词高频；
 *      log(1+count) 平滑，防高频词独大；证据带 file:line，可溯源。
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── 遍历配置（方案 §7.1）────────────────────────────────────────
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'vendor', '__pycache__', '.venv', '.idea', '.vscode', 'coverage',
]);
const READ_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.html',
  '.vue', '.json', '.md', '.sql', '.css',
]);
const MAX_FILE_BYTES = 256 * 1024; // 单文件只扫前 256KB，防卡死
const MAX_FILES = 5000;            // 超大仓库文件数上限

// ── 词库加载 ───────────────────────────────────────────────────
const DICT_DIR = path.join(__dirname, '..', 'dict');

/** 读取 dict/ 下全部行业词库，预处理为小写词表以便匹配。 */
function loadDicts() {
  const files = fs.readdirSync(DICT_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const dict = JSON.parse(fs.readFileSync(path.join(DICT_DIR, f), 'utf8'));
    // 预编译：每个词带原文 + 小写，用于大小写无关匹配
    for (const cat of Object.values(dict.categories)) {
      cat._words = cat.words.map((w) => ({ raw: w, low: w.toLowerCase() }));
    }
    return dict;
  });
}

// ── 文件遍历（只读）────────────────────────────────────────────
/** 递归收集待扫文件的相对路径（受黑名单 / 扩展名 / 数量上限约束）。 */
function collectFiles(rootDir) {
  const out = [];
  const walk = (dir) => {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 无权限/坏链接：跳过，不报错（健壮性）
    }
    for (const ent of entries) {
      if (out.length >= MAX_FILES) break;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
        walk(full);
      } else if (ent.isFile()) {
        if (READ_EXTS.has(path.extname(ent.name).toLowerCase())) out.push(full);
      }
    }
  };
  walk(rootDir);
  return out;
}

/** 只读取文件前 MAX_FILE_BYTES 字节（大文件截断），返回字符串。 */
function readHead(file) {
  let fd;
  try {
    const size = fs.statSync(file).size;
    const len = Math.min(size, MAX_FILE_BYTES);
    if (len === 0) return '';
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** 统计 needle 在 hay 中的出现次数（大小写无关，非重叠）。 */
function countOcc(hayLow, needleLow) {
  if (!needleLow) return 0;
  return hayLow.split(needleLow).length - 1;
}

// ── 主扫描 ─────────────────────────────────────────────────────
/**
 * 扫描目录，反推行业画像。
 * @param {string} rootDir 待扫目录
 * @param {object} [opts]  { scanId?:string }（注入时间戳，便于测试可复现）
 * @returns {object} 方案 §7.4 结构
 */
function scanDir(rootDir, opts = {}) {
  const dicts = loadDicts();
  const absRoot = path.resolve(rootDir);
  const files = collectFiles(absRoot);

  // 每个行业一份累加器
  const acc = dicts.map((d) => ({
    dict: d,
    cats: Object.fromEntries(
      Object.keys(d.categories).map((c) => [c, { files: new Set(), count: 0 }]),
    ),
    // 证据：key = `${cat}|${rawWord}` → { category, word, count, file }
    evid: new Map(),
  }));

  for (const file of files) {
    const rel = path.relative(absRoot, file) || path.basename(file);
    const content = readHead(file);
    if (!content) continue;
    // 把相对路径并入可匹配文本，让文件名也能贡献命中（§9.2 文件名词）
    const lines = content.split('\n');
    const haystacks = [rel, ...lines]; // 索引 0 = 文件名行
    const lowLines = haystacks.map((l) => l.toLowerCase());

    for (const a of acc) {
      for (const [catName, cat] of Object.entries(a.dict.categories)) {
        let catCountInFile = 0;
        for (const w of cat._words) {
          // 逐行计数，定位首次命中的 file:line 作为证据
          let wordCount = 0;
          let firstLine = -1;
          for (let i = 0; i < lowLines.length; i++) {
            const c = countOcc(lowLines[i], w.low);
            if (c > 0) {
              wordCount += c;
              if (firstLine === -1) firstLine = i;
            }
          }
          if (wordCount > 0) {
            catCountInFile += wordCount;
            const key = `${catName}|${w.raw}`;
            const prev = a.evid.get(key);
            // file:line —— 索引 0 表示命中文件名，标记为 :name
            const locLabel = firstLine === 0 ? `${rel}:name` : `${rel}:${firstLine}`;
            if (prev) {
              prev.count += wordCount;
            } else {
              a.evid.set(key, {
                category: catName,
                word: w.raw,
                count: wordCount,
                file: locLabel,
              });
            }
          }
        }
        if (catCountInFile > 0) {
          a.cats[catName].files.add(rel);
          a.cats[catName].count += catCountInFile;
        }
      }
    }
  }

  // 计算每行业 score（§7.3）
  const scored = acc.map((a) => {
    let score = 0;
    for (const [catName, cat] of Object.entries(a.dict.categories)) {
      const st = a.cats[catName];
      if (st.files.size === 0) continue;
      score += cat.weight * st.files.size * Math.log(1 + st.count);
    }
    return { a, score };
  });

  const totalScore = scored.reduce((s, x) => s + x.score, 0);

  // 组装候选（按 confidence 降序，仅保留有命中的行业）
  const candidates = scored
    .filter((x) => x.score > 0)
    .map((x) => {
      const evidence = [...x.a.evid.values()]
        .sort((m, n) => n.count - m.count)
        .slice(0, 8);
      return {
        industry: x.a.dict.industry,
        label: x.a.dict.label,
        emoji: x.a.dict.emoji || '',
        confidence: totalScore > 0 ? +(x.score / totalScore).toFixed(2) : 0,
        score: +x.score.toFixed(2),
        evidence,
        // 供 §9.2 复用命中：本行业命中到的去重词
        evidenceWords: [...new Set([...x.a.evid.values()].map((e) => e.word))],
      };
    })
    .sort((m, n) => n.confidence - m.confidence);

  return {
    scanId: opts.scanId || new Date().toISOString(),
    rootDir: absRoot,
    totalFiles: files.length,
    candidates,
    allFiles: files.map((f) => path.relative(absRoot, f)),
  };
}

module.exports = { scanDir, loadDicts, SKIP_DIRS, READ_EXTS, MAX_FILE_BYTES, MAX_FILES };

// ── CLI：node scanner/scan.js <dir> ───────────────────────────
if (require.main === module) {
  const target = process.argv[2] || '.';
  const res = scanDir(target);
  const top = res.candidates[0];
  console.log(`\n📂 扫描目录：${res.rootDir}`);
  console.log(`📄 命中文件：${res.totalFiles} 个\n`);
  if (!top) {
    console.log('（未命中任何行业词库）');
  } else {
    console.log(`🎯 我猜你是做【${top.label} ${top.emoji}】的 —— 置信度 ${(top.confidence * 100).toFixed(0)}%\n`);
    console.log('证据词（可溯源）：');
    for (const e of top.evidence) {
      console.log(`  · [${e.category}] "${e.word}" ×${e.count}  → ${e.file}`);
    }
    if (res.candidates.length > 1) {
      const others = res.candidates.slice(1)
        .map((c) => `${c.label} ${(c.confidence * 100).toFixed(0)}%`).join(' / ');
      console.log(`\n其他候选：${others}`);
    }
  }
  console.log('');
}
