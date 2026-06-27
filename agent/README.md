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

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/profile` | `{"scan":{...}}` 或 `{"root":"/abs/dir"}` | 行业画像 |
| POST | `/review` | `{"profile":{...},"file":{"path","content"}}` | `{score, issues[]}` |
| POST | `/scan` | `{"root":"/abs/dir"}` | 扫盘+画像+评价一条龙 |
| GET | `/health` | — | `{ok:true}` |

```bash
curl -s localhost:8848/profile -d '{"root":"samples/clinic-demo"}'
```

## 文件

| 文件 | 作用 |
|---|---|
| `keywords.py` | 行业关键词库（医疗做厚，余行业种子词）+ 红线清单 |
| `scanner.py` | 扫盘引擎（本地遍历 + 关键词匹配 + 反推画像）·**只读** |
| `review.py` | 评价核心（调 LLM 做打分/行话翻译/改法）·**只读不改** |
| `llm_client.py` | 可换后端的 LLM client（零三方依赖，标准库 urllib） |
| `scan.py` | CLI 入口 |
| `server.py` | HTTP 服务（标准库 http.server，零依赖） |
| `samples/clinic-demo/` | 医疗测试项目（埋了红线问题），demo 第一幕「项目 A」素材 |

## 状态（2026-06-27 今晚 · ①评价已全跑通）

- ✅ 扫盘 + 画像反推：医疗样本反推「医疗 88%」+ 证据词 + 红线（纯本地、秒出、零依赖）
- ✅ 评价（真 LLM）：`visit.ts` 32 分 / `patient.py` 46 分，问题全是医疗行话 + 改法建议
  - 还自动发现了没埋的问题（身份证校验过于简单），不是背答案
- ✅ CLI + HTTP API（/health /profile /review /scan）+ 可换后端：全部实测通过
- ✅ 后端：主办方 `api.openai-next.com`（OpenAI 兼容，gpt-5）跑通
- ⏭️ 明早：②解释（复用 review 的行话口径）③复用（医疗轮子库）+ 前端接这两个 API
