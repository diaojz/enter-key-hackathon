// coda · 行业行话词表（喂给画像，供报告页"用你那行的话"讲）
'use strict';
const JARGONS = {
  medical: ['候诊', '挂号', '就诊时段', '复诊', '禁忌症', '主诉', '医嘱', '病历流转', '脱敏'],
  ecommerce: ['下单', '结算', '库存', '退款', '风控', '促销'],
  education: ['选课', '考勤', '题库', '及格线', '学时'],
  finance: ['授信', '风控', '反洗钱', '持仓', '征信'],
};
const SUMMARIES = {
  medical: '社区诊所/医疗信息系统',
  ecommerce: '电商交易系统',
  education: '在线教育/教务系统',
  finance: '金融/理财系统',
};
function getJargons(ind) { return JARGONS[ind] || []; }
function getSummary(ind) { return SUMMARIES[ind] || '业务系统'; }
module.exports = { getJargons, getSummary };
