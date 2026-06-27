"""行业能力库 —— 跨项目复用的核心。

把扫各个项目抽出的可复用轮子，按【行业】存下来（跨项目共享）。
扫新项目时比对这个库：同行业、且新项目里出现相似意图 → 提醒「你做过类似的，直接用」。

存储：~/.coda/reuse_library.json
  { "医疗": [ {"name","fromProject","snippet","file","sig"} , ... ] }

sig 是去重签名（按 name+fromProject）。纯标准库、原子写。
"""

import json
import os
import tempfile

STORE_DIR = os.path.join(os.path.expanduser("~"), ".coda")
LIB_PATH = os.path.join(STORE_DIR, "reuse_library.json")
MAX_PER_INDUSTRY = 50  # 每个行业最多存这么多轮子，防无限膨胀


def _load() -> dict:
    try:
        with open(LIB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError, ValueError):
        return {}


def _save(data: dict) -> None:
    os.makedirs(STORE_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STORE_DIR, prefix=".reuselib.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, LIB_PATH)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _sig(c: dict) -> str:
    return f"{c.get('name','')}::{c.get('fromProject','')}"


def deposit(industry: str, candidates: list) -> int:
    """把某项目抽出的轮子存进行业库。返回新增数量（已存在的跳过）。"""
    if not industry or industry == "未知" or not candidates:
        return 0
    data = _load()
    bucket = data.setdefault(industry, [])
    existing = {_sig(c) for c in bucket}
    added = 0
    for c in candidates:
        sig = _sig(c)
        if sig in existing:
            continue
        item = {
            "name": c.get("name", ""),
            "fromProject": c.get("fromProject", ""),
            "snippet": c.get("snippet", ""),
            "file": c.get("file", ""),
            "sig": sig,
        }
        bucket.append(item)
        existing.add(sig)
        added += 1
    # 截断
    if len(bucket) > MAX_PER_INDUSTRY:
        data[industry] = bucket[-MAX_PER_INDUSTRY:]
    _save(data)
    return added


def library_for(industry: str) -> list:
    """取某行业库里的全部轮子。"""
    return _load().get(industry, [])


def match_reuse_hint(industry: str, current_candidates: list, current_project: str) -> dict:
    """生成复用提醒：库里有、但当前项目不是它来源的轮子 → 可复用候选。

    返回对齐 Agent接口契约.html 的 reuseHint：
      { matchedIndustry, message, candidates:[{name,fromProject,snippet,file}] }
    没有可提醒的返回 candidates 空。
    """
    lib = library_for(industry)
    if not lib:
        return {"matchedIndustry": industry, "message": "", "candidates": []}

    # 当前项目里已有的轮子名（避免提醒"用你自己刚写的"）
    have = {c.get("name", "") for c in (current_candidates or [])}
    hints = []
    for item in lib:
        # 来自别的项目、且当前项目还没有同名的 → 值得提醒
        if item.get("fromProject") != os.path.basename(current_project) \
                and item.get("name") not in have:
            hints.append({
                "name": item["name"],
                "fromProject": item["fromProject"],
                "snippet": item["snippet"],
                "file": item.get("file", ""),
            })

    if not hints:
        return {"matchedIndustry": industry, "message": "", "candidates": []}

    msg = f"你做过类似的{industry}项目，行业库里有 {len(hints)} 个现成轮子，直接用"
    return {"matchedIndustry": industry, "message": msg, "candidates": hints[:5]}


def clear_library(industry: str = "") -> None:
    """清库（不传则清全部）。demo 复位用。"""
    if not industry:
        _save({})
        return
    data = _load()
    if industry in data:
        del data[industry]
        _save(data)
