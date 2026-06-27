"""②解释 —— 用用户熟悉的行业经验，把 Coding 概念翻译成白话。

PRD 排名第二的功能。两种用法：
1. explain_concept(profile, term)：解释单个技术概念（如"状态机""幂等""事务"）用行业类比
2. explain_stage(profile, scan)：根据扫盘结果，告诉用户这个项目「现在处于哪个阶段、
   在你那行相当于在干什么」

只读、不改代码。LLM 不可用时给规则兜底，保证有内容。
"""

import json

from llm_client import chat, LLMError

EXPLAIN_SYSTEM = """你是「小哒 Coda」，一个懂用户行业的助手。你的任务是把程序员的技术黑话，
翻译成【用户那一行的人能秒懂的大白话和类比】。

规则：
1. 用用户所在行业（industry）的事物打比方，不要用其它行业的例子。
2. 一句话讲清「这个技术概念在你这行相当于什么」，再补一句它为什么重要。
3. 不许堆术语；面向「会自己的行业、但不懂代码」的人。

只输出 JSON：
{
  "term": "<被解释的概念>",
  "plain": "<一句行业大白话类比>",
  "why": "<为什么重要，一句>"
}"""

STAGE_SYSTEM = """你是「小哒 Coda」。根据一个项目的扫描结果，用【用户行业的语言】判断并解释
这个项目现在大概处于什么阶段、在用户那一行相当于在做什么事。

规则：
1. 用 industry 行业的流程/阶段打比方（如医疗的「建档→就诊→复诊」、金融的「开户→交易→对账」）。
2. 讲清「代码层面在做 X，在你这行相当于在做 Y」。
3. 面向不懂代码的行业专家，亲切、具体、不堆术语。

只输出 JSON：
{
  "stage": "<一句话：现在处于哪个阶段>",
  "analogy": "<在你这行相当于在干什么>",
  "next": "<下一步通常该干什么，一句>"
}"""


def explain_concept(profile: dict, term: str) -> dict:
    industry = profile.get("industry", "通用")
    user = json.dumps({"industry": industry, "term": term}, ensure_ascii=False)
    try:
        data = json.loads(chat(EXPLAIN_SYSTEM, user, want_json=True))
        data.setdefault("term", term)
        return data
    except (LLMError, json.JSONDecodeError):
        return _fallback_concept(industry, term)


def explain_stage(profile: dict, scan: dict) -> dict:
    industry = profile.get("industry", "通用")
    # 给 LLM 一点扫盘信号：命中的关键词类别、语言、文件数
    cats = sorted({h.get("category", "") for h in scan.get("hits", []) if h.get("category")})
    signal = {
        "industry": industry,
        "langs": scan.get("langs", []),
        "fileCount": scan.get("fileCount", 0),
        "hitCategories": cats,
        "topTerms": [h["term"] for h in scan.get("hits", [])[:8]],
    }
    user = json.dumps(signal, ensure_ascii=False)
    try:
        data = json.loads(chat(STAGE_SYSTEM, user, want_json=True))
        return data
    except (LLMError, json.JSONDecodeError):
        return _fallback_stage(industry, cats)


# ── 规则兜底（LLM 不可用时，保证工作台有内容）──

_CONCEPT_FALLBACK = {
    "状态机": "就像病人就诊的固定流程：挂号→候诊→就诊→完成，每一步只能按顺序走，不能跳。",
    "幂等": "就像同一张挂号单交两次，系统也只挂一个号，不会重复。",
    "事务": "就像转诊：要么病历和费用一起转走，要么都不动，不会转一半。",
    "并发": "就像多个窗口同时挂号，得保证同一个号不会被两个人抢到。",
    "缓存": "就像把常用病历放在手边抽屉，不用每次都去档案室翻。",
}


def _fallback_concept(industry: str, term: str) -> dict:
    plain = _CONCEPT_FALLBACK.get(term)
    if not plain:
        plain = f"「{term}」是个技术概念，先按字面理解；接好 LLM 后这里会给你{industry}行业的精准类比。"
    return {"term": term, "plain": plain, "why": "理解它能帮你判断代码是否靠谱。", "fallback": True}


def _fallback_stage(industry: str, cats) -> dict:
    cat_txt = "、".join(cats[:3]) if cats else "基础结构"
    return {
        "stage": f"项目主要在处理「{cat_txt}」相关的代码",
        "analogy": f"在{industry}这行，大致相当于在搭业务流程的主干。",
        "next": "接好 LLM 后这里会给出更贴合你行业的阶段判断。",
        "fallback": True,
    }
