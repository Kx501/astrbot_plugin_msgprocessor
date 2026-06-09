# -*- coding: utf-8 -*-
"""标记处理：字面量标记（分割）与模式标记（预设/正则，拦截/删除/替换/locate）。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

# 内置模式标记 preset → 正则
PRESET_PATTERNS: dict[str, str] = {
    "bracket": r"\[[^\[\]\n]*\]",
    "mustache": r"\{\{[^{}\n]*\}\}",
    "percent": r"%[^%\n]+%",
    "dollar": r"\$\{[^}\n]*\}",
    "curly": r"\{[a-zA-Z_][a-zA-Z0-9_]*\}",
}

DEFAULT_PRESETS: tuple[str, ...] = ("bracket", "mustache")

_BACKSLASH_PLACEHOLDER = "\x00"


def unescape_config_literal(s: str) -> str:
    out = s.replace("\\\\", _BACKSLASH_PLACEHOLDER)
    out = out.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
    return out.replace(_BACKSLASH_PLACEHOLDER, "\\")


@dataclass(frozen=True)
class MarkerSpan:
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


def parse_pattern_config(cfg: dict[str, Any]) -> tuple[list[str], list[str], bool]:
    """模式标记：presets、custom_patterns、include_empty。"""
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


def _merge_spans(spans: list[MarkerSpan]) -> list[MarkerSpan]:
    if not spans:
        return []
    ordered = sorted(spans, key=lambda s: (s.start, s.end))
    merged: list[MarkerSpan] = [ordered[0]]
    for span in ordered[1:]:
        last = merged[-1]
        if span.start <= last.end:
            merged[-1] = MarkerSpan(
                last.start,
                max(last.end, span.end),
                last.preset or span.preset,
            )
        else:
            merged.append(span)
    return merged


def scan_pattern_markers(text: str, cfg: dict[str, Any]) -> list[MarkerSpan]:
    """扫描模式标记区间（预设 + 自定义正则，合并重叠）。"""
    if not text:
        return []
    presets, custom, include_empty = parse_pattern_config(cfg)
    found: list[MarkerSpan] = []

    for preset in presets:
        pattern = PRESET_PATTERNS.get(preset)
        if not pattern:
            continue
        for m in re.finditer(pattern, text):
            rs, re_ = m.span()
            if _accept_span(text, rs, re_, preset, include_empty=include_empty):
                found.append(MarkerSpan(rs, re_, preset))

    for pat in custom:
        rx = _compile_custom(pat)
        if rx is None:
            continue
        for m in rx.finditer(text):
            rs, re_ = m.span()
            if _accept_span(text, rs, re_, None, include_empty=include_empty):
                found.append(MarkerSpan(rs, re_, "custom"))

    return _merge_spans(found)


def has_pattern_markers(text: str, cfg: dict[str, Any]) -> bool:
    return bool(scan_pattern_markers(text, cfg))


def apply_marker_spans(
    text: str,
    spans: list[MarkerSpan],
    *,
    replacement: str | None,
) -> str:
    if not spans:
        return text
    buf = text
    for span in sorted(spans, key=lambda s: s.start, reverse=True):
        if replacement is None:
            buf = buf[: span.start] + buf[span.end :]
        else:
            buf = buf[: span.start] + replacement + buf[span.end :]
    return buf


def delete_pattern_markers(text: str, cfg: dict[str, Any]) -> str:
    spans = scan_pattern_markers(text, cfg)
    return apply_marker_spans(text, spans, replacement=None)


def replace_pattern_markers(text: str, cfg: dict[str, Any], *, replacement: str) -> str:
    spans = scan_pattern_markers(text, cfg)
    return apply_marker_spans(text, spans, replacement=replacement)


def _trim_split_parts(parts: list[str], *, trim_start: bool, trim_end: bool) -> list[str]:
    out: list[str] = []
    for i, part in enumerate(parts):
        s = part
        if trim_end and i < len(parts) - 1:
            s = s.rstrip("\n\r")
        if trim_start and i > 0:
            s = s.lstrip("\n\r")
        out.append(s)
    return out


def split_by_literal_marker(text: str, cfg: dict[str, Any]) -> list[str]:
    """按字面量标记拆分为多段；用于 marker_split。"""
    literal_raw = cfg.get("literal")
    if not isinstance(literal_raw, str) or literal_raw == "":
        return [text]
    literal = unescape_config_literal(literal_raw)
    if literal not in text:
        return [text]
    delete_literal = bool(cfg.get("delete_literal", True))
    trim_start = bool(cfg.get("trim_part_start", True))
    trim_end = bool(cfg.get("trim_part_end", True))
    if delete_literal:
        parts = text.split(literal)
    else:
        raw = text.split(literal)
        parts = [raw[0]]
        for chunk in raw[1:]:
            parts.append(literal + chunk)
    if trim_start or trim_end:
        parts = _trim_split_parts(parts, trim_start=trim_start, trim_end=trim_end)
    cleaned = [p for p in parts if p]
    return cleaned if cleaned else [text]
