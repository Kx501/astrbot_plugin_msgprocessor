# -*- coding: utf-8 -*-
"""内置处理模块注册表。

内层模块只对 match_block 已命中的命中段（``region_text``）做变换，不再次执行主 ``matcher``
（不做第二轮 find_hits / 正则扫描）。replace 默认使用字面量 ``str.replace``。
"""
from __future__ import annotations

import re
from typing import Any, Callable

from .models import MatchHit, ModuleResult, ProcessingContext

ModuleFn = Callable[[str, dict[str, Any], ProcessingContext, MatchHit | None], ModuleResult]


def _parse_regex_flags(raw: Any) -> int:
    if isinstance(raw, str):
        names = [s.strip() for s in raw.split(",") if s.strip()]
    elif isinstance(raw, list):
        names = [str(s).strip() for s in raw if str(s).strip()]
    else:
        names = []
    bits = 0
    for name in names:
        key = name.upper().replace("RE.", "")
        if hasattr(re, key):
            bits |= int(getattr(re, key))
    return bits


def mod_noop(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    return ModuleResult(text)


def mod_replace(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """在命中段内替换：默认字面量；可选 regex 模式（re.sub）。"""
    out = text
    old = cfg.get("from")
    whole_from_empty = bool(cfg.get("whole_from_empty", False))
    from_is_empty = (not isinstance(old, str)) or old == ""
    to_val = str(cfg.get("to", ""))

    # 保持旧语义：from 为空字符串/未填时不做任何替换（no-op）
    # 可选开关：whole_from_empty 打开时，from 为空则对“命中段全文”执行替换
    if from_is_empty:
        if whole_from_empty:
            return ModuleResult(to_val)
        return ModuleResult(out)

    if bool(cfg.get("regex", False)):
        try:
            out = re.sub(old, to_val, out, flags=_parse_regex_flags(cfg.get("regex_flags")))
        except re.error:
            return ModuleResult(out)
        return ModuleResult(out)

    # from 非空时：按 str.replace 对命中段做全文替换
    out = out.replace(old, to_val)
    return ModuleResult(out)


def translate_llm_fallback(text: str, cfg: dict[str, Any]) -> str:
    """未注入 AI翻译或调用失败时的回退：前缀 + 原文。"""
    prefix = str(cfg.get("prefix", "[译]"))
    return prefix + text


def mod_append(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    return ModuleResult(text + str(cfg.get("text", "")))


def mod_prepend(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """在命中段前拼接字面量前缀（``prefix + text``）。"""
    return ModuleResult(str(cfg.get("prefix", "")) + text)


def mod_delete(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """删除命中段内所有与 ``from`` 相同的字面量（整段替换为空）。"""
    out = text
    old = cfg.get("from")
    whole_from_empty = bool(cfg.get("whole_from_empty", False))
    from_is_empty = (not isinstance(old, str)) or old == ""

    # 保持旧语义：from 为空字符串/未填时不做任何删除（no-op）
    # 可选开关：whole_from_empty 打开时，from 为空则对“命中段全文”执行删除
    if from_is_empty:
        if whole_from_empty:
            return ModuleResult("")
        return ModuleResult(out)

    # from 非空时：按 str.replace 删除命中段内所有匹配子串
    out = out.replace(old, "")
    return ModuleResult(out)


BUILTIN_MODULES: dict[str, ModuleFn] = {
    "noop": mod_noop,
    "replace": mod_replace,
    "delete": mod_delete,
    "prepend": mod_prepend,
    "append": mod_append,
}


def get_module(mid: str) -> ModuleFn | None:
    return BUILTIN_MODULES.get(mid)
