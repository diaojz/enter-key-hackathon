#!/usr/bin/env bash
# 小哒 Coda · 评价 Agent 一键启动
#   用法：./start.sh [端口]   默认 8848
# 做的事：加载 .env.local 注入密钥 → 杀掉占端口的旧进程 → 重启 → 健康检查 + 真实 LLM 自测
set -euo pipefail

cd "$(dirname "$0")"
PORT="${1:-8848}"

# 1) 加载本地密钥（.env.local 已被 .gitignore 忽略，不会提交）
if [[ -f .env.local ]]; then
  set -a; source .env.local; set +a
  echo "✓ 已加载 .env.local（后端=${CODA_LLM_BACKEND:-openai} base=${OPENAI_BASE_URL:-官方} model=${CODA_LLM_MODEL:-默认}）"
else
  echo "⚠ 没找到 .env.local，将用当前 shell 的环境变量（可能没配 key）"
fi

# 2) 杀掉占用该端口的旧进程（避免新代码起不来 / 跑旧版本）
OLD_PIDS="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$OLD_PIDS" ]]; then
  echo "✓ 停掉占用 :$PORT 的旧进程 → $OLD_PIDS"
  kill $OLD_PIDS 2>/dev/null || true
  sleep 1
  lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi

# 3) 后台重启服务
nohup python3 server.py "$PORT" > /tmp/coda-server.log 2>&1 &
sleep 2

# 4) 健康检查
if curl -fsS -m 5 "http://127.0.0.1:$PORT/health" >/dev/null; then
  echo "✓ 服务已启动 → http://localhost:$PORT  （日志：/tmp/coda-server.log）"
else
  echo "✗ 服务没起来，看日志：tail /tmp/coda-server.log"; exit 1
fi

# 5) 真实 LLM 自测（直连中转站，确认 key/额度真的能出 AI 内容）
echo -n "✓ LLM 自测："
if curl -fsS -m 30 "${OPENAI_BASE_URL:-https://api.openai.com/v1}/chat/completions" \
   -H "Authorization: Bearer ${OPENAI_API_KEY:-}" -H "Content-Type: application/json" \
   -d "{\"model\":\"${CODA_LLM_MODEL:-gpt-4o-mini}\",\"messages\":[{\"role\":\"user\",\"content\":\"只回两个字：通了\"}],\"max_tokens\":10}" \
   | grep -q '"content"'; then
  echo " 通了，AI 评审可用 ✅"
else
  echo " ⚠ LLM 没通（key/额度/网络），扫盘仍可跑但评审会走兜底"
fi
