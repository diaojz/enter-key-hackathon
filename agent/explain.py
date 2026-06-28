"""②解释 —— 用用户熟悉的行业经验，把 Coding 概念翻译成白话。

PRD 排名第二的功能。两种用法：
1. explain_concept(profile, term)：解释单个技术概念（如"状态机""幂等""事务"）用行业类比
2. explain_stage(profile, scan)：根据扫盘结果，告诉用户这个项目「现在处于哪个阶段、
   在你那行相当于在干什么」

只读、不改代码。LLM 不可用时给规则兜底，保证有内容。
"""

import json

from llm_client import chat, LLMError, FAST_MODEL

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


MAPPING_SYSTEM = """你是「小哒 Coda」，专门帮【会自己行业、但不懂代码】的人看懂他用 AI 写出来的项目。

任务：从扫描信号里，挑出这个项目【最关键的 3 到 5 个概念或模块】，用【用户那一行的话】讲透：
这块代码在你这行相当于什么、起什么作用。目的是让用户理解「行业需求 ↔ 代码」是怎么对应的，
进而知道怎么用 AI 把自己行业的项目落地。

铁律：
1. 只挑【关键的、成体系的】概念，不要逐个文件、不要碎词罗列；用户不需要懂所有细节。
2. 每个概念按【业务发生的先后顺序】排（像讲一条业务流程：先做什么、再做什么）。
3. industryName 用 industry 行业的事物命名（如医疗的「病历流转」「挂号核身」「复诊提醒」），
   codeName 用代码侧的技术叫法（如「状态机」「鉴权中间件」「定时任务」）。
4. role 一句话讲清「这块在你这行是干嘛的、为什么重要」，亲切、具体、不堆术语。
5. files 填最能代表这个概念的 1-2 个文件路径（从 fileHints 里挑，挑不到就留空数组）。

只输出 JSON：
{
  "concepts": [
    {
      "industryName": "<行业侧叫法>",
      "codeName": "<代码侧技术名>",
      "role": "<一句行话：这块在你这行干嘛、为什么重要>",
      "files": ["<最相关的文件路径>"]
    }
  ]
}
按业务先后顺序排列 concepts，3-5 个。"""


def explain_mapping(profile: dict, scan: dict) -> dict:
    """挑关键概念，用行业语言讲透「代码 ↔ 行业」映射（②解释的可视化产出）。

    给 LLM 的信号：行业、命中的类别、命中词、以及「词→出现文件」的线索（供它给概念挑代表文件）。
    LLM 不可用或行业未知时给规则兜底。
    """
    industry = profile.get("industry", "通用")
    if industry == "未知":
        return {"industry": industry, "concepts": []}

    cats = sorted({h.get("category", "") for h in scan.get("hits", []) if h.get("category")})
    # 词 -> 出现的文件（给 LLM 当挑代表文件的线索）
    file_hints = {}
    for h in scan.get("hits", [])[:20]:
        if h.get("where"):
            file_hints[h["term"]] = h["where"][:2]

    signal = {
        "industry": industry,
        "subDomain": profile.get("subDomain", ""),
        "langs": scan.get("langs", []),
        "hitCategories": cats,
        "topTerms": [h["term"] for h in scan.get("hits", [])[:12]],
        "fileHints": file_hints,
    }
    user = json.dumps(signal, ensure_ascii=False)
    try:
        data = json.loads(chat(MAPPING_SYSTEM, user, want_json=True, model=FAST_MODEL))
        concepts = data.get("concepts", [])
        if not isinstance(concepts, list) or not concepts:
            raise ValueError("empty concepts")
        return {"industry": industry, "concepts": concepts[:5]}
    except (LLMError, json.JSONDecodeError, ValueError):
        return _fallback_mapping(industry, scan)


def explain_concept(profile: dict, term: str) -> dict:
    industry = profile.get("industry", "通用")
    user = json.dumps({"industry": industry, "term": term}, ensure_ascii=False)
    try:
        data = json.loads(chat(EXPLAIN_SYSTEM, user, want_json=True, model=FAST_MODEL))
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
        data = json.loads(chat(STAGE_SYSTEM, user, want_json=True, model=FAST_MODEL))
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


# 类别 → 行业侧叫法/代码侧叫法的规则兜底（LLM 不可用时保证映射卡有内容）
_CAT_NAMING = {
    "就诊流程": ("就诊流转", "状态机 / 流程编排", "病人从挂号到完成的整条路怎么走，错一步流程就乱。"),
    "患者/对象": ("患者档案", "数据模型 / 实体", "把每个病人的信息存成档案，后面所有操作都认它。"),
    "临床": ("临床处置", "业务规则", "开方、用药这些和病人安全直接相关的判断逻辑。"),
    "合规/红线": ("合规红线", "校验 / 权限控制", "隐私和资质这类碰不得的线，代码里得拦住。"),
    "组织": ("机构/科室", "组织结构建模", "诊所、科室、人员的归属关系怎么组织。"),
    "交易": ("交易流水", "事务 / 订单", "一笔业务要么全成、要么全不动，不能做一半。"),
    "风控": ("风控核身", "校验 / 风控规则", "确认是本人、额度合规这类把关逻辑。"),
}


def _fallback_mapping(industry: str, scan: dict) -> dict:
    cats = []
    seen = set()
    for h in scan.get("hits", []):
        c = h.get("category", "")
        if c and c not in seen:
            seen.add(c)
            cats.append((c, h.get("where", [])[:1]))
    concepts = []
    for c, files in cats[:5]:
        naming = _CAT_NAMING.get(c)
        if naming:
            ind_name, code_name, role = naming
        else:
            ind_name, code_name, role = c, "业务模块", f"项目里和「{c}」相关的一块逻辑。"
        concepts.append({
            "industryName": ind_name,
            "codeName": code_name,
            "role": role,
            "files": files,
        })
    return {"industry": industry, "concepts": concepts, "fallback": True}
