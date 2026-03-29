# -*- coding: utf-8 -*-
"""内置处理模块注册表。"""
from __future__ import annotations

from typing import Any, Callable

from .models import MatchHit, ModuleResult, ProcessingContext

ModuleFn = Callable[[str, dict[str, Any], ProcessingContext, MatchHit | None], ModuleResult]


def mod_noop(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    return ModuleResult(text)


def mod_replace(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    out = text
    pairs = cfg.get("pairs")
    if isinstance(pairs, list):
        for item in pairs:
            if not isinstance(item, dict):
                continue
            f = item.get("from")
            t = item.get("to", "")
            if isinstance(f, str):
                out = out.replace(f, str(t))
    old = cfg.get("from")
    if isinstance(old, str):
        out = out.replace(old, str(cfg.get("to", "")))
    return ModuleResult(out)


def mod_translate_stub(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    prefix = str(cfg.get("prefix", "[译]"))
    return ModuleResult(prefix + text)


def mod_append(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    return ModuleResult(text + str(cfg.get("text", "")))


def mod_filter(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    must_contain = cfg.get("must_contain")
    if isinstance(must_contain, str) and must_contain not in text:
        return ModuleResult(text, skip_rule=True)
    return ModuleResult(text)


BUILTIN_MODULES: dict[str, ModuleFn] = {
    "noop": mod_noop,
    "replace": mod_replace,
    "translate_stub": mod_translate_stub,
    "append": mod_append,
    "filter": mod_filter,
}


def get_module(mid: str) -> ModuleFn | None:
    return BUILTIN_MODULES.get(mid)
