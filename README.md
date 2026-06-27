# 回车键 · 黑客松作战中心

<p align="center">
  <img src="./assets/cover-poster-wide.png" alt="回车键 · Enter 一下，世界开始运行" width="760">
</p>

[![GitHub](https://img.shields.io/badge/GitHub-enter--key--hackathon-181717?logo=github)](https://github.com/diaojz/enter-key-hackathon)
[![赛道](https://img.shields.io/badge/赛道-Coding%20Agent-ff7a00.svg)](#)
[![产品](https://img.shields.io/badge/产品-小哒%20Coda-e8a84a.svg)](./PRD.html)

> **小哒 Coda** · 一个常驻桌面、懂你行业的 Coding Agent 助手
> 队名 **回车键** · 3 人小队 · **Coding Agent** 赛道 · 48H 极限开发
> Beyond Prompt: Agents in Action 黑客松 · 北京站 · 微软大厦二号楼

---

## 🚀 快速直达（点链接打开，本地 clone 后双击即开）

> 📌 **当前阶段：物料/PPT/PRD 全部对齐 v4 + 已上线 → 待打 Agent（扫盘引擎 + /profile、/review）**
> ⏰ **下一个硬截止：6/28 14:30 全部提交** · 路演 6/28 16:00（每队 6 min）
> 🌐 **在线站点：https://diaojz.github.io/enter-key-hackathon/** ← 点链接直接在浏览器打开，图 / GIF 都在

| 看什么 | 在线打开（点开即看） | 一句话 |
|---|---|---|
| 🎤 **路演 PPT** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E8%B7%AF%E6%BC%94PPT.html) | 8 页 · 深蓝暖金 · 浏览器按 `P` 进投影、`←→` 翻页 |
| 📋 **产品 PRD** | [打开 →](https://diaojz.github.io/enter-key-hackathon/PRD.html) | v3.0 产品中心版 · 桌面助手 + 看得见/懂业务/能裂变 |
| 🐾 **产品命名 & 形象** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E4%BA%A7%E5%93%81%E5%91%BD%E5%90%8D.html) | 小哒 Coda · 萌系形象 + icon 定稿 |
| 🎯 **选题定稿** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E9%80%89%E9%A2%98%E5%AE%9A%E7%A8%BF.html) | 最终拍板的题目 |
| 🔗 **GitHub 仓库** | [github.com/diaojz/enter-key-hackathon](https://github.com/diaojz/enter-key-hackathon) | 提交物入口 |
| 🎨 **海报 Figma 源** | [figma.com/board/...](https://www.figma.com/board/qMCO2hgdYGtgK1Kd3rDwA3) | 主视觉可编辑源文件 |

> 💡 上面是 GitHub Pages 在线链接，**点开就能在浏览器看效果**（图片、GIF 都正常）。也可 `git clone` 后本地双击 `.html`。

---

## 📌 一句话产品定位

> **小哒 Coda** 是一个常驻桌面、懂你行业的 **Review 助手**——
> 授权后它**扫一遍你的本地项目**，反推出你是哪行的，用**「你那行的话」**把代码问题讲给你听、打分给建议（**只读不改**）；你越用它越懂你，还能把你攒下的轮子在**新项目里直接复用**。
>
> **三能力**：看得见（桌宠 + 收窄监听）· **懂业务（扫盘→行业画像→翻译报告，现场真做主线）** · 能复用（同领域跨项目复用轮子）。
> _v4 收口：Demo 高潮由「插件裂变」改为「扫存量项目→反推行业画像」；「懂业务」由纸面升为现场真做；金样本行业 = 医疗。详见 [`选题定稿.html`](./选题定稿.html)。_

---

## ⏰ 赛程 & 必交清单（硬截止）

- **6/28 14:30** —— 全部提交截止（Demo 链接 / 录屏 / GitHub / PPT）
- **6/28 16:00–17:30** —— 正式路演，每队 6 min（4 讲 + 2 答）

**必交清单（缺一不可）**
1. 路演 PPT（≤7 页，可 HTML，别嵌视频）— 强烈建议
2. Demo 公网可访问链接 — **必须**
3. 完整 Demo 录屏 — **必须**
4. 说明文档 + **GitHub 链接** — **必须**

**评分五维（权重依次递减）**
创新性 > 产品完成度 > 技术深度 > 商业价值 > Demo 表现 → 主攻「创新性」+ 核心流程跑通 > 功能堆多。

---

## ⏭️ 下一步（待办）

> 🎯 **主线已锁 v4**：扫盘 Review，能力按排名 **①评价 → ②解释 → ③复用**（人设跟随贯穿、提醒辅助、传播留二期）。**只做关键主路径，不强求全实现。**

**已完成**
- [x] **定选题 + PRD + 路演 PPT 全部收口到 v4** —— 评价/解释/复用排名（[`选题定稿.html`](./选题定稿.html) / [`PRD.html`](./PRD.html) / [`路演PPT.html`](./路演PPT.html)）
- [x] **Agent 接口契约** —— `/profile` + `/review` 两个 API + 医疗示例 + 关键词库（[`Agent接口契约.html`](./Agent接口契约.html)）

**今晚（先把 Agent 打好）**
- [ ] **打 Agent · ①评价** —— 扫盘引擎（遍历目录 + 中英文医疗关键词 → `{行业, 证据词, 文件清单}`）+ `/profile` 反推画像 + `/review` 打分/行话翻译/改法（只读不改）

**明早（时间不多，按排名跑通主路径）**
- [ ] **②解释** —— 用行业白话讲 coding：把技术概念/阶段翻译成用户行业语言，让用户知道现在在哪一步
- [ ] **③复用** —— 医疗能力库：项目 A 抽 1~2 个轮子（患者 ID 校验 / 就诊状态机）→ 项目 B 命中提醒「有现成的」→ 给片段（时间够再上）
- [ ] **前端 / 桌宠 + UI** —— 桌宠入口 + 画像卡可编辑 + 报告页（**UI 由队友设计，设计完与主线对一下**）
- [ ] **人设跟随** —— 扫盘/复用产出反向丰富画像，越用越准

**收尾（必做）**
- [ ] **预备两个医疗项目素材** —— 项目 A（已扫、轮子入库）+ 项目 B（当场扫）
- [ ] **至少录一个屏** —— 把评价→解释→复用主路径演示出来（扫盘→画像→打分+翻译报告全流程，兜底）
- [ ] **Demo 公网链接** + 路演演练 ≥2 次，卡时长

---

## 📁 全部文件清单

### 团队物料（产品 / 路演）
| 文件 | 用途 |
|---|---|
| [`选题定稿.html`](./选题定稿.html) | **选题定稿 v4（当前口径）** · 扫盘 Review / 行业画像（真做）+ 跨项目复用（医疗最小切片）· 开发依据 + PPT 底稿 |
| [`Agent接口契约.html`](./Agent接口契约.html) | **Agent 接口契约** · `/profile` + `/review` 两个 API · 医疗示例 + 关键词库，给 Agent 同学照搭 |
| [`路演PPT.html`](./路演PPT.html) | 路演演讲稿 · 8 页 · 深蓝暖金风 · ✅ 已对齐 v4（扫盘 Review）· 横版海报全屏封面 |
| [`PRD.html`](./PRD.html) | 产品需求文档 v4 · 扫盘 Review 主线 · ✅ 已同步（评价 / 解释 / 复用） |
| [`产品命名.html`](./产品命名.html) | 产品命名定稿（小哒 / Coda · 竞品参照 / 候选方案 / 形象设定，含 icon） |
| [`选题脑暴.html`](./选题脑暴.html) | 选题脑暴白板（思考脉络） |
| `assets/cover-poster-wide.png` | **横版主视觉海报**（16:9 宽屏 · README 顶图 / PPT / Figma 用） |
| `assets/cover-poster.png` | 竖版主视觉海报（3:4 · PPT 封面左栏用） |
| `assets/coda-icon.png` | 产品吉祥物「小哒 / Coda」3D icon（暖橙萌精灵，米色底） |
| `assets/coda-icon-transparent.png` | 同款 icon 透明底版（叠任意背景 / 做桌宠动画母版） |

### 现场速查（赛事资料）
| 文件 | 用途 |
|---|---|
| [`手册速查.html`](./手册速查.html) | 选手手册速查（赛程/必交清单/赛道/评审/福利红线，带倒计时 + 可勾选清单） |
| [`评分规则.html`](./评分规则.html) | 评分五维权重 + 双轨奖项机制 + 三人队作战策略 |
| [`主办方.html`](./主办方.html) | 主办方「小宿科技」公司速查（定位/数字/产品/打法启示） |
| [`API资源.html`](./API资源.html) | 主办方 Search / Agent API 接入速查 |
| [`选手名册.html`](./选手名册.html) | 73 名参赛选手名册（可搜索、可筛选） |
| `feishu-auth-qr.png` | 飞书读取授权二维码（一次性，已用完可删） |

---

## 🔌 可用资源（主办方 API）

- **Search API**：单接口、`query/sorting/filter`，做检索/RAG 首选
- **Agent API**：`opencli` responses、持续会话流、自带 Code 能力 + 记忆/Skill
- 默认额度 $20/人，不够找工作人员追加；另有奇迹算力 Token

---

*本作战中心由 Claude Code 协助维护。所有页面均为单文件 HTML，浏览器双击即开、离线可用。*
