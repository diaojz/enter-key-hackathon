// coda · 前端逻辑 —— 调 /api/analyze，渲染画像/报告/复用；驱动桌宠状态
'use strict';

const $ = (id) => document.getElementById(id);
let lastData = null;       // 最近一次分析结果
let editedProfile = null;  // 用户手改后的画像

// ── 桌宠状态 ────────────────────────────────────────────────
// 每个状态：[图片文件, emoji 兜底, 气泡文案]。图片在 coda/web/pet/，由 server.js 的 /pet/ 路由提供。
const PET = {
  idle:      ['idle.png',      '🐾', '嗨，我是小哒 🐾<br>给我个项目目录，我扫一眼就懂你～'],
  scan:      ['scan.gif',      '🔍', '<span class="spin">🔍</span> 扫盘中…<br>正在翻你的变量名、文件名、注释找行业线索'],
  think:     ['think.gif',     '💭', '让我想想…<br>在反推你是哪个行业的'],
  done:      ['done.png',      '✅', '搞定！<br>报告出来了，注意——我只读不改 🔒'],
  ask:       ['ask.png',       '🙋', '画像可以改哦<br>改完保存，下次我更懂你'],
  busy:      ['busy.gif',      '🤹', '手忙脚乱但靠谱～<br>多件事一起扛着呢'],
  happy:     ['happy.gif',     '🤩', '哇，这分数漂亮！<br>代码质量在线 ✨'],
  worry:     ['worry.png',     '😰', '注意点哦…<br>我闻到几条红线的味道'],
  reuse:     ['reuse.png',     '💡', '灵光一现！<br>这块好像有现成的轮子可复用'],
  sleep:     ['sleep.gif',     '😴', '没活的时候我就眯一会儿…<br>有事叫我 zzz'],
  error:     ['error.gif',     '😵', '诶？出了点状况<br>我有点懵，再试一次？'],
  celebrate: ['celebrate.gif', '🎉', '全部搞定，撒花！<br>这一轮干得漂亮 🎊'],
};
// 后端 7 阶段 → 桌宠状态映射（前端轮询/SSE 可直接喂阶段名）
const PHASE_TO_STATE = {
  scan: 'scan', profile: 'think', llm: 'think', redlines: 'worry',
  score: 'busy', reuse: 'reuse', kg: 'busy', complete: 'done',
};
function petByPhase(phase) { pet(PHASE_TO_STATE[phase] || 'busy'); }

function pet(state) {
  const entry = PET[state] || PET.idle;
  const [img, fallback, msg] = entry;
  const el = $('petDog');
  if (el) {
    // 用图片渲染；加载失败回退到 emoji，保证永不空白
    el.innerHTML = '';
    const im = new Image();
    im.src = `/pet/${img}`;
    im.alt = state;
    im.className = 'pet-img';
    im.onerror = () => { el.textContent = fallback; };
    el.appendChild(im);
  }
  $('petBubble').innerHTML = msg;
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ── 扫盘动画（视觉，真数据来自接口）────────────────────────
async function scanAnimation(files) {
  const box = $('scanbox'); box.classList.remove('hidden'); box.innerHTML = '';
  const show = files.slice(0, 40);
  for (let i = 0; i < show.length; i++) {
    const ln = document.createElement('div');
    ln.className = 'ln';
    ln.innerHTML = `<b>读取</b> ${show[i]}`;
    box.appendChild(ln);
    box.scrollTop = box.scrollHeight;
    if (box.children.length > 7) box.removeChild(box.firstChild);
    await sleep(28);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 主流程 ──────────────────────────────────────────────────
async function runAnalyze(dir) {
  pet('scan');
  $('scanBtn').disabled = true;
  ['boomSec', 'profileSec', 'reportSec'].forEach((id) => $(id).classList.add('hidden'));
  try {
    // 先取扫盘文件列表跑动画
    const scanRes = await fetch(`/api/scan?dir=${encodeURIComponent(dir)}`).then((r) => r.json());
    await scanAnimation(scanRes.allFiles || []);
    pet('think'); await sleep(350);

    const data = await fetch(`/api/analyze?dir=${encodeURIComponent(dir)}`).then((r) => r.json());
    if (data.error) { toast('扫描失败：' + data.error); pet('idle'); return; }
    lastData = data; editedProfile = null;
    renderBoom(data);
    renderProfile(data.profile);
    renderReport(data.report);
    pet('done');
    if (data.reuse && data.reuse.hits.length) setTimeout(() => renderReuse(data.reuse), 900);
  } catch (e) {
    toast('出错了：' + e.message); pet('idle');
  } finally {
    $('scanBtn').disabled = false;
  }
}

// ── 炸场卡 ──────────────────────────────────────────────────
function renderBoom(data) {
  const p = data.profile;
  const pct = Math.round((p.confidence || 0) * 100);
  $('boomSec').classList.remove('hidden');
  $('guessLabel').textContent = `${p.label} ${p.emoji}`;
  const ring = $('ring'); ring.style.setProperty('--p', pct);
  $('ringNum').innerHTML = `${pct}<small>%</small>`;
  // 其他候选
  const others = (p.candidates || []).slice(1)
    .map((c) => `${c.label} ${Math.round(c.confidence * 100)}%`).join(' · ');
  $('cands').textContent = others ? `其他候选：${others}` : '';
  // 证据词（带首现文件，可溯源）
  $('evChips').innerHTML = (p.evidence || []).map((e) =>
    `<span class="chip"><b>${esc(e.word)}</b> ×${e.count} <span class="loc">首现 ${esc(e.file)}</span></span>`
  ).join('');
}

// ── 画像卡（可编辑）─────────────────────────────────────────
function renderProfile(p) {
  $('profileSec').classList.remove('hidden');
  // 行业 label（可编辑）
  $('pIndustry').innerHTML =
    `<span class="tag editable" contenteditable data-f="label">${esc(p.label)}</span>` +
    `<span class="tag">置信度 ${Math.round((p.confidence||0)*100)}%</span>` +
    (p.edited ? `<span class="tag">已手改</span>` : '');
  $('pSummary').innerHTML = `<span class="tag editable" contenteditable data-f="summary">${esc(p.summary)}</span>`;
  $('pRedlines').innerHTML = (p.redlines || []).map((r) =>
    `<span class="tag red">${esc(r.name)} · ${r.level}</span>`).join('') || '<span class="tag">—</span>';
  $('pJargons').innerHTML = (p.jargons || []).map((j, i) =>
    `<span class="tag editable" contenteditable data-f="jargon" data-i="${i}">${esc(j)}</span>`).join('');
  pet('ask');
}

function collectEdited() {
  const base = lastData.profile;
  const label = q('[data-f="label"]')?.textContent.trim() || base.label;
  const summary = q('[data-f="summary"]')?.textContent.trim() || base.summary;
  const jargons = [...document.querySelectorAll('[data-f="jargon"]')].map((n) => n.textContent.trim()).filter(Boolean);
  return { industry: base.industry, label, emoji: base.emoji, summary,
           jargons, redlines: base.redlines };
}

async function saveProfile() {
  const prof = collectEdited();
  await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prof) });
  toast('✅ 画像已保存，重新扫盘即按新画像走');
  pet('done');
}

// ── 报告 ────────────────────────────────────────────────────
function renderReport(r) {
  $('reportSec').classList.remove('hidden');
  const s = r.score;
  const cls = s >= 85 ? 's-good' : s >= 70 ? 's-warn' : s >= 50 ? 's-bad' : 's-worst';
  const el = $('score'); el.textContent = s; el.className = `score ${cls}`;
  $('scoreLvl').textContent = r.scoreLevel;
  $('reportSum').textContent = r.summary;
  $('issues').innerHTML = (r.issues || []).map((i) => `
    <div class="issue ${i.redlineLevel}">
      <div><span class="lvlbadge ${i.redlineLevel}">${lvlText(i.redlineLevel)}</span><span class="name">${esc(i.redlineName)}</span></div>
      <div class="prob">${esc(i.problem)}</div>
      <div class="loc">📍 ${esc(i.loc)}</div>
      <details><summary>技术细节（给专业用户）</summary><div class="tech">${esc(i.techDetail)}</div></details>
      <div class="fix"><span class="ft">怎么改 ↓</span>${esc(i.fix)}
        <button class="btn ghost sm copybtn" data-fix="${esc(i.fix)}">复制改法</button></div>
    </div>`).join('') || '<p style="color:var(--sub)">未发现明显红线问题，代码质量良好 ✅</p>';
}

// ── 复用弹窗 ────────────────────────────────────────────────
function renderReuse(reuse) {
  $('reuseModal').classList.remove('hidden');
  $('reuseSub').textContent = `小哒认出这是你「${reuse.industry === 'medical' ? '医疗' : reuse.industry}」领域的项目——以下轮子来自你做过的项目，直接拿去用，不用重写。`;
  $('wheels').innerHTML = reuse.hits.map((h) => `
    <div class="wheel">
      <span class="ms">匹配度 ${Math.round(h.matchScore*100)}%</span>
      <div class="wt">${esc(h.name)}</div>
      <div class="wd">${esc(h.desc)}</div>
      <div class="src">来源项目：${esc(h.sourceProject)} · ${esc(h.file)}</div>
      <details><summary style="cursor:pointer;font-size:12.5px;color:var(--accent);margin-top:8px">查看片段全文</summary>
        <pre>${esc(h.snippet)}</pre></details>
      <button class="btn sm" style="margin-top:9px" data-snippet="${esc(h.snippet)}">📋 复制片段</button>
    </div>`).join('');
}

// ── 工具 ────────────────────────────────────────────────────
const q = (sel) => document.querySelector(sel);
function esc(s) { return String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function lvlText(l){ return l==='high'?'高危红线':l==='medium'?'中危':'提示'; }
async function copy(text){ try{ await navigator.clipboard.writeText(text); toast('📋 已复制'); }catch{ toast('复制失败'); } }

// ── 事件绑定 ────────────────────────────────────────────────
$('scanBtn').onclick = () => runAnalyze($('dir').value.trim());
document.querySelectorAll('.quick [data-dir]').forEach((b) =>
  b.onclick = () => { $('dir').value = b.dataset.dir; runAnalyze(b.dataset.dir); });
$('saveProfile').onclick = saveProfile;
$('resetBtn').onclick = async () => { await fetch('/api/profile/reset',{method:'POST'}); toast('↺ 画像已重置'); };
$('closeReuse').onclick = () => $('reuseModal').classList.add('hidden');
document.addEventListener('click', (e) => {
  if (e.target.dataset.fix != null) copy(e.target.dataset.fix);
  if (e.target.dataset.snippet != null) copy(e.target.dataset.snippet);
});

// ── 桌宠右键菜单 ────────────────────────────────────────────
const petMenu = $('petMenu');
function showPetMenu(x, y) {
  petMenu.hidden = false;
  // 先显出来量尺寸，再夹住不超出视口
  const w = petMenu.offsetWidth, h = petMenu.offsetHeight;
  petMenu.style.left = Math.min(x, innerWidth - w - 8) + 'px';
  petMenu.style.top = Math.max(8, y - h) + 'px';
}
function hidePetMenu() { petMenu.hidden = true; }

document.querySelector('.pet').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showPetMenu(e.clientX, e.clientY);
});
petMenu.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  hidePetMenu();
  if (action === 'graph') {
    // 相对路径打开 → 同源，graph.html 自动跟随当前端口
    window.open('graph.html', '_blank');
  } else if (action === 'reload') {
    const dir = $('dir').value.trim();
    if (dir) runAnalyze(dir); else toast('先填个项目目录');
  } else if (action === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
// 点别处 / Esc / 滚动 关菜单
document.addEventListener('click', (e) => { if (!petMenu.contains(e.target)) hidePetMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePetMenu(); });
window.addEventListener('scroll', hidePetMenu, { passive: true });

// 性能：标签页切到后台时暂停桌宠浮动动画，省 CPU
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('pet-paused', document.hidden);
});

pet('idle');
