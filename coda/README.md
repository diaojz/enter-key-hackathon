# 小哒 Coda · Demo 实现

> 常驻桌面、**只读不改**、懂你行业的 Review 助手。
> 授权后扫一遍你的本地项目，**反推你是哪行的**，用「你那行的话」给代码打分、讲问题、给改法；同行业的老轮子还能在新项目里直接复用。
>
> 回车键团队 · Coding Agent 赛道 · 详见上级 `../方案设计.md`

---

## 快速运行（30 秒起跑）

```bash
cd coda
node server.js                      # 启动本地服务器（默认 :7777）
# 浏览器打开 http://localhost:7777
```

- 点「**项目A · 诊所挂号**」→ 看炸场反推 + 质量报告（第一幕）
- 点「**项目B · 体检中心**」→ 看跨项目复用弹窗（第二幕）
- 输入框可填**任意目录**（相对 `coda/` 或绝对路径）——评委随便给个目录都能扫。

### 命令行（无界面也能跑）

```bash
node cli.js scan   fixtures/clinic-booking     # 扫盘反推行业
node cli.js review fixtures/clinic-booking     # 评审打分 + 行话翻译
node cli.js reuse  fixtures/clinic-checkup     # 复用命中检查
# 入库工具（半自动预抽，提前做、不在现场）：
node cli.js extract <file> --as "患者ID校验" --industry medical --intent "patientId,身份证校验"
```

---

## 架构（三模块数据流 · 方案 §6）

```
① 扫盘引擎 scanner/        ② Agent 层 agent/            ③ 前端/桌宠 web/
  递归只读遍历              /profile 扫盘→画像             画像卡(可手改)
  命中行业词库 dict/        /review  画像+文件→打分+行话      报告页(分+翻译+红线+改法)
  权重反推行业  ───JSON──▶  /reuse   命中同行业轮子   ───JSON──▶  复用弹窗 + 桌宠状态
```

| 模块 | 文件 | 职责 | 不做什么 |
|---|---|---|---|
| 扫盘引擎 | `scanner/scan.js` | 遍历、词库匹配、权重反推行业 | **不调 LLM、不改任何文件** |
| Agent 层 | `agent/profile.js`·`review.js`·`reuse.js` | 画像 / 评审打分 / 复用命中 | **不落盘 diff、不自动重构** |
| 真 API 挂钩 | `agent/llm.js` | 可选接主办方 Agent API 精修文案 | 未配 Key 时全走规则引擎 |
| 前端/桌宠 | `web/` | 画像卡、报告页、复用弹窗、桌宠 | 不做账号/多用户 |
| 词库 | `dict/*.json` | 医疗(厚) + 电商/教育/金融(候选) | —— |
| 复用库 | `industry-lib/medical.json` + `snippets/` | W1 患者ID校验 / W2 就诊状态机 | —— |

### 权重算法（方案 §7.3，可答辩）

```
score(ind)      = Σ_cat [ weight(cat) × hitFiles(cat) × log(1 + hitCount(cat)) ]
confidence(ind) = score(ind) / Σ score(all_industries)
```
- 用 **hitFiles（命中文件数）** 而非高频次数 —— 类别覆盖广度 > 单词刷量
- `log(1+count)` 平滑，防高频词独大
- 证据词**带 file:line**，现场可溯源、可验证

---

## 🔒 只读不改（安全承诺 · 代码层强制）

- 扫盘引擎**仅**用 `fs.readFileSync/readdirSync/statSync/openSync/readSync`——全文件无 `writeFile/unlink/rename`（可代码审查）。
- Agent 层**只输出文本**（problem / fix），**永不返回可执行 patch/diff**。
- 前端**没有「应用修改」按钮**，只有「复制改法建议」。
- 唯一写盘：`~/.coda/profile.json`（本应用状态，存用户手改的画像，演「越用越懂你」）——**绝不碰被扫项目**。

---

## Demo 两幕（方案 §12）

**第一幕 · 炸场**：扫项目A → 「我猜你是做**医疗**的 99%」+ 证据词 → 报告 54 分屎山预警 → 念行话「患者隐私字段裸奔，违反医疗红线」→ 展开「怎么改」→ 画像卡改行业/行话，保存即生效。

**第二幕 · 升华**：扫项目B（另一医疗项目）→ 小哒认出同行业 → 弹「你做过类似的」→ W1/W2 预抽轮子，直接复制复用。

> 兜底：未配 API Key 也**完全可跑**（规则引擎确定性产出）；炸场点（扫盘反推）本就 0 LLM，断网照演。

---

## 目录

```
coda/
├── server.js              本地服务器（serve 前端 + /api/*）
├── cli.js                 命令行：scan/review/reuse/extract
├── scanner/scan.js        扫盘引擎（只读 + 权重反推）
├── agent/                 profile / review / reuse / llm / redlines / jargons
├── dict/                  行业词库（medical 厚 + ecommerce/education/finance）
├── industry-lib/medical.json  复用轮子库（W1/W2）
├── snippets/              打磨好的可复用片段
├── web/                   index.html / app.js / style.css（暖米编辑风 + 桌宠）
└── fixtures/              Demo 素材：clinic-booking(项目A) / clinic-checkup(项目B)
```

## 可选：接主办方 Agent API（精修行话文案）

```bash
export CODA_AGENT_API_KEY=你的key
export CODA_AGENT_API_URL=https://...   # opencli responses 端点
node server.js                          # /review 自动走真 LLM，失败回退规则引擎
```

---

## 🕸️ 知识图谱层（KG · 飞轮+可视化）

把每次扫盘的产出沉淀成一张**跨项目知识图谱**：既是「你的项目地图」，也是「越用越懂你」的用户画像飞轮 —— 同行业的轮子、踩过的红线、惯用的行业词，都在图里串成网，新项目一进来就能秒查类比。

### 实体（Node Labels）

| Label | 含义 | ID 格式 |
|---|---|---|
| `User` | 本地用户（单机一人，演示用） | `U:local` |
| `Project` | 被扫的项目（带 visits/score/industry 等画像 props） | `P:<absRoot>` |
| `Industry` | 行业（medical / ecommerce / education / finance …） | `I:<key>` |
| `IndustryWord` | 行业词（带类别 + 跨项目命中聚合） | `IW:<industry>::<word>` |
| `File` | 项目内文件（带语言 + 单文件评分） | `F:<projectId>::<relPath>` |
| `Wheel` | 复用轮子（W1 患者ID校验 / W2 就诊状态机 …） | `W:<industry>::<wheelKey>` |
| `Redline` | 行业红线（隐私裸奔 / 身份核验弱 …） | `R:<industry>::<redlineName>` |

### 关系（Edge Types）

| Type | from → to | 含义 |
|---|---|---|
| `OWNS` | User → Project | 我看过这个项目 |
| `IS_IN` | Project → Industry | 反推出该项目属于哪行 |
| `CONTAINS` | Project → File | 包含的文件 |
| `INDICATES` | File → IndustryWord | 文件命中行业词（带 loc 可溯源） |
| `BELONGS_TO` | IndustryWord → Industry | 行业词归属 |
| `REUSES` | Project → Wheel | 该项目命中可复用轮子 |
| `VIOLATES` | Project → Redline | 该项目触发的行业红线 |
| `SIMILAR_TO` | Project ↔ Project | 同行业项目相似度（词/红线/轮子 Jaccard 加权） |

### 存储

单文件 JSON 图：`~/.coda/kg.json`（原子写：先写 `.tmp` 再 `rename`，防崩溃半截损坏）。同项目反复扫**幂等**，只更新 props（visits / lastSeen / hitCountTotal），不膨胀节点/边。

### 接口

| 路由 | 用途 |
|---|---|
| `GET /kg/graph` | 整图 dump（force-directed 友好的 `{nodes, links}`） |
| `GET /kg/related?nodeId=X` | 指定节点的 N 跳邻居子图（含边） |
| `GET /kg/similar?project=root` | 该项目的同行业姊妹项目（按 SIMILAR_TO 权重降序） |

### 可视化

浏览器开 [`http://localhost:8848/web/graph.html`](http://localhost:8848/web/graph.html)（`server.js` 已挂 `web/` 静态路由），也可 `file://` 直接拖 `web/graph.html` 进浏览器离线看。

### 一句话「类比学习法」

KG 把链路串起来 —— **行业词**（INDICATES）→ **行业**（BELONGS_TO / IS_IN）→ **红线**（VIOLATES）→ **改法**（同行业 Wheel 通过 REUSES 反查 + SIMILAR_TO 姊妹项目里的实战修法），新项目一进来，沿着 `File → Word → Industry → Redline → Wheel` 这条边走两跳，就能直接「类比抄作业」。
