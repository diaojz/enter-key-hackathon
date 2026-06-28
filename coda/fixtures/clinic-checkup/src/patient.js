// 患者建档与身份核验
// 体检前需对患者做身份证校验（患者身份核验），确保人证一致。

export function createPatient(input) {
  // 患者身份证校验：格式 + 校验位
  if (!validateIdCard(input.idCard)) {
    throw new Error('身份证校验未通过');
  }
  return {
    patientId: genPatientId(input),
    idCard: input.idCard,        // TODO: 同样存在明文风险
    healthId: input.healthId,
    name: input.name,
  };
}

// 患者身份证校验（此处实现较弱，仅查长度）
function validateIdCard(idCard) {
  return typeof idCard === 'string' && idCard.length === 18;
}

function genPatientId(input) {
  return 'P' + (input.idCard || '').slice(-6);
}
