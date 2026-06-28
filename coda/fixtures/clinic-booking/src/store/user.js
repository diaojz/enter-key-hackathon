// 患者信息本地存储 —— ⚠️ 演示用，含真实红线
// 当前实现把患者隐私字段明文写进 localStorage。

export function savePatient(patient) {
  // 患者身份证、病历号、医保号直接明文落前端存储
  localStorage.setItem('patientId', patient.patientId);
  localStorage.setItem('idCard', patient.idCard);       // 身份证明文
  localStorage.setItem('healthId', patient.healthId);   // 医保号明文
  localStorage.setItem('patientName', patient.name);
  // 病历号也存了
  localStorage.setItem('medicalRecordNo', patient.medicalRecordNo);
}

export function loadPatient() {
  return {
    patientId: localStorage.getItem('patientId'),
    idCard: localStorage.getItem('idCard'),
    healthId: localStorage.getItem('healthId'),
    name: localStorage.getItem('patientName'),
    medicalRecordNo: localStorage.getItem('medicalRecordNo'),
  };
}

// 展示患者身份证：未脱敏，整串显示
export function renderIdCard(idCard) {
  return idCard; // 应脱敏：留前4后4
}
