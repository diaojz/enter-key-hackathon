"""�top宠桥接 —— 把评价 Agent 的执行阶段推给小哒 Coda 桌宠（coda-desktop）。

桌宠（clawd-on-desk 二开）内置本地 HTTP server，监听 POST /state，
把状态枚举映射成表情动画。我们不改桌宠一行代码，纯用它的对外接口驱动：

  扫盘开始 → thinking（思考脸）
  LLM 评价 → working（专注干活）
  出报告无红线 → done（欢呼）
  发现红线   → error（慌张报错脸）

端口：读 ~/.clawd/runtime.json（桌宠启动后写），fallback 23333~23337。
鉴权：请求头 x-clawd-server: clawd-on-desk。

桌宠没开也不报错（评价照常跑），只是没表情联动。
"""

import json
import os
import urllib.request
import urllib.error

SERVER_ID = "clawd-on-desk"
SERVER_HEADER = "x-clawd-server"
RUNTIME_CONFIG = os.path.join(os.path.expanduser("~"), ".clawd", "runtime.json")
FALLBACK_PORTS = [23333, 23334, 23335, 23336, 23337]
SESSION_ID = "coda-eval"  # 评价 Agent 自己的会话标识

# 语义状态 -> coda 主题合法表情。桌宠只接受 theme.states 里的键，
# 否则 server-route-state.js 的 `if (ctx.STATE_SVGS[state])` 会静默丢弃。
# coda 主题合法集：idle/yawning/dozing/thinking/working/juggling/sweeping/
#               error/attention/notification/sleeping/waking
STATE_ALIAS = {
    "done": "attention",      # 评价完成报喜 → attention（带提示气泡，最接近“欢呼看我”）
    "cheer": "attention",
    "cheering": "attention",
    "busy": "working",
    "scan": "thinking",
    "scanning": "thinking",
}


def _candidate_ports():
    ports = []
    try:
        with open(RUNTIME_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("app") == SERVER_ID and isinstance(data.get("port"), int):
            ports.append(data["port"])
    except (OSError, json.JSONDecodeError, ValueError):
        pass
    for p in FALLBACK_PORTS:
        if p not in ports:
            ports.append(p)
    return ports


def push_state(state: str, event: str = "", cwd: str = "", *, quiet: bool = True) -> bool:
    """把一个状态推给桌宠。成功返回 True；桌宠没开/推不进返回 False（不抛异常）。

    state 取值：idle / thinking / working / done / error / notification / sleeping
    （done/cheer 等语义值会自动映射到 coda 主题合法表情）
    """
    state = STATE_ALIAS.get(state, state)
    body = json.dumps({
        "state": state,
        "event": event or state,
        "session_id": SESSION_ID,
        "cwd": cwd or os.getcwd(),
        "session_title": "小哒 · 代码评价",
    }).encode("utf-8")

    for port in _candidate_ports():
        url = f"http://127.0.0.1:{port}/state"
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={
                "Content-Type": "application/json",
                SERVER_HEADER: SERVER_ID,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                # 桌宠回包也带 x-clawd-server，确认确实是它
                if resp.headers.get(SERVER_HEADER) == SERVER_ID or resp.status in (200, 204):
                    if not quiet:
                        print(f"  [pet] → {state} (port {port})")
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            continue
    if not quiet:
        print(f"  [pet] 桌宠未连接（state={state} 已忽略）")
    return False


def pet_available() -> bool:
    """探测桌宠是否在跑。"""
    for port in _candidate_ports():
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/state", method="GET",
                headers={SERVER_HEADER: SERVER_ID},
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.headers.get(SERVER_HEADER) == SERVER_ID:
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            continue
    return False


if __name__ == "__main__":
    # 自测：依次推几个状态，看桌宠变脸
    import sys
    import time
    seq = sys.argv[1:] or ["thinking", "working", "done"]
    print(f"桌宠在线：{pet_available()}")
    for s in seq:
        ok = push_state(s, quiet=False)
        time.sleep(1.2)
