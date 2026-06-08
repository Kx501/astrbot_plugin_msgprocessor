# -*- coding: utf-8 -*-
"""占位符扫描：preset + 自定义正则，供 placeholder_* 模块与 locate(placeholder) 共用。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

# 内置 preset 名称 → 正则（相对当前作用域文本）
PRESET_PATTERNS: dict[str, str] = {
    "bracket": r"\[[^\[\]\n]*\]",
    "mustache": r"\{\{[^{}\n]*\}\}",
    "percent": r"%[^%\n]+%",
    "dollar": r"\$\{[^}\n]*\}",
    "curly": r"\{[a-zA-Z_][a-zA-Z0-9_]*\}",
}

DEFAULT_PRESETS: tuple[str, ...] = ("bracket", "mustache")


@dataclass(frozen=True)
class PlaceholderSpan:
    """相对被扫描文本的半开区间。"""

    start: int
    end: int
    preset: str | None = None


def _normalize_presets(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return list(DEFAULT_PRESETS)
    out: list[str] = []
    for item in raw:
        key = str(item).strip().lower()
        if key and key in PRESET_PATTERNS and key not in out:
            out.append(key)
    return out if out else list(DEFAULT_PRESETS)


def _normalize_custom_patterns(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        pat = str(item).strip()
        if pat and pat not in out:
            out.append(pat)
    return out


def parse_scan_config(cfg: dict[str, Any]) -> tuple[list[str], list[str], bool]:
    """解析 presets、custom_patterns、include_empty。"""
    presets = _normalize_presets(cfg.get("presets"))
    custom = _normalize_custom_patterns(cfg.get("custom_patterns"))
    include_empty = bool(cfg.get("include_empty", True))
    return presets, custom, include_empty


@lru_cache(maxsize=256)
def _compile_custom(pattern: str) -> re.Pattern[str] | None:
    try:
        return re.compile(pattern)
    except re.error:
        return None


def _inner_substance(matched: str, preset: str | None) -> str:
    s = matched.strip()
    if preset == "bracket" and len(s) >= 2 and s[0] == "[" and s[-1] == "]":
        return s[1:-1].strip()
    if preset == "mustache" and len(s) >= 4 and s[:2] == "{{" and s[-2:] == "}}":
        return s[2:-2].strip()
    if preset == "percent" and len(s) >= 2 and s[0] == "%" and s[-1] == "%":
        return s[1:-1].strip()
    if preset == "dollar" and s.startswith("${") and s.endswith("}"):
        return s[2:-1].strip()
    if preset == "curly" and len(s) >= 2 and s[0] == "{" and s[-1] == "}":
        return s[1:-1].strip()
    return s


def _accept_span(text: str, start: int, end: int, preset: str | None, *, include_empty: bool) -> bool:
    if start < 0 or end > len(text) or start >= end:
        return False
    if include_empty:
        return True
    return bool(_inner_substance(text[start:end], preset))


def _merge_spans(spans: list[PlaceholderSpan]) -> list[PlaceholderSpan]:
    if not spans:
        return []
    ordered = sorted(spans, key=lambda s: (s.start, s.end))
    merged: list[PlaceholderSpan] = [ordered[0]]
    for span in ordered[1:]:
        last = merged[-1]
        if span.start <= last.end:
            merged[-1] = PlaceholderSpan(
                last.start,
                max(last.end, span.end),
                last.preset or span.preset,
            )
        else:
            merged.append(span)
    return merged


def scan_placeholders(text: str, cfg: dict[str, Any]) -> list[PlaceholderSpan]:
    """扫描文本中所有占位符区间（合并重叠后）。"""
    if not text:
        return []
    presets, custom, include_empty = parse_scan_config(cfg)
    found: list[PlaceholderSpan] = []

    for preset in presets:
        pattern = PRESET_PATTERNS.get(preset)
        if not pattern:
            continue
        for m in re.finditer(pattern, text):
            rs, re_ = m.span()
            if _accept_span(text, rs, re_, preset, include_empty=include_empty):
                found.append(PlaceholderSpan(rs, re_, preset))

    for pat in custom:
        rx = _compile_custom(pat)
        if rx is None:
            continue
        for m in rx.finditer(text):
            rs, re_ = m.span()
            if _accept_span(text, rs, re_, None, include_empty=include_empty):
                found.append(PlaceholderSpan(rs, re_, "custom"))

    return _merge_spans(found)


def has_placeholders(text: str, cfg: dict[str, Any]) -> bool:
    return bool(scan_placeholders(text, cfg))


def apply_placeholder_spans(
    text: str,
    spans: list[PlaceholderSpan],
    *,
    replacement: str | None,
) -> str:
    """按区间删除或替换占位符；从右向左避免下标漂移。"""
    if not spans:
        return text
    buf = text
    for span in sorted(spans, key=lambda s: s.start, reverse=True):
        if replacement is None:
            buf = buf[: span.start] + buf[span.end :]
        else:
            buf = buf[: span.start] + replacement + buf[span.end :]
    return buf


def delete_placeholders(text: str, cfg: dict[str, Any]) -> str:
    spans = scan_placeholders(text, cfg)
    return apply_placeholder_spans(text, spans, replacement=None)


def replace_placeholders(text: str, cfg: dict[str, Any], *, replacement: str) -> str:
    spans = scan_placeholders(text, cfg)
    return apply_placeholder_spans(text, spans, replacement=replacement)
