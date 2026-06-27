#!/usr/bin/env python3
"""小哒 Coda · 评价 Agent HTTP 服务

零依赖（标准库 http.server）。暴露两个 API，对齐 Agent接口契约.html：

  POST /profile   入参 {"scan": {...}} 或 {"root": "/abs/dir"}
                  出参 行业画像
  POST /review    入参 {"profile": {...}, "file": {"path","content"}}
                  出参 {score, issues:[...]}

另含便捷接口（demo 用，把扫盘+评审一条龙）：
  POST /scan      入参 {"root": "/abs/dir"}  出参 同 CLI 的完整 result

启动：python server.py [port]   默认 8848
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from urllib.parse import urlparse, parse_qs

from scanner import scan_dir, infer_profile
from review import review_file
from scan import run as run_pipeline
from reuse import extract_reusable
from profile_store import apply_override, set_override, get_override, clear_override
from explain import explain_concept, explain_stage
from notify import fire as fire_notify


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send(200, {"ok": True, "service": "coda-eval-agent"})
        elif parsed.path == "/profile/override":
            # 读某目录的画像覆盖：GET /profile/override?root=/abs/dir
            root = (parse_qs(parsed.query).get("root") or [""])[0]
            if not root:
                return self._send(400, {"error": "缺少 root 查询参数"})
            return self._send(200, {"override": get_override(root)})
        elif parsed.path == "/persona":
            # 读全局人设摘要（跨项目累积，越用越准）
            from persona import summary
            return self._send(200, {"persona": summary()})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            data = self._read_json()
        except json.JSONDecodeError:
            return self._send(400, {"error": "请求体不是合法 JSON"})

        try:
            if self.path == "/profile":
                scan = data.get("scan")
                root = data.get("root")
                if scan is None and root:
                    scan = scan_dir(root)
                if scan is None:
                    return self._send(400, {"error": "缺少 scan 或 root"})
                profile = infer_profile(scan)
                # 套用用户手改的画像覆盖（按目录），人设跟随
                profile = apply_override(profile, root or scan.get("root", ""))
                return self._send(200, {"profile": profile})

            if self.path == "/profile/override":
                # 保存画像覆盖：{"root","override":{"industry","redlines",...},"editedAt"}
                root = data.get("root")
                if not root:
                    return self._send(400, {"error": "缺少 root"})
                if data.get("clear"):
                    clear_override(root)
                    return self._send(200, {"ok": True, "override": {}})
                saved = set_override(root, data.get("override") or {},
                                     edited_at=data.get("editedAt", ""))
                return self._send(200, {"ok": True, "override": saved})

            if self.path == "/review":
                profile = data.get("profile") or {}
                f = data.get("file") or {}
                if not f.get("content"):
                    return self._send(400, {"error": "缺少 file.content"})
                result = review_file(profile, f.get("path", "snippet"), f["content"])
                return self._send(200, result)

            if self.path == "/scan":
                root = data.get("root")
                if not root:
                    return self._send(400, {"error": "缺少 root"})
                use_llm = data.get("useLlm", True)
                return self._send(200, run_pipeline(root, use_llm=use_llm))

            if self.path == "/reuse":
                # 支持两种入参：{"root": "..."} 或 {"scan": {...}}
                scan = data.get("scan")
                if scan is None and data.get("root"):
                    scan = scan_dir(data["root"])
                if scan is None:
                    return self._send(400, {"error": "缺少 scan 或 root"})
                profile = infer_profile(scan)
                return self._send(200, {"reuse": extract_reusable(scan, profile)})

            if self.path == "/explain":
                # 解释单个技术概念：{"profile":{...}|"industry","term":"状态机"}
                profile = data.get("profile") or {"industry": data.get("industry", "通用")}
                term = data.get("term")
                if not term:
                    return self._send(400, {"error": "缺少 term"})
                return self._send(200, {"explain": explain_concept(profile, term)})

            if self.path == "/explain/stage":
                # 解释项目阶段：{"root"} 或 {"scan","profile"}
                scan = data.get("scan")
                root = data.get("root")
                if scan is None and root:
                    scan = scan_dir(root)
                if scan is None:
                    return self._send(400, {"error": "缺少 scan 或 root"})
                profile = data.get("profile") or apply_override(
                    infer_profile(scan), root or scan.get("root", ""))
                return self._send(200, {"stage": explain_stage(profile, scan)})

            if self.path == "/notify":
                # 主动提醒：扫目录算出该提醒的事 + 推桌宠通知。{"root","toPet":true}
                root = data.get("root")
                if not root:
                    return self._send(400, {"error": "缺少 root"})
                to_pet = data.get("toPet", True)
                return self._send(200, fire_notify(root, to_pet=to_pet))

            return self._send(404, {"error": f"未知路径 {self.path}"})
        except (NotADirectoryError, FileNotFoundError) as e:
            return self._send(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001  —— demo 服务，兜底别让进程挂
            return self._send(500, {"error": f"服务内部错误：{e}"})

    def log_message(self, fmt, *args):
        sys.stderr.write("  [api] " + (fmt % args) + "\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8848
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"🐾 小哒 Coda 评价 Agent 已启动 → http://localhost:{port}")
    print(f"   POST /profile  /review  /scan  /reuse   ·   GET /health")
    print("   Ctrl-C 停止")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
