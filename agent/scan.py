#!/usr/bin/env python3
"""小哒 Coda · 评价 Agent CLI

用法：
    python scan.py <项目目录>
    python scan.py <项目目录> --json      # 只输出 JSON（给前端/管道用）
    python scan.py <项目目录> --no-llm     # 只扫盘出画像，不调 LLM 评审

一条龙：扫盘 → 反推行业画像 → 挑文件 → 行话翻译+打分+改法。
只读，绝不改用户代码。
"""

import os
import sys
import json

from scanner import scan_dir, infer_profile
from review import review_file, pick_review_targets


def run(root: str, use_llm: bool = True, review_limit: int = 3):
    scan = scan_dir(root)
    profile = infer_profile(scan)

    result = {"scan_summary": {
        "root": scan["root"],
        "fileCount": scan["fileCount"],
        "langs": scan["langs"],
    }, "profile": profile, "reviews": []}

    if use_llm and profile["industry"] != "未知":
        targets = pick_review_targets(scan, profile, limit=review_limit)
        for rel in targets:
            full = os.path.join(scan["root"], rel)
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read(8000)
            except OSError:
                continue
            r = review_file(profile, rel, content)
            r["file"] = rel
            result["reviews"].append(r)

    return result


def print_pretty(result: dict):
    p = result["profile"]
    s = result["scan_summary"]
    C = _Color

    print()
    print(f"{C.BOLD}🐾 小哒 Coda · 扫盘评价报告{C.END}")
    print(f"   目录：{s['root']}")
    print(f"   扫了 {s['fileCount']} 个文件 · 语言：{', '.join(s['langs']) or '—'}")
    print()

    if p["industry"] == "未知":
        print(f"{C.DIM}没扫出明显的行业特征——可能不是垂直业务项目，或关键词库还没覆盖。{C.END}")
        return

    pct = int(p["confidence"] * 100)
    print(f"{C.ACCENT}{C.BOLD}「我猜你是做【{p['industry']}】的」{C.END}  "
          f"{C.DIM}置信度 {pct}%{C.END}")
    print(f"   证据：{' · '.join(p['evidence'])}")
    if p["subDomain"]:
        print(f"   细分：{p['subDomain']}  ·  画像：{p['roleGuess']}")
    if p.get("candidates") and len(p["candidates"]) > 1:
        others = "  ".join(f"{c['industry']}({int(c['score']*100)}%)"
                           for c in p["candidates"][1:])
        print(f"   {C.DIM}其它可能：{others}{C.END}")
    print()

    if p["redlines"]:
        print(f"{C.BOLD}⚠ 这一行的红线：{C.END}")
        for r in p["redlines"]:
            print(f"   · {r}")
        print()

    if not result["reviews"]:
        return

    print(f"{C.BOLD}📋 代码评价（用你那行的话讲 · 只读不改）{C.END}")
    for rv in result["reviews"]:
        score = rv.get("score")
        if rv.get("error"):
            print(f"\n  {C.DIM}{rv['file']} — {rv['error']}{C.END}")
            continue
        badge = _score_badge(score)
        print(f"\n  {C.BOLD}{rv['file']}{C.END}  {badge}")
        issues = rv.get("issues", [])
        if not issues:
            print(f"    {C.GREEN}✓ 没发现明显问题，踏实干活。{C.END}")
        for it in issues:
            lvl = it.get("redlineLevel", "low")
            mark = {"high": f"{C.RED}● 红线{C.END}",
                    "mid": f"{C.ACCENT}● 注意{C.END}",
                    "low": f"{C.DIM}● 提示{C.END}"}.get(lvl, "●")
            print(f"    {mark}  {it['problem']}")
            if it.get("fix"):
                print(f"         {C.DIM}↳ 怎么改：{it['fix']}{C.END}")
    print()


def _score_badge(score):
    C = _Color
    if score is None:
        return f"{C.DIM}[未评分]{C.END}"
    if score >= 80:
        return f"{C.GREEN}[{score} 分 · 不错]{C.END}"
    if score >= 60:
        return f"{C.ACCENT}[{score} 分 · 还行]{C.END}"
    return f"{C.RED}[{score} 分 · 该收拾了]{C.END}"


class _Color:
    _on = sys.stdout.isatty()
    BOLD = "\033[1m" if _on else ""
    DIM = "\033[2m" if _on else ""
    END = "\033[0m" if _on else ""
    ACCENT = "\033[38;5;208m" if _on else ""   # 橙
    GREEN = "\033[32m" if _on else ""
    RED = "\033[31m" if _on else ""


def main():
    args = [a for a in sys.argv[1:]]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    root = args[0]
    as_json = "--json" in args
    use_llm = "--no-llm" not in args

    try:
        result = run(root, use_llm=use_llm)
    except (NotADirectoryError, FileNotFoundError) as e:
        print(f"错误：{e}", file=sys.stderr)
        sys.exit(1)

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_pretty(result)


if __name__ == "__main__":
    main()
