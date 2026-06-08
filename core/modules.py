# -*- coding: utf-8 -*-
"""内置处理模块注册表。

变换模块对当前作用域文本（``working_text``）操作，不执行定位/路由。
replace 默认使用字面量 ``str.replace``。
"""
from __future__ import annotations

import re
from typing import Any, Callable

from .conditions import eval_condition
from .models import MatchHit, ModuleResult, ProcessingContext
from .placeholders import delete_placeholders, has_placeholders, replace_placeholders

ModuleFn = Callable[[str, dict[str, Any], ProcessingContext, MatchHit | None], ModuleResult]

_BACKSLASH_PLACEHOLDER = "\x00"

_GUARD_OUTCOMES = frozenset({"pass", "block", "halt", "goto"})


def _unescape_config_literal(s: str) -> str:
    """配置字面量中的 ``\\n``、``\\t``、``\\\\`` 等转为实际字符。"""
    out = s.replace("\\\\", _BACKSLASH_PLACEHOLDER)
    out = out.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
    return out.replace(_BACKSLASH_PLACEHOLDER, "\\")


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


def _parse_guard_outcome(raw: Any, *, default: str = "pass") -> str:
    s = str(raw or default).strip().lower()
    return s if s in _GUARD_OUTCOMES else default


def _guard_result(text: str, outcome: str, cfg: dict[str, Any], when_key: str) -> ModuleResult:
    if outcome == "block":
        return ModuleResult(text="", drop=True)
    if outcome == "halt":
        return ModuleResult(text, halt=True)
    if outcome == "goto":
        target = str(cfg.get(f"{when_key}_goto") or "").strip()
        if target:
            return ModuleResult(text, goto=target)
        return ModuleResult(text)
    return ModuleResult(text)


def mod_guard(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """条件守卫：对当前作用域文本做运算型判断，按成立/不成立配置 pass / block / halt / goto。"""
    _ = hit
    full = ctx.message if isinstance(ctx.message, str) else text
    matched = eval_condition(text, full, cfg)
    when_key = "when_true" if matched else "when_false"
    outcome = _parse_guard_outcome(cfg.get(when_key), default="pass")
    return _guard_result(text, outcome, cfg, when_key)


def mod_noop(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    _ = cfg, ctx, hit
    return ModuleResult(text)


def mod_replace(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """在命中段内替换：默认字面量；可选 regex 模式（re.sub）。"""
    _ = ctx, hit
    out = text
    old = cfg.get("from")
    whole_from_empty = bool(cfg.get("whole_from_empty", False))
    from_is_empty = (not isinstance(old, str)) or old == ""
    to_val = str(cfg.get("to", ""))

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

    out = out.replace(old, to_val)
    return ModuleResult(out)


def translate_llm_fallback(text: str, cfg: dict[str, Any]) -> str:
    """未注入 AI翻译或调用失败时的回退：前缀 + 原文。"""
    prefix = _unescape_config_literal(str(cfg.get("prefix", "[译]")))
    return prefix + text


def mod_append(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    _ = ctx, hit
    suffix = _unescape_config_literal(str(cfg.get("text", "")))
    return ModuleResult(text + suffix)


def mod_prepend(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """在命中段前拼接字面量前缀（``prefix + text``）。"""
    _ = ctx, hit
    prefix = _unescape_config_literal(str(cfg.get("prefix", "")))
    return ModuleResult(prefix + text)


def _apply_boundary_trim(parts: list[str], *, trim_start: bool, trim_end: bool) -> list[str]:
    n = len(parts)
    out: list[str] = []
    for i, part in enumerate(parts):
        s = part
        if trim_end and i < n - 1:
            s = s.rstrip("\n\r")
        if trim_start and i > 0:
            s = s.lstrip("\n\r")
        out.append(s)
    return out


def _split_by_marker(
    text: str,
    marker: str,
    *,
    delete_marker: bool,
    trim_start: bool,
    trim_end: bool,
) -> list[str]:
    if marker == "" or marker not in text:
        return [text]
    if delete_marker:
        parts = text.split(marker)
    else:
        raw = text.split(marker)
        parts = [raw[0]]
        for chunk in raw[1:]:
            parts.append(marker + chunk)
    if trim_start or trim_end:
        parts = _apply_boundary_trim(parts, trim_start=trim_start, trim_end=trim_end)
    cleaned = [p for p in parts if p]
    return cleaned if cleaned else [text]


def mod_split(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """按标记将命中段拆为多条文本；拆分结果向上游传递为多条待发消息。"""
    _ = ctx, hit
    marker_raw = cfg.get("marker")
    if not isinstance(marker_raw, str) or marker_raw == "":
        return ModuleResult(text)
    marker = _unescape_config_literal(marker_raw)
    delete_marker = bool(cfg.get("delete_marker", True))
    trim_start = bool(cfg.get("trim_part_start", True))
    trim_end = bool(cfg.get("trim_part_end", True))
    parts = _split_by_marker(
        text,
        marker,
        delete_marker=delete_marker,
        trim_start=trim_start,
        trim_end=trim_end,
    )
    if len(parts) <= 1:
        return ModuleResult(parts[0] if parts else text)
    return ModuleResult(text=parts[0], split_parts=parts)


def _placeholder_scan_cfg(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "presets": cfg.get("presets"),
        "custom_patterns": cfg.get("custom_patterns"),
        "include_empty": cfg.get("include_empty", True),
    }


def mod_placeholder_block(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """当前作用域含占位符时拦截发送。"""
    _ = ctx, hit
    if has_placeholders(text, _placeholder_scan_cfg(cfg)):
        return ModuleResult(text="", drop=True)
    return ModuleResult(text)


def mod_placeholder_delete(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """删除当前作用域内的占位符片段。"""
    _ = ctx, hit
    return ModuleResult(delete_placeholders(text, _placeholder_scan_cfg(cfg)))


def mod_placeholder_replace(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """将占位符替换为配置的 fallback 文案。"""
    _ = ctx, hit
    replacement = str(cfg.get("replacement", ""))
    return ModuleResult(replace_placeholders(text, _placeholder_scan_cfg(cfg), replacement=replacement))


def mod_delete(text: str, cfg: dict[str, Any], ctx: ProcessingContext, hit: MatchHit | None) -> ModuleResult:
    """删除命中段内所有与 ``from`` 相同的字面量（整段替换为空）。"""
    _ = ctx, hit
    out = text
    old = cfg.get("from")
    whole_from_empty = bool(cfg.get("whole_from_empty", False))
    from_is_empty = (not isinstance(old, str)) or old == ""

    if from_is_empty:
        if whole_from_empty:
            return ModuleResult("")
        return ModuleResult(out)

    out = out.replace(old, "")
    return ModuleResult(out)


BUILTIN_MODULES: dict[str, ModuleFn] = {
    "noop": mod_noop,
    "replace": mod_replace,
    "delete": mod_delete,
    "prepend": mod_prepend,
    "append": mod_append,
    "split": mod_split,
    "split_by_marker": mod_split,
    "guard": mod_guard,
    "placeholder_block": mod_placeholder_block,
    "placeholder_delete": mod_placeholder_delete,
    "placeholder_replace": mod_placeholder_replace,
}


def get_module(mid: str) -> ModuleFn | None:
    return BUILTIN_MODULES.get(mid)
