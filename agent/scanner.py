"""扫盘引擎 —— 本地目录遍历 + 中英文关键词匹配 + 反推行业画像。

铁律：只读。只 open(... 'r')，绝不写、删、改任何用户文件。
输出对齐 Agent接口契约.html 的 /profile 入参（scan 结构）与画像反推。
"""

import os
import re
from collections import defaultdict

from keywords import (
    INDUSTRY_KEYWORDS,
    INDUSTRY_REDLINES,
    INDUSTRY_SUBDOMAIN,
    all_terms_flat,
)

# 只扫这些后缀的文本/代码文件，跳过二进制与依赖目录
CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".vue", ".java", ".go", ".rb",
    ".php", ".cs", ".kt", ".swift", ".sql", ".html", ".md", ".json",
    ".yaml", ".yml", ".txt", ".c", ".cpp", ".h",
}
SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__", ".venv",
    "venv", ".next", ".idea", ".vscode", "vendor", "target", ".cache",
}
MAX_FILE_BYTES = 512 * 1024  # 单文件最多读 512KB，避免大文件拖慢


def _iter_files(root: str):
    for dirpath, dirnames, filenames in os.walk(root):
        # 原地裁剪要跳过的目录
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext in CODE_EXTS:
                yield os.path.join(dirpath, fn)


def scan_dir(root: str):
    """遍历目录，统计每个关键词的命中次数与出现文件。

    返回 dict，结构对齐 /profile 入参的 scan 字段：
      { root, fileCount, hits[{term,count,where,category}], langs, sampleSnippets }
    """
    root = os.path.abspath(os.path.expanduser(root))
    if not os.path.isdir(root):
        raise NotADirectoryError(f"不是有效目录：{root}")

    # 每个行业、每个词的命中
    term_count = defaultdict(int)
    term_files = defaultdict(set)
    term_category = {}
    langs = defaultdict(int)
    sample_snippets = []
    file_count = 0

    # 预编译每个行业每个词的正则（词边界对英文，中文直接 in）
    matchers = []  # (industry, term, category, compiled_or_None)
    for industry, cats in INDUSTRY_KEYWORDS.items():
        for term, category in all_terms_flat(industry):
            if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", term):
                pat = re.compile(r"(?<![A-Za-z0-9_])" + re.escape(term) + r"(?![A-Za-z0-9_])",
                                 re.IGNORECASE)
            else:
                pat = None  # 中文/含特殊字符，用 str.count
            matchers.append((industry, term, category, pat))

    for path in _iter_files(root):
        file_count += 1
        ext = os.path.splitext(path)[1].lower()
        langs[ext] += 1
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(MAX_FILE_BYTES)
        except (OSError, UnicodeError):
            continue

        for industry, term, category, pat in matchers:
            if pat is not None:
                n = len(pat.findall(content))
            else:
                n = content.count(term)
            if n > 0:
                key = (industry, term)
                term_count[key] += n
                term_files[key].add(os.path.relpath(path, root))
                term_category[key] = category
                # 收集一条带行业词的代码样本（供 LLM 参考），最多 8 条
                if len(sample_snippets) < 8:
                    snip = _grab_snippet(content, term, pat)
                    if snip:
                        sample_snippets.append(snip)

    # 拍平成 hits 列表（合并行业维度，按总命中排序）
    hits = []
    for (industry, term), cnt in term_count.items():
        hits.append({
            "industry": industry,
            "term": term,
            "category": term_category[(industry, term)],
            "count": cnt,
            "where": sorted(term_files[(industry, term)])[:5],
        })
    hits.sort(key=lambda h: h["count"], reverse=True)

    return {
        "root": root,
        "fileCount": file_count,
        "hits": hits,
        "langs": _top_langs(langs),
        "sampleSnippets": sample_snippets,
    }


def _grab_snippet(content: str, term: str, pat):
    """抓一行包含 term 的代码作为样本。"""
    for line in content.splitlines():
        hit = pat.search(line) if pat is not None else (term in line)
        if hit:
            line = line.strip()
            if 0 < len(line) <= 160:
                return line
    return None


def _top_langs(langs: dict):
    ext_name = {
        ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
        ".tsx": "TypeScript", ".jsx": "JavaScript", ".vue": "Vue",
        ".java": "Java", ".go": "Go", ".sql": "SQL", ".html": "HTML",
    }
    ranked = sorted(langs.items(), key=lambda kv: kv[1], reverse=True)
    out, seen = [], set()
    for ext, _ in ranked:
        name = ext_name.get(ext)
        if name and name not in seen:
            out.append(name)
            seen.add(name)
    return out[:4]


def infer_profile(scan: dict):
    """从扫盘结果反推行业画像。对齐 /profile 出参结构。

    评分 = 命中的「不同类别」数量为主、总命中次数为辅。
    """
    # 按行业聚合：覆盖到的类别集合、总命中
    by_industry = defaultdict(lambda: {"categories": set(), "count": 0, "evidence": []})
    for h in scan["hits"]:
        ind = h["industry"]
        by_industry[ind]["categories"].add(h["category"])
        by_industry[ind]["count"] += h["count"]
        by_industry[ind]["evidence"].append((h["term"], h["count"]))

    if not by_industry:
        return {
            "industry": "未知",
            "confidence": 0.0,
            "evidence": [],
            "subDomain": "",
            "roleGuess": "",
            "editable": True,
            "redlines": [],
            "candidates": [],
        }

    # 打分：类别广度权重高
    def score(info):
        total_cats = len(INDUSTRY_KEYWORDS.get(_name_of(info), {})) or 1
        breadth = len(info["categories"]) / total_cats        # 0~1 覆盖了多少类别
        depth = min(info["count"], 100) / 100                  # 0~1 命中密度
        return breadth * 0.75 + depth * 0.25

    # 把 industry 名挂回 info 方便 score 取 total_cats
    for name, info in by_industry.items():
        info["_name"] = name

    ranked = sorted(by_industry.items(), key=lambda kv: score(kv[1]), reverse=True)
    top_name, top_info = ranked[0]
    confidence = round(score(top_info), 2)

    # 证据词：按命中次数取前 6
    evidence = sorted(top_info["evidence"], key=lambda x: x[1], reverse=True)[:6]
    evidence_str = [f"{t}×{c}" for t, c in evidence]

    candidates = [{"industry": n, "score": round(score(i), 2)} for n, i in ranked[:3]]

    return {
        "industry": top_name,
        "confidence": confidence,
        "evidence": evidence_str,
        "subDomain": INDUSTRY_SUBDOMAIN.get(top_name, ""),
        "roleGuess": _role_guess(top_name),
        "editable": True,
        "redlines": INDUSTRY_REDLINES.get(top_name, []),
        "candidates": candidates,
    }


def _name_of(info):
    return info.get("_name", "")


def _role_guess(industry: str):
    return {
        "医疗": "懂临床流程的开发者 / 诊所数字化负责人",
        "金融": "懂账务/风控的开发者",
        "工业/制造": "懂产线/工艺的开发者",
        "电商/零售": "懂交易/库存的开发者",
        "教育": "懂教务的开发者",
    }.get(industry, "该领域的开发者")
