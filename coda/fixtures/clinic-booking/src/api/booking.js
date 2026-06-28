// 挂号预约 API —— ⚠️ 演示用，含就诊时段并发红线
const slots = new Map(); // key: 日期+时段 -> 患者ID

// 患者预约某就诊时段：check-then-create，未加锁，存在竞态
export async function bookAppointment(patientId, date, slot) {
  const key = `${date}_${slot}`;
  // 先查该时段是否已被挂号
  const existing = slots.get(key);
  if (existing) {
    throw new Error('该就诊时段已被挂号');
  }
  // 模拟异步落库（高并发下两个患者可同时走到这里 → 撞同一号）
  await persist(key, patientId);
  slots.set(key, patientId);
  return { ok: true, patientId, date, slot, status: '已挂号' };
}

async function persist(key, patientId) {
  await new Promise((r) => setTimeout(r, 20)); // 模拟 DB 写入延迟
  return true;
}

// 查询候诊队列
export function getQueue(date) {
  const queue = [];
  for (const [key, pid] of slots.entries()) {
    if (key.startsWith(date)) queue.push({ slot: key, patientId: pid });
  }
  return queue;
}
