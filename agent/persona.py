"""人设跟随 —— 扫盘/评价/复用的产出反向丰富用户画像，越用越准。

前面的"画像编辑"是用户手动改单个项目。这里做的是【跨项目的累积人设】：
每扫一个项目，就把信号沉淀进一个全局人设档案，形成"你这个人"的画像——
你主要做哪些行业、用什么技术、积累了哪些轮子、常踩哪类坑。扫得越多越准。

存储：~/.coda/persona.json
  {
    "industries": {"医疗": 3, "金融": 1},     # 各行业项目数（你深耕哪行）
    "langs": {"Python": 4, "TypeScript": 2},  # 常用语言
    "skills": ["患者ID校验", "就诊状态机"],     # 你攒下的可复用能力
    "weakspots": {"患者隐私明文存储": 2},        # 常踩的坑（按红线类型计数）
    "projectsSeen": 4,
    "updatedAt": "<由调用方传>"
  }
"""

import json
import os
import tempfile
from collections import Counter

STORE_DIR = os.path.join(os.path.expanduser("~"), ".coda")
PERSONA_PATH = os.path.join(STORE_DIR, "persona.json")


def _load() -> dict:
    try:
        with open(PERSONA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else _empty()
    except (OSError, json.JSONDecodeError, ValueError):
        return _empty()


def _empty() -> dict:
    return {
        "industries": {}, "langs": {}, "skills": [],
        "weakspots": {}, "projectsSeen": 0, "updatedAt": "",
    }


def _save(data: dict) -> None:
    os.makedirs(STORE_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STORE_DIR, prefix=".persona.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, PERSONA_PATH)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def enrich(scan: dict, profile: dict, reuse: dict = None,
           reviews: list = None, *, updated_at: str = "") -> dict:
    """用一次扫描的产出，反向丰富全局人设。返回更新后的人设。

    幂等性不强求（demo 用）：同一项目反复扫会累加，能体现"越用越准"的方向感即可。
    """
    data = _load()
    industry = profile.get("industry")

    # 行业计数（你深耕哪行）
    if industry and industry != "未知":
        data["industries"][industry] = data["industries"].get(industry, 0) + 1

    # 语言计数
    for lang in scan.get("langs", []):
        data["langs"][lang] = data["langs"].get(lang, 0) + 1

    # 可复用能力（你攒下的轮子，去重累积）
    if reuse and reuse.get("candidates"):
        skills = set(data.get("skills", []))
        for c in reuse["candidates"]:
            name = c.get("name")
            if name:
                skills.add(name)
        data["skills"] = sorted(skills)[:30]

    # 常踩的坑（从评价里的 high 红线累积）
    if reviews:
        for rv in reviews:
            for it in rv.get("issues", []):
                if it.get("redlineLevel") == "high":
                    key = (it.get("problem") or "")[:24]
                    if key:
                        data["weakspots"][key] = data["weakspots"].get(key, 0) + 1

    data["projectsSeen"] = data.get("projectsSeen", 0) + 1
    if updated_at:
        data["updatedAt"] = updated_at
    _save(data)
    return data


def summary() -> dict:
    """给工作台/路演看的人设摘要：你是谁、擅长什么、常踩什么坑。"""
    data = _load()
    top_industries = Counter(data.get("industries", {})).most_common(3)
    top_langs = Counter(data.get("langs", {})).most_common(3)
    top_weak = Counter(data.get("weakspots", {})).most_common(3)

    main_industry = top_industries[0][0] if top_industries else "未知"
    headline = "扫得还不够，多扫几个项目我就更懂你了"
    if data.get("projectsSeen", 0) >= 1 and main_industry != "未知":
        n = data["industries"][main_industry]
        headline = f"你主要在做「{main_industry}」（{n} 个项目），越用我越懂你"

    return {
        "headline": headline,
        "projectsSeen": data.get("projectsSeen", 0),
        "industries": [{"name": k, "count": v} for k, v in top_industries],
        "langs": [k for k, _ in top_langs],
        "skills": data.get("skills", [])[:8],
        "weakspots": [{"what": k, "count": v} for k, v in top_weak],
        "updatedAt": data.get("updatedAt", ""),
    }


def reset() -> None:
    """清空人设（demo 复位）。"""
    _save(_empty())
