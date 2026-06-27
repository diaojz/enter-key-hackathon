"""评价（评审）核心 —— 把代码问题翻译成行业语言 + 打分 + 改法建议。

对齐 Agent接口契约.html 的 /review 出参：
  { score, issues:[{problem(行话), techDetail, redlineLevel, fix, loc}] }

铁律：只读不改。永远只产出文本建议，绝不返回会落盘的 diff。
"""

import json

from llm_client import chat, LLMError

REVIEW_SYSTEM = """你是「小哒 Coda」，一个常驻桌面、懂用户行业的代码 Review 助手。
你的工作不是炫技术，而是用「用户那一行的话」把代码问题讲给他听。

铁律：
1. 只读不改——你只产出问题描述和文字改法建议，绝不输出会自动落盘的 diff。
2. problem 字段必须是【行业大白话】，让不懂代码细节的行业专家也能懂；技术细节放进 techDetail。
3. 给出的 fix 是「建议怎么改」的文字方案，不替用户改。
4. 紧扣传入的行业（industry）和红线（redlines）来判断 redlineLevel。

只输出 JSON，不要任何解释文字。格式：
{
  "score": <0-100 整数，代码质量分>,
  "issues": [
    {
      "problem": "用行业话讲的问题（给用户看）",
      "techDetail": "技术细节（可折叠）",
      "redlineLevel": "high | mid | low",
      "fix": "怎么改的文字建议（不自动改）",
      "loc": {"file": "相对路径", "line": <行号或0>}
    }
  ]
}
issues 控制在 3~5 条，挑最有价值的。若代码确实没大问题，score 给高分、issues 给空数组或低危项——让用户踏实。"""


def review_file(profile: dict, file_path: str, content: str) -> dict:
    """评审单个文件。profile 为 /profile 出参，content 为文件内容。"""
    industry = profile.get("industry", "未知")
    redlines = profile.get("redlines", [])

    user = json.dumps({
        "profile": {"industry": industry, "redlines": redlines},
        "file": {"path": file_path, "content": content[:8000]},
    }, ensure_ascii=False)

    try:
        raw = chat(REVIEW_SYSTEM, user, want_json=True)
        data = json.loads(raw)
    except (LLMError, json.JSONDecodeError) as e:
        return {
            "score": None,
            "issues": [],
            "error": f"评审失败：{e}",
        }

    # 兜底字段
    data.setdefault("score", None)
    data.setdefault("issues", [])
    for it in data["issues"]:
        it.setdefault("redlineLevel", "low")
        it.setdefault("loc", {"file": file_path, "line": 0})
    return data


def pick_review_targets(scan: dict, profile: dict, limit: int = 3):
    """从扫盘结果挑出最值得评审的几个文件（命中行业词最多的）。

    返回相对文件路径列表。
    """
    industry = profile.get("industry")
    file_score = {}
    for h in scan["hits"]:
        if h["industry"] != industry:
            continue
        for rel in h["where"]:
            file_score[rel] = file_score.get(rel, 0) + h["count"]
    ranked = sorted(file_score.items(), key=lambda kv: kv[1], reverse=True)
    return [rel for rel, _ in ranked[:limit]]
