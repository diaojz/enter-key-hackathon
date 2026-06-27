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
CODA_LLM_BACKEND=openai   python3 scan.py <dir>   # 默认，用 OPENAI_API_KEY
CODA_LLM_BACKEND=deepseek python3 scan.py <dir>   # 用 DEEPSEEK_API_KEY
CODA_LLM_BACKEND=mock     python3 scan.py <dir>   # 离线兜底，出假数据验证链路
```

**接主办方 Agent API**：只改 `llm_client.py` 的 `chat()`（换 base_url / 请求体格式），
`scanner.py` / `review.py` / `server.py` 全不动。

可选环境变量：`OPENAI_BASE_URL`、`CODA_LLM_MODEL`。

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

## 状态（2026-06-27 今晚）

- ✅ 扫盘 + 画像反推：跑通，医疗样本反推「医疗 88%」+ 证据词 + 红线
- ✅ 评价链路 + 输出格式：跑通（mock 后端验证），打分/行话/改法/排版齐
- ✅ CLI + HTTP API + 可换后端：就绪
- ⏳ **缺一个有额度的 LLM key**：环境里 OPENAI 没额度(429)、DEEPSEEK 失效(401)。
  拿到任一可用 key（或主办方 Agent API）即可真出评价。
