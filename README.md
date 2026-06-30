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
| 🐾 **工作台（网页兜底版）** | [打开 →](https://diaojz.github.io/enter-key-hackathon/workbench.html) | **装不上 App 也能用** · 点「医疗诊所 A/B」即真扫真评，浏览器内看完整画像/评分/复用/映射 |
| 💻 **桌面 App 下载** | [🍎 macOS (Apple Silicon) →](https://github.com/diaojz/enter-key-hackathon/releases/download/v0.10.0/Clawd-on-Desk-0.10.0-arm64.dmg) · [🪟 Windows 11 (x64) →](https://github.com/diaojz/enter-key-hackathon/releases/download/v0.10.0/Clawd-on-Desk-Setup-0.10.0-x64.exe) | 双击装即用 · 含本地后端，**能扫本机目录** · 全部 [Release →](https://github.com/diaojz/enter-key-hackathon/releases/tag/v0.10.0) |
| 🐕 **小哒 Coda 后端（可跑）** | [看源码 →](https://github.com/diaojz/enter-key-hackathon/tree/main/coda) | Node 零依赖 · `cd coda && node server.js` → `localhost:8848` · 扫盘反推行业 + 评分/行话/复用 + 知识图谱 |
| 🎤 **路演 PPT** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E8%B7%AF%E6%BC%94PPT.html) | 8 页 · 深蓝暖金 · 浏览器按 `P` 进投影、`←→` 翻页 |
| 🗣️ **路演逐字稿** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E8%B7%AF%E6%BC%94%E7%A8%BF.html) | 对齐 PPT · 约 5 分半 · 含时间码 + 语气提示 + 商业模式口播 |
| 📋 **产品 PRD** | [打开 →](https://diaojz.github.io/enter-key-hackathon/PRD.html) | v3.0 产品中心版 · 桌面助手 + 看得见/懂业务/能裂变 |
| 🐾 **产品命名 & 形象** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E4%BA%A7%E5%93%81%E5%91%BD%E5%90%8D.html) | 小哒 Coda · 萌系形象 + icon 定稿 |
| 🎯 **选题定稿** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E9%80%89%E9%A2%98%E5%AE%9A%E7%A8%BF.html) | 最终拍板的题目 |
| 🏆 **代码资产盘点** | [打开 →](https://diaojz.github.io/enter-key-hackathon/%E4%BB%A3%E7%A0%81%E8%B5%84%E4%BA%A7.html) | 6 个跨行业项目实测可视化 · 六维雷达 + 行业/技术栈占比 + 关联图谱 |
| 🔗 **GitHub 仓库** | [github.com/diaojz/enter-key-hackathon](https://github.com/diaojz/enter-key-hackathon) | 提交物入口 |
| 🧪 **示例代码库集** | [github.com/diaojz/industry-demo-repos](https://github.com/diaojz/industry-demo-repos) | 6 个跨行业 demo 项目（扫盘演示素材） |
| 🎨 **海报 Figma 源** | [figma.com/board/...](https://www.figma.com/board/qMCO2hgdYGtgK1Kd3rDwA3) | 主视觉可编辑源文件 |

> 💡 上面是 GitHub Pages 在线链接，**点开就能在浏览器看效果**（图片、GIF 都正常）。也可 `git clone` 后本地双击 `.html`。

---

## 📌 项目说明

**应用场景**：面向**懂行业、不懂代码**的人（用 AI 写代码的产品/业务/创业者）。**小哒 Coda** 是一个常驻桌面、懂你行业的 **Review 助手**——授权后它**只读扫一遍你的本地项目**，反推出你是哪行的，先给一个**看得懂的分**让你心里有底，再用**「你那行的话」**讲清问题与改法（**只读不改**）；你越用它越懂你（人设可手改、跨项目累积），还能把攒下的轮子在**新项目里直接复用**。

**技术架构**：`扫盘引擎 → 反推行业画像 → 调 LLM 打分/行话翻译/改法` 的流水线。
- **后端**（[`agent/`](./agent)）：Python **零三方依赖**（标准库 `http.server` + `urllib`），暴露 `/scan` `/profile` `/review` `/explain` `/reuse` `/notify` `/persona` 等 REST 接口（对齐 [`Agent接口契约.html`](./Agent接口契约.html)）；扫盘 `scanner.py` 本地遍历 + 关键词反推画像（**只读**），`review.py` 调 LLM 打分。
- **LLM 可切换**：调用全收口在 `llm_client.py`，OpenAI 兼容 `/chat/completions` 协议，环境变量一键切后端（openai / deepseek / mock 离线兜底），业务代码零改动。
- **前端**：Electron 桌宠（表情/状态联动）+ 纯静态网页兜底版 [`工作台.html`](./工作台.html)（装不上 App 也能用）。
- **部署**：云端门面（自建香港服务器）+ 本地后端可用 PyInstaller 焊进桌面 App。

> **三能力**：①**会评价**（扫盘反推画像 + 跑分式打分 + 行话翻译/改法，只读不改）· ②**会解释**（反推并可手改人设 + 技术概念→行业类比 + 业务时间线）· ③**能复用**（同领域跨项目抽轮子、命中即提醒）。
> _v4 收口：Demo 高潮 =「扫存量项目→反推行业画像」；金样本行业 = 医疗。详见 [`选题定稿.html`](./选题定稿.html)。_

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

**Agent 主路径（`agent/` 目录，全部跑通 ✅）**
- [x] **①评价** —— 扫盘反推画像 + `/review` 真 LLM 打分/行话翻译/改法（只读不改）
- [x] **②解释** —— 技术概念→行业类比 + 项目阶段感知（`/explain` `/explain/stage`）
- [x] **③复用** —— 公共模块抽取 + 跨项目命中提醒（项目A入库→项目B提醒用现成轮子）
- [x] **④提醒** —— 踩红线/可复用时主动推 notification 弹桌宠气泡（`/notify`）
- [x] **人设跟随** —— 画像手改持久化 + 跨项目累积人设（越用越准，`/persona`）
- [x] **桌宠联动 + 工作台** —— 评价进度驱动表情 + coda-desktop 工作台（人设/复用/评分三块）

**收尾（必做）**
- [x] **两个医疗项目素材** —— 项目 A `clinic-demo`（已入库）+ 项目 B `clinic-new`（演复用提醒）
- [ ] **至少录一个屏** —— 评价→解释→复用→提醒→人设全链路演出来（兜底）
- [ ] **Demo 公网链接** + 路演演练 ≥2 次，卡时长
- [ ] **二期**（不进现场）：传播分享给同行、通用复用引擎、更多行业库

**奇绩创坛 2026 秋季创业营 · 算力项目申请（项目=小哒 Coda，详见 [`奇绩创坛申请进度.html`](./奇绩创坛申请进度.html)）**
- [x] **注册账号** —— 用户 ID `461157` / 手机 `16600004200` / 邮箱 `diaojz@126.com`（密码本地另存，不入库；草稿 application `113503`）
- [x] **创始人客观字段** —— 姓名 / 邮箱 / 手机已填进表单
- [ ] **客观项待补** —— ⚠️ 出生日期、职业阶段、办公城市+总部
- [ ] **项目信息区**（小哒 Coda）—— ⚠️ 待确认：一句话概括 15 字、已投入时间(年/月)、员工数(全职/兼职)、核心团队如何认识、纯科研 or 科研+创业
- [ ] **两段视频**（本人录）—— 60s 自我介绍 + 产品演示
- [ ] **主观长答题** —— 成长经历 / 最大挫折 / 行业非共识观点 / 用户是谁 / 想法来源 / 竞品 等（逐题口述誊入）
- [ ] **核对后提交** —— ⚠️ 提交后不可改、类别不可换

---

## 📁 全部文件清单

### 团队物料（产品 / 路演）
| 文件 | 用途 |
|---|---|
| [`工作台.html`](./工作台.html) | **桌面 App 的网页兜底版**（评委装不上 App 时的主入口）· 复刻 `coda-eval` 四卡布局，去 Electron 依赖，默认连云端 Agent · 点「医疗诊所 A/B」即真扫 `agent/samples/` 出完整画像/评分/复用/映射 |
| [`选题定稿.html`](./选题定稿.html) | **选题定稿 v4（当前口径）** · 扫盘 Review / 行业画像（真做）+ 跨项目复用（医疗最小切片）· 开发依据 + PPT 底稿 |
| [`Agent接口契约.html`](./Agent接口契约.html) | **Agent 接口契约** · `/profile` + `/review` 两个 API · 医疗示例 + 关键词库，给 Agent 同学照搭 |
| [`路演PPT.html`](./路演PPT.html) | 路演演讲稿 · 8 页 · 深蓝暖金风 · ✅ 已对齐 v4（扫盘 Review）· 横版海报全屏封面 |
| [`路演稿.html`](./路演稿.html) | **路演逐字稿** · 对齐 8 页 PPT，约 5 分半 · 每段挂页码 + 时间码 + 语气/动作提示 · 含商业模式 20 秒口播段 + 底部节奏总表 |
| [`商业模式应答卡.html`](./商业模式应答卡.html) | **商业模式 Q&A 应答卡**（答辩备用，不进口播）· 4 类高频追问（收费/飞轮/三重护城河/天花板）+ 5 句一句话弹药 |
| [`PRD.html`](./PRD.html) | 产品需求文档 v4 · 扫盘 Review 主线 · ✅ 已同步（评价 / 解释 / 复用） |
| [`产品命名.html`](./产品命名.html) | 产品命名定稿（小哒 / Coda · 竞品参照 / 候选方案 / 形象设定，含 icon） |
| [`代码资产.html`](./代码资产.html) | **代码资产盘点**（成就栏目）· 6 个跨行业项目实测可视化：六维能力雷达 + 行业分布 + 技术栈占比 + 关联图谱 + 对外话术 |
| [`选题脑暴.html`](./选题脑暴.html) | 选题脑暴白板（思考脉络） |
| `assets/cover-poster-wide.png` | **横版主视觉海报**（16:9 宽屏 · README 顶图 / PPT / Figma 用） |
| `assets/cover-poster.png` | 竖版主视觉海报（3:4 · PPT 封面左栏用） |
| `assets/coda-icon.png` | 产品吉祥物「小哒 / Coda」3D icon（暖橙萌精灵，米色底） |
| `assets/coda-icon-transparent.png` | 同款 icon 透明底版（叠任意背景 / 做桌宠动画母版） |

### 小哒 Coda 后端实现（Node · 可跑）
> 合并自 `feat/claude-coda-side-implementation`（Claude 侧实现）· 全部落在 [`coda/`](./coda) 目录 · **零三方依赖**（纯 Node 内置模块），无需 `npm install`。

```bash
cd coda
node server.js                 # 启动本地服务器（默认 :8848）
# 浏览器开 http://localhost:8848 → 点「项目A·诊所挂号 / 项目B·体检中心」演两幕
# 知识图谱可视化：http://localhost:8848/graph.html
node cli.js scan   fixtures/clinic-booking   # 无界面也能跑：扫盘反推行业
node cli.js review fixtures/clinic-booking   # 评审打分 + 行话翻译
```

| 文件 / 目录 | 用途 |
|---|---|
| [`coda/server.js`](./coda/server.js) | 本地服务器（serve 前端 + `/scan` `/review` `/reuse` `/persona` `/kg/*` 等接口） |
| [`coda/cli.js`](./coda/cli.js) | 命令行：`scan` / `review` / `reuse` / `extract`，无界面也能跑 |
| [`coda/scanner/`](./coda/scanner) | 扫盘引擎（只读遍历 + 词库匹配 + 权重反推行业，**0 LLM、不改任何文件**） |
| [`coda/agent/`](./coda/agent) | Agent 层：评分 / 复用 / 人设持久化 / 知识图谱 / 耦合度 / 真 LLM 集成 |
| [`coda/web/`](./coda/web) | 前端（暖米编辑风）+ 知识图谱力导向可视化 `graph.html` |
| [`coda/dict/`](./coda/dict) | 行业词库（医疗厚 + 电商/教育/金融） |
| [`coda/fixtures/`](./coda/fixtures) | Demo 素材：`clinic-booking`（项目A）/ `clinic-checkup`（项目B，演跨项目复用） |
| [`coda/README.md`](./coda/README.md) | Coda 后端完整说明（架构 / 权重算法 / 只读承诺 / 知识图谱层） |

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

## 🧪 示例代码库集（扫盘演示素材）

为「扫盘 Review / 行业画像」准备的一组**跨行业、可编译/可运行**的 demo 项目，单独成库：
**[github.com/diaojz/industry-demo-repos](https://github.com/diaojz/industry-demo-repos)**（monorepo，本地副本在 `../industry-demo-repos/`）。

| 子项目 | 行业 | 技术栈 |
|---|---|---|
| `med-his-platform` / `med-lis-lab` | 医疗（HIS / LIS） | Java / Spring Boot |
| `fin-trade-risk` | 金融（交易风控） | Go |
| `growth-marketing-platform` | 消费互联网（营销中台） | TypeScript |
| `vehicle-aftersales-iot` | 汽车 / 物流（车联网售后） | Python |
| `edu-academic-saas` | 教育 / SaaS（在线教务） | Java / Spring Boot |

每个项目都内置**行业行话 + 演示用埋点**（SQL 注入 / 明文凭证 / 并发超卖等），供扫盘引擎「反推行业 → 用行话讲问题 → 打分给改法」演示。配置中的密钥 / 口令**均为编造值**，非真实凭据。[`代码资产.html`](./代码资产.html) 是这 6 个项目的可视化盘点页。

---

## 🔌 可用资源（主办方 API）

- **Search API**：单接口、`query/sorting/filter`，做检索/RAG 首选
- **Agent API**：`opencli` responses、持续会话流、自带 Code 能力 + 记忆/Skill
- 默认额度 $20/人，不够找工作人员追加；另有奇迹算力 Token

---

*本作战中心由 Claude Code 协助维护。所有页面均为单文件 HTML，浏览器双击即开、离线可用。*
