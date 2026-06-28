// coda · Agent 层 /review —— 画像 + 文件 → 问题清单 + 打分（方案 §8.2）
// 规则引擎：对目标文件按红线规则命中 → 行话 problem + 技术细节 + 改法。
// 硬约束（§8.3）：只输出文本，永不返回 patch/diff；前端无"应用修改"按钮。
'use strict';

const { getRedlineRules } = require('./redlines');
const llm = require('./llm');

// 分数分段（§8.2）：≥85 优秀 / 70~84 合格 / 50~69 屎山预警 / <50 屎山
function levelOf(score) {
  if (score >= 85) return '优秀 · 放心继续';
  if (score >= 70) return '合格 · 有提升空间';
  if (score >= 50) return '及格边缘 · 屎山预警';
  return '屎山 · 建议重构';
}

// 命中判定：触发词组里 any 命中 ≥1 且 near 命中 ≥1（同文件即可，弱关联）
function matchRule(rule, low) {
  const anyHit = rule.triggers.any.some((t) => low.includes(t));
  if (!anyHit) return false;
  const nearHit = rule.triggers.near.some((t) => low.includes(t));
  return nearHit;
}

// 定位触发词首次出现行号，给 loc
function locateTrigger(rule, lines) {
  const needles = [...rule.triggers.any, ...rule.triggers.near];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (needles.some((n) => low.includes(n))) return i + 1;
  }
  return 1;
}

/**
 * 评审单个文件。
 * @param {object} profile 画像（§8.1，含 industry）
 * @param {object} target  { file, content }
 * @param {object} [opts]  { useLLM?:boolean }
 * @returns {Promise<object>} §8.2 结构
 */
async function reviewFile(profile, target, opts = {}) {
  const rules = getRedlineRules(profile.industry);
  const content = target.content || '';
  const low = content.toLowerCase();
  const lines = content.split('\n');

  const issues = [];
  let penalty = 0;
  for (const rule of rules) {
    if (!matchRule(rule, low)) continue;
    const lineNo = locateTrigger(rule, lines);
    let problem = rule.problem;
    let fix = rule.fix;

    // 可选：真 API 精修文案（失败自动回退规则文案）
    if (opts.useLLM && llm.isEnabled()) {
      const refined = await llm.refineIssue(profile, target, {
        problem: rule.problem,
        techDetail: `${target.file}:${lineNo} 触发「${rule.name}」`,
      });
      if (refined && refined.problem && refined.fix) {
        problem = refined.problem;
        fix = refined.fix;
      }
    }

    issues.push({
      id: rule.id.replace('R', 'I'),
      problem,                                  // 强制行话
      techDetail: `${target.file}:${lineNo} 触发「${rule.name}」红线规则`, // 默认折叠
      redlineLevel: rule.level,
      redlineName: rule.name,
      fix,                                      // 文字改法，绝不 diff
      loc: `${target.file}:${lineNo}`,
    });
    penalty += rule.level === 'high' ? 18 : rule.level === 'medium' ? 10 : 5;
  }

  const score = Math.max(0, 100 - penalty);
  const highN = issues.filter((i) => i.redlineLevel === 'high').length;
  const summary = issues.length === 0
    ? '未发现明显红线问题，代码质量良好'
    : `${issues.length} 处问题${highN ? `（其中 ${highN} 处高危红线）` : ''}`;

  return {
    file: target.file,
    score,
    scoreLevel: levelOf(score),
    summary,
    issues,
    engine: (opts.useLLM && llm.isEnabled()) ? 'rule+llm' : 'rule',
  };
}

/** 评审整个项目（多文件）→ 汇总分 + 全部 issues。 */
async function reviewProject(profile, files, opts = {}) {
  const perFile = [];
  for (const f of files) {
    const r = await reviewFile(profile, f, opts);
    if (r.issues.length > 0) perFile.push(r);
  }
  const allIssues = perFile.flatMap((r) => r.issues);
  // 项目总分：取各文件最低分加权，突出最严重短板
  const score = perFile.length
    ? Math.max(0, 100 - allIssues.reduce((s, i) =>
        s + (i.redlineLevel === 'high' ? 18 : i.redlineLevel === 'medium' ? 10 : 5), 0))
    : 95;
  const highN = allIssues.filter((i) => i.redlineLevel === 'high').length;
  return {
    score,
    scoreLevel: levelOf(score),
    summary: allIssues.length
      ? `全项目 ${allIssues.length} 处问题，${highN} 处踩医疗高危红线`
      : '全项目未发现明显红线问题',
    issues: allIssues,
    perFile,
    engine: (opts.useLLM && llm.isEnabled()) ? 'rule+llm' : 'rule',
  };
}

module.exports = { reviewFile, reviewProject, levelOf };
