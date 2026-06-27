"""可换后端的 LLM client。

今晚：走环境变量 OPENAI_API_KEY（OpenAI 兼容 /chat/completions）。
明天接主办方 Agent API：只改这一个文件的 chat() 实现，业务逻辑（review.py）不动。

零三方依赖：用标准库 urllib 直发 HTTP，现场不怕装包/网络。
"""

import json
import os
import urllib.request
import urllib.error

# —— 后端配置：改这里即可切后端 ——
# 今晚默认 OpenAI 兼容。要换主办方 Agent API，把 BASE_URL / MODEL / KEY 换掉，
# 或在 chat() 里改成主办方的请求体格式。
BACKEND = os.environ.get("CODA_LLM_BACKEND", "openai")  # openai | deepseek | mock

_CONFIG = {
    "openai": {
        "base_url": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        "key_env": "OPENAI_API_KEY",
        "model": os.environ.get("CODA_LLM_MODEL", "gpt-4o-mini"),
    },
    "deepseek": {
        "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        "key_env": "DEEPSEEK_API_KEY",
        "model": os.environ.get("CODA_LLM_MODEL", "deepseek-chat"),
    },
}


class LLMError(Exception):
    pass


def chat(system: str, user: str, *, temperature: float = 0.2, want_json: bool = True) -> str:
    """发一轮对话，返回模型文本。want_json=True 时要求模型只输出 JSON。"""
    if BACKEND == "mock":
        return _mock(user)

    cfg = _CONFIG.get(BACKEND)
    if not cfg:
        raise LLMError(f"未知后端 CODA_LLM_BACKEND={BACKEND}")

    key = os.environ.get(cfg["key_env"])
    if not key:
        raise LLMError(f"环境变量 {cfg['key_env']} 未设置——无法调用 {BACKEND}")

    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        cfg["base_url"].rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            # 部分中转站套了 Cloudflare，默认 urllib UA 会被 1010 拦，伪装成常见 UA
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/124.0 Safari/537.36",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        raise LLMError(f"LLM HTTP {e.code}: {detail}") from e
    except (urllib.error.URLError, KeyError, json.JSONDecodeError) as e:
        raise LLMError(f"LLM 调用失败：{e}") from e


def _mock(user: str) -> str:
    """无 key / 离线兜底：返回一个结构正确的假结果，保证链路能跑通。"""
    return json.dumps({
        "score": 62,
        "issues": [{
            "problem": "（mock）患者隐私字段裸奔了，违反医疗数据红线",
            "techDetail": "patient 对象明文 JSON 存进 localStorage",
            "redlineLevel": "high",
            "fix": "敏感字段不落本地存储；若必须缓存，先脱敏+加密，患者 ID 用不可逆哈希",
            "loc": {"file": "services/visit.ts", "line": 12},
        }],
    }, ensure_ascii=False)
