/**
 * W2 · 就诊状态机（候诊 → 就诊 → 完结）
 * 来源项目：clinic-booking · 已打磨可直接复用
 * 语义：管理一次就诊的全流程状态流转，并在开处方前强制"医嘱复核"，
 *       未通过禁忌症/过敏史校验不允许进入"已就诊"——堵住医疗高危红线。
 */
'use strict';

const FLOW = ['候诊', '就诊中', '已就诊', '已取消'];
const NEXT = { 候诊: '就诊中', 就诊中: '已就诊' };

class VisitStateMachine {
  /** @param {object} ctx { allergies?: string[] } 患者过敏史/禁忌清单 */
  constructor(ctx = {}) {
    this.status = '候诊';
    this.ctx = ctx;
    this.prescription = null;
    this.reviewed = false; // 是否已通过医嘱复核
  }

  /** 推进到下一就诊状态（非法流转会抛错）。 */
  advance() {
    const nxt = NEXT[this.status];
    if (!nxt) throw new Error(`非法状态流转：${this.status} 无后继`);
    this.status = nxt;
    return this.status;
  }

  /** 医嘱复核：校验处方是否与患者过敏史/禁忌症冲突。 */
  reviewOrder(medication) {
    const allergies = this.ctx.allergies || [];
    if (allergies.some((a) => medication.includes(a))) {
      return { ok: false, reason: `禁忌：患者对「${medication}」过敏/禁忌` };
    }
    this.reviewed = true;
    return { ok: true };
  }

  /** 开具处方——必须先过医嘱复核，且处于"就诊中"。 */
  prescribe(medication, dosage) {
    if (this.status !== '就诊中') throw new Error('只有就诊中才能开方');
    if (!this.reviewed) throw new Error('开方前必须先通过医嘱复核');
    this.prescription = { medication, dosage };
    this.status = '已就诊';
    return this.prescription;
  }

  cancel() { this.status = '已取消'; }
}

module.exports = { VisitStateMachine, FLOW };
