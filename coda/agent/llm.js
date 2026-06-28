// coda · 主办方 Agent API 适配（可选 · env-gated）
// 默认不启用：未配 CODA_AGENT_API_KEY 时 isEnabled()=false，全走规则引擎。
// 配了 Key 则 /review 可调真 LLM 精修 problem/fix 文案（仍只输出文本，永不返回 diff）。
'use strict';

const https = require('https');

function isEnabled() {
  return !!process.env.CODA_AGENT_API_KEY;
}

// 主办方 Agent API：opencli responses 规范，默认 endpoint 可用 env 覆盖
const ENDPOINT = process.env.CODA_AGENT_API_URL
  || 'https://api.agent.example.com/v1/responses';

/**
 * 调真 Agent API 精修一条 issue 的行话文案。失败则返回 null（调用方回退规则引擎）。
 * 硬约束：prompt 明确要求只产出文本评价，绝不返回可执行 patch/diff（§8.3）。
 */
function refineIssue(profile, target, baseIssue) {
  return new Promise((resolve) => {
    if (!isEnabled()) return resolve(null);
    const prompt = [
      `你是${profile.label}行业的资深 Review 专家。只读不改、只给文字建议，绝不输出代码 diff/patch。`,
      `请用${profile.label}行业的大白话，重写下面这条代码问题的"行话描述"和"改法建议"，`,
      `让一个${profile.label}从业者（不懂技术）也能听懂。只回 JSON：{"problem":"...","fix":"..."}`,
      ``,
      `文件：${target.file}`,
      `原始问题：${baseIssue.problem}`,
      `技术细节：${baseIssue.techDetail}`,
    ].join('\n');

    const body = JSON.stringify({
      preset: process.env.CODA_AGENT_PRESET || 'code',
      query: prompt,
    });
    const req = https.request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CODA_AGENT_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const text = j.output || j.text || j.choices?.[0]?.message?.content || '';
          const m = text.match(/\{[\s\S]*\}/);
          if (!m) return resolve(null);
          const parsed = JSON.parse(m[0]);
          // 安全闸：丢弃任何疑似 diff/patch 的返回
          if (/```|diff --git|^[+-]{3} /m.test(parsed.fix || '')) return resolve(null);
          resolve({ problem: parsed.problem, fix: parsed.fix });
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

module.exports = { isEnabled, refineIssue };
