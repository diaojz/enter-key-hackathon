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
from pet_bridge import push_state
from reuse import extract_reusable
from profile_store import apply_override


def run(root: str, use_llm: bool = True, review_limit: int = 3, pet: bool = True):
    # 扫盘开始 → 桌宠思考脸
    if pet:
        push_state("thinking", event="扫盘中", cwd=os.path.abspath(root))

    scan = scan_dir(root)
    profile = infer_profile(scan)
    # 套用用户手改的画像覆盖（人设跟随）：改过行业/红线就按用户的来
    profile = apply_override(profile, scan["root"])

    # 抽取可复用公共模块（行业未知也尝试，抽不到则 candidates 为空）
    reuse = extract_reusable(scan, profile)

    # ③复用·跨项目提醒：先拿当前项目轮子去比对行业库（命中=别的项目有现成的），
    # 再把当前项目轮子入库供下个项目用。顺序不能反，否则会提醒"用你自己刚写的"。
    reuse_hint = {"matchedIndustry": profile.get("industry"), "message": "", "candidates": []}
    try:
        from reuse_store import match_reuse_hint, deposit
        ind = profile.get("industry")
        cur_cands = reuse.get("candidates", [])
        reuse_hint = match_reuse_hint(ind, cur_cands, scan["root"])
        deposit(ind, cur_cands)
    except Exception:
        pass

    result = {"scan_summary": {
        "root": scan["root"],
        "fileCount": scan["fileCount"],
        "langs": scan["langs"],
    }, "profile": profile, "reviews": [], "reuse": reuse, "reuseHint": reuse_hint,
        "mapping": {"industry": profile.get("industry", "未知"), "concepts": []}}

    # ②解释 + ③评审：原本是 5 次串行 LLM（explain_stage / explain_mapping / 3×review_file），
    # 每次重模型往返数秒，串起来能拖到一两分钟。这些调用彼此独立，并发发出去后取最慢的一次，
    # 总耗时从「∑ 单次」压到「max 单次」。只在能调 LLM + 行业已知时跑。
    if use_llm and profile["industry"] != "未知":
        if pet:
            push_state("working", event="评价中", cwd=scan["root"])  # 专注干活

        from concurrent.futures import ThreadPoolExecutor

        # 先把待评文件内容读出来（本地 IO，串行也快），LLM 调用部分才并发。
        targets = pick_review_targets(scan, profile, limit=review_limit)
        review_inputs = []  # [(rel, content)]
        for rel in targets:
            full = os.path.join(scan["root"], rel)
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as f:
                    review_inputs.append((rel, f.read(8000)))
            except OSError:
                continue

        def _do_stage():
            from explain import explain_stage
            return explain_stage(profile, scan)

        def _do_mapping():
            from explain import explain_mapping
            return explain_mapping(profile, scan)

        def _do_review(rel, content):
            r = review_file(profile, rel, content)
            r["file"] = rel
            return r

        # 2 次 explain + N 次 review 一把并发；线程数取实际任务数（最多 5）。
        with ThreadPoolExecutor(max_workers=min(2 + len(review_inputs), 5)) as pool:
            f_stage = pool.submit(_do_stage)
            f_mapping = pool.submit(_do_mapping)
            f_reviews = [pool.submit(_do_review, rel, c) for rel, c in review_inputs]

            try:
                result["stage"] = f_stage.result()
            except Exception:
                result["stage"] = None
            try:
                result["mapping"] = f_mapping.result()
            except Exception:
                pass  # 保留 scan_summary 里给的默认 mapping
            # 按 targets 原顺序收集评审结果，跳过抛异常的那个文件
            for f in f_reviews:
                try:
                    result["reviews"].append(f.result())
                except Exception:
                    continue

    # 人设跟随：用本次扫描产出反向丰富全局人设（越用越准）
    try:
        from persona import enrich
        enrich(scan, profile, reuse=reuse, reviews=result["reviews"])
    except Exception:
        pass

    # 收尾：发现红线 → 慌张报错脸；否则 → 欢呼
    if pet:
        has_redline = any(
            it.get("redlineLevel") == "high"
            for rv in result["reviews"] for it in rv.get("issues", [])
        )
        if has_redline:
            push_state("error", event="发现红线", cwd=scan["root"])
        else:
            push_state("done", event="评价完成", cwd=scan["root"])

    return result


def plan(root: str, review_limit: int = 3, pet: bool = True):
    """扫盘「计划」——本地秒出，不调 LLM。给前端做「先出画像+进度条，再逐文件评」用。

    返回：画像 / 复用 / 复用提醒 / 待评文件列表（含文件内容，前端拿去逐个调 /review）。
    评审本身由前端逐个调 /review 完成，每评完一个就能渲染一条 + 推进进度。
    """
    if pet:
        push_state("thinking", event="扫盘中", cwd=os.path.abspath(root))

    scan = scan_dir(root)
    profile = infer_profile(scan)
    profile = apply_override(profile, scan["root"])
    reuse = extract_reusable(scan, profile)

    reuse_hint = {"matchedIndustry": profile.get("industry"), "message": "", "candidates": []}
    try:
        from reuse_store import match_reuse_hint, deposit
        ind = profile.get("industry")
        cur_cands = reuse.get("candidates", [])
        reuse_hint = match_reuse_hint(ind, cur_cands, scan["root"])
        deposit(ind, cur_cands)
    except Exception:
        pass

    # 待评文件列表（含内容），前端逐个 POST /review
    targets = []
    if profile["industry"] != "未知":
        for rel in pick_review_targets(scan, profile, limit=review_limit):
            full = os.path.join(scan["root"], rel)
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read(8000)
            except OSError:
                continue
            targets.append({"file": rel, "content": content})

    # 评价即将开始 → 桌宠进入专注干活态（前端逐个评时一直保持）
    if pet and targets:
        push_state("working", event="评价中", cwd=scan["root"])

    return {
        "scan_summary": {
            "root": scan["root"],
            "fileCount": scan["fileCount"],
            "langs": scan["langs"],
        },
        "profile": profile,
        "reuse": reuse,
        "reuseHint": reuse_hint,
        "targets": targets,           # [{file, content}]，前端逐个调 /review
        "reviewCount": len(targets),  # 进度条总数
    }


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
