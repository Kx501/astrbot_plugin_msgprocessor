# -*- coding: utf-8 -*-
"""内置处理模块注册表。

内层模块只对 match_block 已命中的命中段（``region_text``）做变换，不再次执行主 ``matcher``
（不做第二轮 find_hits / 正则扫描）。replace 使用字面量 ``str.replace``，与主匹配方式无关。
"""
from __future__ import annotations

from typing import Any, Callable

from .models import MatchHit, ModuleResult, ProcessingContext

ModuleFn = Callable[[str, dict[str, Any], ProcessingContext, MatchHit | None], ModuleResult]


def mod_noop(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    return ModuleResult(text)


def mod_replace(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """在命中段内做字面量替换（``str.replace``），非正则、不重跑主匹配。"""
    out = text
    old = cfg.get("from")
    if isinstance(old, str) and old != "":
        out = out.replace(old, str(cfg.get("to", "")))
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
    if isinstance(old, str) and old != "":
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
