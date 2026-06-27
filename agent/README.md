# 小哒 Coda · 评价 Agent（①评价 · 主路径第一棒）

扫盘 → 反推行业画像 → 打分 + 行话翻译 + 改法建议。**只读不改。**
对齐 [`../Agent接口契约.html`](../Agent接口契约.html) 的 `/profile` + `/review`。

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
key 不入库，启动前注入环境变量即可：

```bash
export OPENAI_API_KEY="<你的 key>"
export OPENAI_BASE_URL="https://api.openai-next.com/v1"
export CODA_LLM_MODEL="gpt-5"
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
