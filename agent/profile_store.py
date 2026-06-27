"""画像持久化 —— 用户在工作台手改的行业画像，按项目目录存下来，下次扫同目录沿用。

这是「人设跟随」的最小落地：你改一次，系统记一辈子，评价也跟着改后的画像走。

存储：~/.coda/profiles.json
  { "<abs_root>": {"industry": "...", "redlines": [...], "subDomain": "...",
                   "roleGuess": "...", "_editedAt": "<由调用方传入或留空>"} }

只存「覆盖项」（用户改过的字段），扫盘照常跑，应用时把覆盖盖在自动推断结果上。
纯标准库、原子写、坏文件不致命。
"""

import json
import os
import tempfile

STORE_DIR = os.path.join(os.path.expanduser("~"), ".coda")
STORE_PATH = os.path.join(STORE_DIR, "profiles.json")

# 允许被用户覆盖的字段（白名单，防止前端塞乱字段）
OVERRIDABLE = {"industry", "redlines", "subDomain", "roleGuess"}


def _abs(root: str) -> str:
    return os.path.abspath(os.path.expanduser(root))


def _load_all() -> dict:
    try:
        with open(STORE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError, ValueError):
        return {}


def _save_all(data: dict) -> None:
    os.makedirs(STORE_DIR, exist_ok=True)
    # 原子写：先写临时文件再 rename，避免半截文件
    fd, tmp = tempfile.mkstemp(dir=STORE_DIR, prefix=".profiles.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, STORE_PATH)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def get_override(root: str) -> dict:
    """取某目录的画像覆盖；没有则返回空 dict。"""
    return _load_all().get(_abs(root), {})


def set_override(root: str, override: dict, *, edited_at: str = "") -> dict:
    """保存某目录的画像覆盖。只接受白名单字段。返回保存后的覆盖。

    若用户只改了 industry、没显式给 redlines，自动补上该行业的默认红线 +
    子领域 + 角色画像，让后续评价真正跟着改后的行业走（人设跟随）。
    """
    clean = {k: v for k, v in (override or {}).items() if k in OVERRIDABLE}

    # 改了行业但没手编红线 → 按新行业补默认红线/子领域/角色
    if "industry" in clean and "redlines" not in clean:
        from keywords import INDUSTRY_REDLINES, INDUSTRY_SUBDOMAIN
        ind = clean["industry"]
        if ind in INDUSTRY_REDLINES:
            clean["redlines"] = INDUSTRY_REDLINES[ind]
        if ind in INDUSTRY_SUBDOMAIN and "subDomain" not in clean:
            clean["subDomain"] = INDUSTRY_SUBDOMAIN[ind]

    if edited_at:
        clean["_editedAt"] = edited_at
    data = _load_all()
    key = _abs(root)
    merged = {**data.get(key, {}), **clean}  # 合并：只改传入的字段，其余保留
    data[key] = merged
    _save_all(data)
    return merged


def clear_override(root: str) -> None:
    """清掉某目录的覆盖（恢复自动推断）。"""
    data = _load_all()
    key = _abs(root)
    if key in data:
        del data[key]
        _save_all(data)


def apply_override(profile: dict, root: str) -> dict:
    """把某目录的覆盖盖在自动推断的 profile 上，返回新 profile。

    被用户改过的字段会标记 edited=True，前端可显示「已手改」。
    """
    override = get_override(root)
    if not override:
        return profile
    result = dict(profile)
    edited_fields = []
    for k in OVERRIDABLE:
        if k in override and override[k] not in (None, "", []):
            result[k] = override[k]
            edited_fields.append(k)
    if edited_fields:
        result["edited"] = True
        result["editedFields"] = edited_fields
        if override.get("_editedAt"):
            result["editedAt"] = override["_editedAt"]
        # 用户既然确认了行业，置信度拉满（这是他说的，不是猜的）
        if "industry" in edited_fields:
            result["confidence"] = 1.0
    return result
