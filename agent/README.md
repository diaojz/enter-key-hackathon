# 小哒 Coda · 评价 Agent（①评价 · 主路径第一棒）

扫盘 → 反推行业画像 → 打分 + 行话翻译 + 改法建议。**只读不改。**
对齐 [`../Agent接口契约.html`](../Agent接口契约.html) 的 `/profile` + `/review`。

## ⚡ 启动须知（先读这段，少踩坑）

**一键启动，别手动起进程**：

```bash
cd agent
./start.sh          # 默认 8848，可传端口：./start.sh 8848
```

它会自动：加载密钥（`.env.local`）→ **杀掉占端口的旧进程** → 重启 → 健康检查 → 真实 LLM 自测。
看到 `LLM 自测：通了 ✅` 就说明评审能出 AI 内容了。

**密钥放哪**：复制 `.env.local.example`（若无则手建）为 `agent/.env.local`，填入：

```bash
CODA_LLM_BACKEND=openai
OPENAI_BASE_URL=https://api.openai-next.com/v1   # 中转站，注意是 api. 不是 credits.
OPENAI_API_KEY=<主办方控制台「API Key」那把，sk-DY7H… 那种>
CODA_LLM_MODEL=gpt-4o-mini                        # 或 gpt-5
```

> `.env.local` 已被 `.gitignore` 忽略，**绝不提交**。换 key 只改这一行，重跑 `./start.sh` 即可。

**两个真踩过的坑**：

1. **用错 key**：主办方发的是中转站 `api.openai-next.com` 的 key（控制台「API Key」标签里那把）。
   别拿成 OpenAI 官方的 `sk-proj-…`——那把直连官方且额度耗尽，会让评审一直走兜底/卡住。
   base_url 也必须配成中转站地址，两者要配对。
2. **改了代码/换了 key 却没重启**：旧进程跑的是内存里的老版本/老 key。
   永远用 `./start.sh` 重启（它会先杀旧进程），别用裸 `python3 server.py`。

---

## 跑起来

```bash
cd agent

# CLI 一条龙（扫盘→画像→评价）
python3 scan.py samples/clinic-demo

# 只扫盘出画像，不调 LLM（炸场点，纯本地、秒出、零依赖）
python3 scan.py samples/clinic-demo --no-llm

# 输出 JSON（给前端/管道）
python3 scan.py samples/clinic-demo --json

# 起 HTTP 服务（暴露 /profile /review /scan）
python3 server.py 8848
```

## 后端可换（关键设计）

LLM 调用全收口在 [`llm_client.py`](./llm_client.py)，用环境变量切后端，业务代码零改动：

```bash
CODA_LLM_BACKEND=openai   python3 scan.py <dir>   # 默认，OpenAI 兼容协议
CODA_LLM_BACKEND=deepseek python3 scan.py <dir>   # 用 DEEPSEEK_API_KEY
CODA_LLM_BACKEND=mock     python3 scan.py <dir>   # 离线兜底，出假数据验证链路
```

**当前用的后端（已跑通）**：主办方提供的 OpenAI 兼容中转 `api.openai-next.com`。
key 不入库——配在 `agent/.env.local`（见上方「启动须知」），`./start.sh` 会自动注入。
临时用 CLI 想手动注入也行：

```bash
export OPENAI_API_KEY="<中转站 key>"
export OPENAI_BASE_URL="https://api.openai-next.com/v1"
export CODA_LLM_MODEL="gpt-4o-mini"
python3 scan.py samples/clinic-demo
```

> 该中转套了 Cloudflare，请求头已带常见 User-Agent 绕过 1010 拦截（见 `llm_client.py`）。

可选环境变量：`OPENAI_BASE_URL`、`CODA_LLM_MODEL`。业务代码不依赖具体后端。

## HTTP API（对齐接口契约）

| 方法 | 路径 | 入参 | 出参 | 功能 |
|---|---|---|---|---|
| POST | `/scan` | `{"root"}` | 画像+评价+复用+复用提醒+阶段+人设一条龙 | 主入口 |
| POST | `/profile` | `{"root"}` 或 `{"scan"}` | 行业画像（含手改覆盖） | ①评价 |
| POST | `/review` | `{"profile","file"}` | `{score, issues[]}` | ①评价 |
| POST | `/reuse` | `{"root"}` | `{reuse:{candidates[]}}` | ③复用 |
| POST | `/explain` | `{"profile","term"}` | `{explain:{plain,why}}` | ②解释 |
| POST | `/explain/stage` | `{"root"}` | `{stage:{stage,analogy,next}}` | ②解释 |
| POST | `/notify` | `{"root"}` | `{alerts[]}` + 推桌宠通知 | ④提醒 |
| POST | `/profile/override` | `{"root","override"}` | 保存画像覆盖 | 人设跟随 |
| GET | `/profile/override?root=` | — | `{override}` | 人设跟随 |
| GET | `/persona` | — | `{persona:{headline,skills,...}}` | 人设跟随 |
| GET | `/health` | — | `{ok:true}` | — |

```bash
curl -s localhost:8848/scan -d '{"root":"samples/clinic-demo"}'
```

## 文件

| 文件 | 作用 |
|---|---|
| `keywords.py` | 行业关键词库（医疗做厚，余行业种子词）+ 红线清单 |
| `scanner.py` | 扫盘引擎（本地遍历 + 关键词匹配 + 反推画像）·**只读** |
| `review.py` | ①评价核心（调 LLM 做打分/行话翻译/改法）·**只读不改** |
| `explain.py` | ②解释（技术概念→行业类比 + 项目阶段感知） |
| `reuse.py` | ③复用·公共模块抽取（静态分析，零 LLM） |
| `reuse_store.py` | ③复用·行业能力库（跨项目存轮子 + 命中提醒） |
| `notify.py` | ④提醒（踩红线/可复用时主动弹桌宠通知，启发式） |
| `profile_store.py` | 人设跟随·画像手改持久化（按目录） |
| `persona.py` | 人设跟随·跨项目累积人设（越用越准） |
| `pet_bridge.py` | 桌宠桥接（评价进度 → 表情联动） |
| `llm_client.py` | 可换后端的 LLM client（零三方依赖，标准库 urllib） |
| `scan.py` | CLI 入口 |
| `server.py` | HTTP 服务（标准库 http.server，零依赖） |
| `samples/clinic-demo/` | 医疗项目 A（埋红线），demo 第一幕素材 |
| `samples/clinic-new/` | 医疗项目 B（缺轮子），demo 第二幕·复用提醒素材 |

## 状态（2026-06-28 · 全部能力跑通）

- ✅ **①评价**：扫盘反推「医疗 88%」+ 真 LLM 打分（visit.ts 32-42 / patient.py 46-52）+ 行话翻译 + 改法（只读不改）。还自动发现没埋的问题，不是背答案。
- ✅ **②解释**：技术概念→行业类比（状态机→患者就诊流程表）+ 项目阶段感知（门诊试运行、前端是叫号屏后端是档案室）
- ✅ **③复用**：公共模块抽取（5 个轮子）+ 跨项目命中提醒（扫项目B提醒"用项目A的现成轮子"）
- ✅ **④提醒**：踩红线/可复用时主动推 notification 弹桌宠气泡（启发式，不调 LLM，快稳）
- ✅ **人设跟随**：画像手改持久化（按目录）+ 跨项目累积人设（"你主要在做医疗，攒下5个能力"）
- ✅ **桌宠联动**：评价进度驱动表情（扫盘=思考/评价=干活/红线=慌张）+ 工作台 Dashboard（coda-desktop）
- ✅ 后端可换：主办方 `api.openai-next.com`（OpenAI 兼容，gpt-5）跑通；零三方依赖、纯标准库
- ⏭️ 二期：传播（分享给同行）、通用复用引擎、更多行业关键词库
