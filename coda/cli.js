#!/usr/bin/env node
// coda · CLI —— 命令行工具（方案 §9.1 入库工具 + 扫盘/评审/复用）
// 用法：
//   node cli.js scan    <dir>                      扫盘反推行业
//   node cli.js review  <dir>                      扫盘 + 评审打分
//   node cli.js reuse   <dir>                      复用命中检查
//   node cli.js extract <file> --as <名> --industry <ind> [--intent a,b] [--desc "…"]
//        把一个文件预抽成"轮子"入库（半自动复用·提前做，不在现场）
'use strict';

const fs = require('fs');
const path = require('path');
const { scanDir } = require('./scanner/scan');
const { buildProfile } = require('./agent/profile');
const { reviewProject } = require('./agent/review');
const { matchReuse } = require('./agent/reuse');

const ROOT = __dirname;
const args = process.argv.slice(2);
const cmd = args[0];

function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

function readProjectFiles(scan) {
  return scan.allFiles.map((rel) => {
    let content = '';
    try { content = fs.readFileSync(path.join(scan.rootDir, rel), 'utf8'); } catch {}
    return { file: rel, content };
  });
}

async function main() {
  if (cmd === 'scan') {
    const scan = scanDir(args[1] || '.');
    const p = buildProfile(scan);
    console.log(`\n🎯 行业：${p.label} ${p.emoji}  置信度 ${(p.confidence*100|0)}%  (${scan.totalFiles} 文件)`);
    for (const e of p.evidence) console.log(`  · [${e.category}] ${e.word} ×${e.count} → ${e.file}`);
    return;
  }

  if (cmd === 'review') {
    const scan = scanDir(args[1] || '.');
    const p = buildProfile(scan);
    const report = await reviewProject(p, readProjectFiles(scan), { useLLM: flag('llm') === '1' });
    console.log(`\n📊 ${p.label} 质量分：${report.score}  [${report.scoreLevel}]`);
    console.log(`   ${report.summary}  (引擎: ${report.engine})`);
    for (const i of report.issues) {
      console.log(`\n  ⚠️ [${i.redlineLevel}] ${i.redlineName} @ ${i.loc}`);
      console.log(`     ${i.problem}`);
      console.log(`     改法：${i.fix}`);
    }
    return;
  }

  if (cmd === 'reuse') {
    const scan = scanDir(args[1] || '.');
    const r = matchReuse(scan);
    console.log(`\n🎁 复用命中（行业 ${r.industry}）：${r.hits.length} 个`);
    for (const h of r.hits) console.log(`  ✓ ${h.id} ${h.name}  匹配度 ${(h.matchScore*100|0)}%  来自 ${h.sourceProject}`);
    return;
  }

  if (cmd === 'extract') {
    const src = args[1];
    const name = flag('as');
    const industry = flag('industry', 'medical');
    if (!src || !name) { console.error('用法：node cli.js extract <file> --as <名> --industry <ind>'); process.exit(1); }
    const desc = flag('desc', '');
    const intent = (flag('intent', '') || name).split(',').map((s) => s.trim()).filter(Boolean);

    // 复制源文件到 snippets/
    const base = path.basename(src);
    const destRel = path.join('snippets', base);
    fs.mkdirSync(path.join(ROOT, 'snippets'), { recursive: true });
    fs.copyFileSync(src, path.join(ROOT, destRel));

    // 追加 wheel 到 industry-lib/<ind>.json
    const libPath = path.join(ROOT, 'industry-lib', `${industry}.json`);
    let lib = { industry, label: industry, wheels: [] };
    if (fs.existsSync(libPath)) lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
    const id = 'W' + (lib.wheels.length + 1);
    lib.wheels.push({
      id, name, intent, sourceProject: path.basename(path.dirname(path.resolve(src))),
      file: destRel, desc, tags: intent,
    });
    fs.writeFileSync(libPath, JSON.stringify(lib, null, 2));
    console.log(`✅ 已入库 ${id} 「${name}」→ ${industry}.json （片段：${destRel}）`);
    return;
  }

  console.log(`小哒 Coda CLI
  node cli.js scan    <dir>                 扫盘反推行业
  node cli.js review  <dir> [--llm 1]       扫盘 + 评审打分
  node cli.js reuse   <dir>                 复用命中检查
  node cli.js extract <file> --as <名> --industry <ind> [--intent a,b] [--desc "…"]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
