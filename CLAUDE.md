# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库工作时提供指导。

## 语言

一律使用中文回复，技术术语和代码标识符保持原文。

## 仓库定位

「回车键」黑客松作战中心 —— Beyond Prompt: Agents in Action 黑客松（北京站）参赛队伍的现场速查资料 + 团队物料集合。

- 队名「回车键」，3 人小队，**Coding Agent** 赛道，48H 极限开发。
- 本仓库**不是应用代码仓库**，而是一组**单文件 HTML 速查页 + 团队物料**。
- 所有页面均为纯静态、无构建、无依赖：浏览器双击即开，离线可用。部分页面用 `localStorage` 存本地状态（如提交清单勾选）。

## 关联仓库：示例代码库集（不在本仓库内）

`代码资产.html` 的数据来自一个**独立仓库** `../industry-demo-repos/`（与 hackathon 同级，已推送 [github.com/diaojz/industry-demo-repos](https://github.com/diaojz/industry-demo-repos)）。它是 monorepo，含 6 个跨行业、可编译/可运行的 demo 项目（医疗 HIS/LIS-Java、金融-Go、消费互联网-TS、汽车物流-Python、教育-Java），用于「扫盘 Review / 行业画像」演示，内置行业行话 + 演示用埋点。

- 那些项目里的密钥 / 口令是**演示用编造值**（扫盘故意埋的点），不是真实凭据。
- 若改动 `代码资产.html` 的指标数据，源头是那 6 个仓库的真实统计；雷达分值抽在该页脚本顶部的 `DIMS` 数组，改一处即可。
- 三个 Java 项目用 **JDK 8** 编译（默认 JDK 17 会触发 Lombok `TypeTag::UNKNOWN`）。

## 目录约定

| 文件 | 用途 |
|---|---|
| `工作台.html` | 桌面 App（`coda-eval`）的**网页兜底版**：评委装不上 App 时直接在浏览器看完整 demo。复刻四卡布局（评分/复用/人设/行业映射），去掉 Electron 专有的选目录/拖拽，改成预置「医疗诊所 A/B」按钮，默认连云端 Agent（`code-agent-sdoy.onrender.com`）真扫 `agent/samples/`。`?apiBase=local` 可切回本地后端 |
| `手册速查.html` | 选手手册速查：赛程 / 必交清单 / 赛道 / 评审 / 福利红线（带倒计时 + 可勾选清单） |
| `评分规则.html` | 评分五维权重 + 双轨奖项机制 + 三人队作战策略 |
| `API资源.html` | 主办方 Search / Agent API 接入速查 |
| `选手名册.html` | 参赛选手名册（可搜索、可按赛道/组队状态筛选） |
| `选题脑暴.html` | 选题脑暴白板（思考脉络） |
| `选题定稿.html` | 选题定稿 |
| `代码资产.html` | 代码资产盘点（成就栏目）：6 个跨行业 demo 项目的实测可视化（六维雷达 / 行业分布 / 技术栈占比 / 关联图谱 / 对外话术）。纯 SVG 零依赖，数据来自 `../industry-demo-repos/` 实测 |
| `feishu-auth-qr.png` | 飞书读取授权二维码（一次性物料，用完可删） |
| `README.md` | 作战中心总览 + 关键信息速记 + 待办 |
| `coda/` | **小哒 Coda 评价 Agent 后端（Node 实现）**：合并自 `feat/claude-coda-side-implementation`（Claude 侧实现）。**零三方依赖**（纯 Node 内置模块），`cd coda && node server.js` 起服务（默认 `:8848`），浏览器开 `localhost:8848` 演两幕。详见下「两套后端实现」 + `coda/README.md` |
| `agent/` | **原主线后端（Python 实现）**：零三方依赖（`http.server` + `urllib`），对接 `工作台.html` / 云端 Render。详见下「两套后端实现」 |

文件名用中文，便于现场快速辨识。新增速查页延续「单文件 HTML、暖米编辑风、双击即开」的约定。

## 两套后端实现（重要：别混淆）

本仓库现存**两套互相独立、各自零依赖的评价 Agent 后端**，做同一件事（扫盘反推行业 + 评分/行话/复用），但语言、入口、端口都不同：

| | `agent/`（Python） | `coda/`（Node） |
|---|---|---|
| 来源 | 仓库原主线 | 合并自 `feat/claude-coda-side-implementation`（Claude 侧实现） |
| 语言 | Python，标准库 `http.server` + `urllib` | Node，纯内置模块 |
| 启动 | 见 `agent/` 启动脚本 | `cd coda && node server.js` |
| 端口 | 对接云端 Render / 工作台.html | 默认 `:8848` |
| 接口 | `/scan` `/profile` `/review` `/explain` `/reuse` `/notify` `/persona` | `/scan` `/review` `/reuse` `/persona` `/kg/*` 等 |
| 前端 | `工作台.html`（网页兜底）+ Electron 桌宠 | `coda/web/`（含知识图谱可视化 `graph.html`） |

- **`工作台.html` 默认连的是 `agent/`（云端 Render）**，不是 `coda/`。两者不要混接。
- `coda/` 多了一层**知识图谱**（`coda/agent/kg.js` + `coda/web/graph.html`，存 `~/.coda/kg.json`），`agent/` 没有。
- 改后端时先确认改的是哪一套：扫盘演示主线 / 工作台对接走 `agent/`；Claude 侧 Node 实现 + 知识图谱走 `coda/`。

## 常用命令

无构建系统。直接用系统默认浏览器打开页面预览：

```bash
open 手册速查.html
open 选题定稿.html
```

Git 基础操作：

```bash
git status
git add <文件>
git commit -m "<一句话中文说明>"
```

## 修改时的注意点

- 改任意 HTML 页只需产出代码，不必额外验证 UI 效果（用户自行 `open` 查看）。
- 视觉风格统一为「暖米编辑风」（暖米底 + 橙色 accent），新页面应对齐既有页的配色与排版。
- `README.md` 是对外（评委/队友）入口，信息务必与实际文件保持同步。
- 不要把 `.env`、密钥、飞书凭证等敏感信息提交进仓库。
