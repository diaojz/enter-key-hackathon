// coda · 医疗行业红线模板库（profile/review 共用）
// 每条红线：触发证据词 + 行话 problem + 技术细节 + 改法。
// review 通过"片段命中触发词"来挂红线，保证行话翻译稳定可复现（方案 §12 话术）。
'use strict';

const MEDICAL_REDLINES = [
  {
    id: 'R1',
    name: '患者隐私明文存储',
    level: 'high',
    desc: '患者身份证/病历号/医保号不应明文落前端存储',
    // review 命中逻辑：片段里同时出现"敏感字段"与"前端存储"特征
    triggers: { any: ['idcard', 'healthid', 'medicalrecord', '身份证', '病历号', '医保'], near: ['localstorage', 'sessionstorage', 'document.cookie'] },
    problem: '患者隐私字段裸奔——身份证、病历号明文存 localStorage，任何能打开浏览器的人都能看到，违反医疗数据红线',
    fix: '敏感字段仅存内存或加密存储；展示时脱敏（身份证留前4后4）；落库走后端加密字段，前端只持有脱敏视图',
  },
  {
    id: 'R2',
    name: '就诊时段并发挂号',
    level: 'medium',
    desc: '同一就诊时段在并发下可能被重复挂号',
    triggers: { any: ['booking', '挂号', '就诊时段', 'slot', 'appointment'], near: ['check', 'existing', 'await', 'settimeout', 'has(', 'get('] },
    problem: '同一就诊时段会被重复挂号——候诊顺序会乱，现场可能两个患者撞同一号',
    fix: '后端对(日期+时段)加唯一约束或分布式锁；前端提交时带版本号做乐观锁，撞号时友好提示改约',
  },
  {
    id: 'R3',
    name: '医嘱复核缺失',
    level: 'high',
    desc: '开具处方/医嘱前未强制校验禁忌症/过敏史',
    triggers: { any: ['prescribe', '处方', '医嘱', 'prescription', 'medication'], near: ['status', '状态', 'todo', 'next(', 'dosage'] },
    problem: '病历流转少了"医嘱复核"——开处方前没校验过敏史/禁忌症，可能给患者开了相冲的药',
    fix: '在 prescribe 前插入强制复核步骤：校验患者过敏史/禁忌症清单，未通过不允许进入"已就诊"状态',
  },
  {
    id: 'R4',
    name: '身份核验过弱',
    level: 'medium',
    desc: '患者身份证仅做长度校验，未校验校验位',
    triggers: { any: ['validateidcard', '身份证校验', 'idcard'], near: ['length', '长度', '===', 'length =='] },
    problem: '患者身份核验形同虚设——身份证只查了长度，错号也能建档，体检报告可能挂错人',
    fix: '身份证按 GB 11643 校验：18 位 + 末位校验码 + 地区码/出生日期合法性，校验失败明确拦截',
  },
];

const REDLINE_LIB = { medical: MEDICAL_REDLINES };

function getRedlines(industry) {
  return (REDLINE_LIB[industry] || []).map((r) => ({
    id: r.id, name: r.name, level: r.level, desc: r.desc,
  }));
}

function getRedlineRules(industry) {
  return REDLINE_LIB[industry] || [];
}

module.exports = { getRedlines, getRedlineRules, REDLINE_LIB };
