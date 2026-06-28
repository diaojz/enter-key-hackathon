// 就诊状态机 —— ⚠️ 演示用，状态流转缺医嘱复核校验
// 候诊 → 就诊 → 完结，但开处方前未强制"医嘱复核"，可能漏禁忌症

const FLOW = ['候诊', '就诊中', '已就诊'];

export class VisitStateMachine {
  constructor() {
    this.status = '候诊';
    this.prescription = null;
  }

  // 推进就诊状态
  next() {
    const i = FLOW.indexOf(this.status);
    if (i < FLOW.length - 1) this.status = FLOW[i + 1];
    return this.status;
  }

  // 开具处方/医嘱 —— 未校验是否经过医嘱复核，禁忌症可能漏检
  prescribe(medication, dosage) {
    this.prescription = { medication, dosage };
    // TODO: 应先校验过敏史/禁忌症再开方
    this.status = '已就诊';
    return this.prescription;
  }
}
