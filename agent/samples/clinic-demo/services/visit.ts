// 社区诊所 · 就诊/候诊服务
// 故意埋了几个医疗红线问题，给小哒扫盘评价用。

interface Patient {
  name: string;
  phone: string;
  idCard: string;       // 身份证号
  symptom: string;      // 主诉
  contraindication?: string;  // 禁忌症
}

// ❌ 红线1：患者隐私字段明文存进 localStorage
export function savePatient(p: Patient) {
  localStorage.setItem('patient', JSON.stringify(p));
}

// ❌ 红线2：挂号写入未加锁，同一就诊时段会被重复挂号
export function register(slot: string, p: Patient) {
  const queue = JSON.parse(localStorage.getItem('queue') || '[]');
  queue.push({ slot, patient: p });        // 并发下会重复挂号、候诊顺序乱
  localStorage.setItem('queue', JSON.stringify(queue));
}

// ❌ 红线3：开处方未校验禁忌症
export function prescribe(p: Patient, medication: string) {
  // 直接开药，没有检查 p.contraindication 与 medication 是否冲突
  return { patient: p.name, medication, time: Date.now() };
}

// 复诊优先排队（业务逻辑本身 OK）
export function sortQueue(list: any[]) {
  return list.sort((a, b) => (b.isFollowup ? 1 : 0) - (a.isFollowup ? 1 : 0));
}
