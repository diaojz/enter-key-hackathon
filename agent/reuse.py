"""公共模块抽取 —— 从扫盘结果识别可复用的行业轮子。

铁律：只读，不写、不改任何用户文件。
纯静态正则分析，零三方依赖。
输出对齐 Agent接口契约.html 的 reuseHint 结构。
"""

import os
import re
from collections import OrderedDict

# 代码文件后缀：与 scanner.py 对齐，只扫文本/代码文件
CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".vue", ".java", ".go", ".rb",
    ".php", ".cs", ".kt", ".swift", ".sql",
}
SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__", ".venv",
    "venv", ".next", ".idea", ".vscode", "vendor", "target", ".cache",
}

# 最多返回的候选数
MAX_CANDIDATES = 5

# 每段 snippet 最大字符数
SNIPPET_MAX_CHARS = 200
# snippet 最多取几行
SNIPPET_MAX_LINES = 6

# ── 可复用单元的正则模式（按语言分组）──────────────────────────────────────────

# 匹配函数/类/状态机定义的起始行
# 组1=name，用于后续匹配行业关键词
_PATTERNS = [
    # Python: def / class / UPPERCASE_STATES / UPPERCASE_FSM 常量
    re.compile(r"^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]+)\s*\("),
    re.compile(r"^class\s+([A-Za-z_][A-Za-z0-9_]+)\s*[:(]"),
    re.compile(r"^([A-Z][A-Z0-9_]*(?:STATES?|FSM|STATUS|FLOW|MAP))\s*=\s*[\[\{]"),
    # JS/TS: function / export function / const xxx = (...) => / const xxxFSM
    re.compile(r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]+)\s*\("),
    re.compile(r"^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\("),
    re.compile(r"^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]+(?:FSM|States?|Status|Flow))\s*="),
    # Go: func
    re.compile(r"^func\s+([A-Za-z_][A-Za-z0-9_]+)\s*\("),
    # Java/Kotlin: public/private/protected method
    re.compile(r"^\s*(?:public|private|protected|static)\s+\S+\s+([A-Za-z_][A-Za-z0-9_]+)\s*\("),
]

# ── 行业关键词（轻量版，优先识别"行业味"名字）──────────────────────────────────

# 医疗
_MEDICAL_TERMS = [
    "patient", "患者", "visit", "就诊", "validate", "校验", "register", "挂号",
    "diagnosis", "诊断", "prescription", "处方", "medication", "用药",
    "queue", "候诊", "referral", "转诊", "consent", "知情", "mrn", "病案",
    "contraindication", "禁忌", "doctor", "医", "clinic", "门诊", "ward", "住院",
    "schedule", "排班", "department", "科室", "followup", "复诊",
]
# 金融
_FINANCE_TERMS = [
    "account", "账户", "transaction", "交易", "payment", "支付", "balance", "余额",
    "risk", "风控", "credit", "信用", "loan", "贷款", "invoice", "发票",
    "ledger", "台账", "audit", "审计", "compliance", "合规",
]
# 工业/制造
_INDUSTRY_TERMS = [
    "device", "设备", "sensor", "传感器", "production", "产线", "quality", "质检",
    "batch", "批次", "maintenance", "维保", "alarm", "告警", "iot",
    "factory", "工厂", "workshop", "车间",
]
# 教育
_EDUCATION_TERMS = [
    "student", "学生", "course", "课程", "exam", "考试", "score", "成绩",
    "teacher", "教师", "class", "班级", "assignment", "作业", "grade", "年级",
]
# 电商
_ECOMMERCE_TERMS = [
    "order", "订单", "cart", "购物车", "product", "商品", "inventory", "库存",
    "coupon", "优惠", "sku", "shipping", "物流", "refund", "退款",
]

# 按行业打包，key 对应 infer_profile 返回的 industry 字段
INDUSTRY_TERM_MAP = {
    "医疗":     _MEDICAL_TERMS,
    "金融":     _FINANCE_TERMS,
    "工业/制造": _INDUSTRY_TERMS,
    "教育":     _EDUCATION_TERMS,
    "电商/零售": _ECOMMERCE_TERMS,
}


def _has_industry_keyword(name: str, industry: str) -> bool:
    """函数/类名里是否含对应行业的关键词（不区分大小写）。"""
    name_lower = name.lower()
    terms = INDUSTRY_TERM_MAP.get(industry, [])
    # 通用校验/验证词——对任何行业都加分
    generic_terms = ["validate", "verify", "check", "校验", "validate", "fsm", "state", "status"]
    for t in terms + generic_terms:
        if t.lower() in name_lower:
            return True
    return False


def _name_to_label(raw_name: str, lines_context: list[str], industry: str) -> str:
    """把代码标识符翻译成人类可读标签，优先从注释提取，次选驼峰拆分。"""
    # 先找该定义行附近（上方 1 行或同行）的中文注释
    for line in reversed(lines_context):
        # 中文注释行：# 或 //
        m = re.search(r"[#/]+\s*([一-鿿][^\n]{2,30})", line)
        if m:
            return m.group(1).strip()

    # 没有中文注释，做驼峰/下划线拆词再猜
    # 例：validate_patient_id → 校验 patient id（保留英文，前端可接受）
    words = re.sub(r"([A-Z])", r" \1", raw_name).replace("_", " ").strip()
    return words if words else raw_name


def _extract_snippet(lines: list[str], start: int) -> str:
    """从 start 行开始取最多 SNIPPET_MAX_LINES 行作为代码片段。"""
    chunk = lines[start: start + SNIPPET_MAX_LINES]
    snippet = "\n".join(chunk)
    if len(snippet) > SNIPPET_MAX_CHARS:
        snippet = snippet[:SNIPPET_MAX_CHARS] + "…"
    return snippet


def _scan_file_for_reusable(path: str, rel: str, root: str, industry: str) -> list[dict]:
    """扫单个文件，返回命中的可复用单元列表。"""
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(128 * 1024)  # 最多 128KB
    except OSError:
        return []

    lines = content.splitlines()
    results = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        for pat in _PATTERNS:
            m = pat.match(stripped)
            if not m:
                continue
            name = m.group(1)
            # 只保留行业相关的单元
            if not _has_industry_keyword(name, industry):
                break  # 同一行只需第一个匹配
            # 取上方 1 行+当前行作为注释上下文
            context = lines[max(0, i - 1): i + 1]
            label = _name_to_label(name, context, industry)
            snippet = _extract_snippet(lines, i)
            results.append({
                "name": label,
                "rawName": name,
                "file": rel,
                "snippet": snippet,
            })
            break  # 避免同一行被多个 pattern 重复命中

    return results


def extract_reusable(scan: dict, profile: dict) -> dict:
    """从扫盘结果抽取可复用公共模块候选。

    返回结构对齐 Agent接口契约.html 的 reuseHint（含 matchedIndustry / candidates）。
    即使行业=未知也尝试抽取，抽不到则 candidates 为空。
    """
    industry = profile.get("industry", "未知")
    root = scan.get("root", "")

    if not os.path.isdir(root):
        return {"matchedIndustry": industry, "candidates": []}

    # 从 hits 里收集已知命中文件（这些文件行业味最浓，优先扫）
    hit_files: set[str] = set()
    for h in scan.get("hits", []):
        for rel in h.get("where", []):
            hit_files.add(rel)

    # 如果命中文件不足，补充目录遍历
    all_files: list[tuple[str, str]] = []  # (abs_path, rel_path)
    for rel in hit_files:
        abs_path = os.path.join(root, rel)
        ext = os.path.splitext(rel)[1].lower()
        if os.path.isfile(abs_path) and ext in CODE_EXTS:
            all_files.append((abs_path, rel))

    # 补充目录遍历，扩大覆盖面（最多再加 30 个文件）
    walked = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in CODE_EXTS:
                continue
            abs_path = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_path, root)
            if rel not in hit_files:
                all_files.append((abs_path, rel))
                walked += 1
                if walked >= 30:
                    break
        if walked >= 30:
            break

    # 逐文件抽取，先收集所有候选再排序（避免因扫描顺序漏掉重要轮子）
    all_items: list[dict] = []
    seen_raw: set[str] = set()
    from_project = os.path.basename(root.rstrip("/"))

    for abs_path, rel in all_files:
        for item in _scan_file_for_reusable(abs_path, rel, root, industry):
            raw = item["rawName"]
            if raw not in seen_raw:
                seen_raw.add(raw)
                all_items.append({
                    "name": item["name"],
                    "rawName": raw,
                    "fromProject": from_project,
                    "snippet": item["snippet"],
                    "file": item["file"],
                })

    # 排序：名字里含中文或注释里有中文（说明更贴近业务）的排前面
    def _rank(item: dict) -> int:
        # 0 = 最高优先级
        name = item["name"]
        raw = item["rawName"]
        score = 0
        # 含中文注释提炼的 label（有汉字）→ 加分
        if re.search(r"[一-鿿]", name):
            score -= 10
        # 是函数/独立工具（非 class 本身）→ 加分
        if not re.match(r"^[A-Z][a-z]", raw):  # 不是 PascalCase 类名
            score -= 5
        return score

    all_items.sort(key=_rank)

    # 去重后取 top N（保留排序，去掉 rawName 字段不对外暴露）
    candidates = []
    for item in all_items[:MAX_CANDIDATES]:
        candidates.append({
            "name": item["name"],
            "fromProject": item["fromProject"],
            "snippet": item["snippet"],
            "file": item["file"],
        })

    return {
        "matchedIndustry": industry,
        "candidates": candidates,
    }
