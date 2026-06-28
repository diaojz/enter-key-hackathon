// coda · Agent 层 /profile —— 扫盘结果 → 行业画像（方案 §8.1）
// 确定性规则引擎：扫盘 candidates → 画像 + redlines + jargons（editable）。
// 不调 LLM（炸场点本就是 0 LLM 的纯算法）；输出可被 /review 直接消费。
'use strict';

const { getRedlines } = require('./redlines');
const { getJargons, getSummary } = require('./jargons');

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
    label: top.label,
    emoji: top.emoji,
    confidence: top.confidence,
    summary: getSummary(top.industry),
    evidence: top.evidence.map((e) => ({
      category: e.category, word: e.word, file: e.file, count: e.count,
    })),
    redlines: getRedlines(top.industry),
    jargons: getJargons(top.industry),
    candidates: scan.candidates.map((c) => ({
      industry: c.industry, label: c.label, confidence: c.confidence,
    })),
    editable: true,
  };
}

module.exports = { buildProfile };
