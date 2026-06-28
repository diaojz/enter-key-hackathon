/**
 * W1 · 患者身份证校验（患者身份核验）
 * 来源项目：clinic-booking ·  已打磨可直接复用
 * 语义：校验中国大陆居民身份证号（GB 11643）——18 位 + 出生日期合法 + 末位校验码。
 * 比"只查长度"严谨得多，避免错号建档、体检报告挂错人。
 */
'use strict';

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * 校验患者身份证号。
 * @param {string} idCard 18 位身份证号
 * @returns {{ ok: boolean, reason?: string }}
 */
function validatePatientId(idCard) {
  if (typeof idCard !== 'string' || !/^\d{17}[\dX]$/i.test(idCard)) {
    return { ok: false, reason: '格式错误：应为 18 位（末位可为 X）' };
  }
  // 出生日期合法性
  const y = +idCard.slice(6, 10);
  const m = +idCard.slice(10, 12);
  const d = +idCard.slice(12, 14);
  const birth = new Date(y, m - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== m - 1 || birth.getDate() !== d) {
    return { ok: false, reason: '出生日期非法' };
  }
  // 末位校验码
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += +idCard[i] * WEIGHTS[i];
  const expect = CHECK_CODES[sum % 11];
  if (expect.toUpperCase() !== idCard[17].toUpperCase()) {
    return { ok: false, reason: '校验码不匹配（疑似错号）' };
  }
  return { ok: true };
}

/** 脱敏展示：留前 4 后 4，中间打码。 */
function maskIdCard(idCard) {
  if (typeof idCard !== 'string' || idCard.length < 8) return '****';
  return idCard.slice(0, 4) + '*'.repeat(idCard.length - 8) + idCard.slice(-4);
}

module.exports = { validatePatientId, maskIdCard };
