// 体检流程状态机 —— 与挂号流程类似：登记 → 检查 → 出报告
// 涉及就诊状态流转（候诊 → 就诊 → 完结 的体检版）

const STAGES = ['已登记', '检查中', '已出报告'];

export class CheckupFlow {
  constructor(patientId) {
    this.patientId = patientId;
    this.status = '已登记'; // 就诊状态
  }

  // 推进体检/就诊状态
  advance() {
    const i = STAGES.indexOf(this.status);
    if (i < STAGES.length - 1) this.status = STAGES[i + 1];
    return this.status;
  }

  // 预约就诊时段（挂号流程）
  reserveSlot(date, slot) {
    return { patientId: this.patientId, date, slot, status: '已预约就诊时段' };
  }
}
