// coda · Agent 层 /profile —— 扫盘结果 → 行业画像（方案 §8.1）
// 确定性规则引擎：扫盘 candidates → 画像 + redlines + jargons（editable）。
// 不调 LLM（炸场点本就是 0 LLM 的纯算法）；输出可被 /review 直接消费。
'use strict';

const fs = require('fs');
const path = require('path');
const { getRedlines } = require('./redlines');
const { getJargons, getSummary } = require('./jargons');

// 行业英文 key → 中文 label（读 dict/*.json，找不到回退英文）
let _labelCache = null;
function industryLabel(key) {
  if (!key) return '未识别';
  if (!_labelCache) {
    _labelCache = {};
    try {
      const dictDir = path.join(__dirname, '..', 'dict');
      for (const f of fs.readdirSync(dictDir)) {
        if (!f.endsWith('.json')) continue;
        const d = JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8'));
        if (d.industry) _labelCache[d.industry] = d.label || d.industry;
      }
    } catch { /* 词库读不到就回退英文 */ }
  }
  return _labelCache[key] || key;
}

/**
 * @param {object} scan 扫盘输出（§7.4）
 * @returns {object} 画像（§8.1）
 */
function buildProfile(scan) {
  const top = (scan.candidates || [])[0];
  if (!top) {
    return {
      industry: 'unknown', label: '未识别', emoji: '❓', confidence: 0,
      summary: '未命中任何行业词库', evidence: [], redlines: [], jargons: [],
      editable: true,
    };
  }
  return {
    industry: top.industry,
    label: top.label || industryLabel(top.industry), // 兜底：词库 label 缺失也保证中文
    emoji: top.emoji || '🛠️',
    confidence: top.confidence,
    summary: getSummary(top.industry),
    evidence: top.evidence.map((e) => ({
      category: e.category, word: e.word, file: e.file, count: e.count,
    })),
    redlines: getRedlines(top.industry),
    jargons: getJargons(top.industry),
    candidates: scan.candidates.map((c) => ({
      industry: c.industry, label: c.label || industryLabel(c.industry), confidence: c.confidence,
    })),
    editable: true,
  };
}

module.exports = { buildProfile, industryLabel };
