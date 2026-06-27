"""④提醒 —— 踩到关键行业信息时，主动弹桌宠通知。

把前面的"评价/复用"能力主动化：不用用户打开工作台，扫一个目录后，
若发现值得提醒的事（high 红线 / 有现成轮子可复用），就：
  1. 推 notification 状态给桌宠（变脸 + 气泡）
  2. 返回结构化提醒内容，供调用方展示

最小触发：CLI `python3 notify.py <目录>` 或 HTTP /notify。
桌宠没开也不报错（提醒照常算，只是不弹）。
"""

import os

from scanner import scan_dir, infer_profile
from profile_store import apply_override
from reuse import extract_reusable
from reuse_store import match_reuse_hint
from pet_bridge import push_state


def build_notifications(root: str, *, use_llm: bool = False) -> dict:
    """扫一个目录，算出该提醒用户的事。不依赖 LLM（默认），保证快、稳。

    返回 { industry, alerts:[{type,level,title,detail}] }
      type: redline（红线） | reuse（可复用） | profile（画像识别）
    """
    scan = scan_dir(root)
    profile = apply_override(infer_profile(scan), scan["root"])
    industry = profile.get("industry", "未知")

    alerts = []

    # 1) 识别到行业（第一次进新项目时最有用）
    if industry != "未知":
        ev = "、".join(profile.get("evidence", [])[:3])
        alerts.append({
            "type": "profile",
            "level": "info",
            "title": f"识别到这是「{industry}」项目",
            "detail": f"凭据：{ev}" if ev else "",
        })

    # 2) 行业红线（最该主动提醒的）—— 不调 LLM，靠关键词命中 + 红线清单的启发式
    redline_hits = _scan_redline_signals(scan, industry)
    for rl in redline_hits:
        alerts.append({
            "type": "redline",
            "level": "high",
            "title": "踩到行业红线",
            "detail": rl,
        })

    # 3) 可复用轮子提醒（同行业库里有现成的）
    reuse = extract_reusable(scan, profile)
    hint = match_reuse_hint(industry, reuse.get("candidates", []), scan["root"])
    if hint.get("candidates"):
        names = "、".join(c["name"] for c in hint["candidates"][:3])
        alerts.append({
            "type": "reuse",
            "level": "info",
            "title": "有现成轮子可复用",
            "detail": f"{hint['message']}：{names}",
        })

    return {"industry": industry, "root": scan["root"], "alerts": alerts}


# 关键词 → 红线信号的启发式（不调 LLM，给"主动提醒"用，要快）
# 每个行业：若代码里同时命中"敏感词"和"危险动作词"，就判为可能踩红线。
_REDLINE_SIGNALS = {
    "医疗": [
        (["patient", "患者", "idCard", "身份证", "phone", "手机"],
         ["localStorage", "明文", "console.log", "print("],
         "患者隐私字段可能在明文存储/打印——违反医疗数据红线"),
        (["挂号", "register", "就诊时段", "slot", "appointment"],
         ["push(", "无锁", "并发"],
         "挂号/就诊时段写入可能没防并发，会重复挂号"),
        (["处方", "prescribe", "用药", "medication"],
         ["return", "def ", "function"],
         "开处方流程注意校验禁忌症"),
    ],
    "金融": [
        (["金额", "amount", "余额", "balance", "price"],
         ["float", "double", "0.1", "浮点"],
         "金额用了浮点数——金融计算须用定点/整数分"),
        (["交易", "transaction", "支付", "payment", "扣款"],
         ["无幂等", "重复", "retry"],
         "交易缺幂等保护，可能重复扣款"),
    ],
}


def _scan_redline_signals(scan: dict, industry: str) -> list:
    """启发式扫红线信号：读命中文件，看是否同时出现敏感词+危险动作词。"""
    signals = _REDLINE_SIGNALS.get(industry)
    if not signals:
        return []
    root = scan["root"]
    # 收集要看的文件（命中行业词的）
    files = set()
    for h in scan.get("hits", []):
        if h.get("industry") == industry:
            for w in h.get("where", []):
                files.add(w)
    out = []
    seen = set()
    for rel in list(files)[:30]:
        try:
            with open(os.path.join(root, rel), "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(20000)
        except OSError:
            continue
        for sensitive, danger, msg in signals:
            if any(s in content for s in sensitive) and any(d in content for d in danger):
                if msg not in seen:
                    out.append(msg)
                    seen.add(msg)
    return out


def fire(root: str, *, use_llm: bool = False, to_pet: bool = True) -> dict:
    """算提醒 + 推桌宠通知。返回提醒内容。"""
    result = build_notifications(root, use_llm=use_llm)
    alerts = result["alerts"]
    if to_pet and alerts:
        # 有 high 级 → notification 弹气泡；否则也轻推一下识别结果
        has_high = any(a["level"] == "high" for a in alerts)
        top = next((a for a in alerts if a["level"] == "high"), alerts[0])
        push_state("notification",
                   event=top["title"] + ("：" + top["detail"] if top.get("detail") else ""),
                   cwd=result["root"])
    return result


if __name__ == "__main__":
    import sys
    import json
    if len(sys.argv) < 2:
        print("用法：python3 notify.py <目录>")
        sys.exit(1)
    res = fire(sys.argv[1])
    print(json.dumps(res, ensure_ascii=False, indent=2))
