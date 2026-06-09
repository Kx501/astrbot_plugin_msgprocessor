# -*- coding: utf-8 -*-
"""标记处理：字面量标记 + 模式标记（预设/正则），供 marker_* 模块与 locate(marker) 共用。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

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
    start: int
    end: int
    preset: str | None = None


def _normalize_presets(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        key = str(item).strip().lower()
        if key and key in PRESET_PATTERNS and key not in out:
            out.append(key)
    return out


def _normalize_custom_patterns(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        pat = str(item).strip()
        if pat and pat not in out:
            out.append(pat)
    return out


def parse_marker_config(cfg: dict[str, Any]) -> tuple[str, list[str], list[str], bool]:
    """统一标记配置：literal、presets、custom_patterns、include_empty。"""
    literal_raw = cfg.get("literal")
    literal = unescape_config_literal(literal_raw) if isinstance(literal_raw, str) else ""
    presets = _normalize_presets(cfg.get("presets"))
    custom = _normalize_custom_patterns(cfg.get("custom_patterns"))
    include_empty = bool(cfg.get("include_empty", True))
    return literal, presets, custom, include_empty


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
    if preset == "literal":
        return s
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


def _scan_literal_spans(text: str, literal: str) -> list[MarkerSpan]:
    if not literal:
        return []
    spans: list[MarkerSpan] = []
    pos = 0
    while pos <= len(text):
        idx = text.find(literal, pos)
        if idx < 0:
            break
        spans.append(MarkerSpan(idx, idx + len(literal), "literal"))
        pos = idx + max(1, len(literal))
    return spans


def scan_markers(text: str, cfg: dict[str, Any]) -> list[MarkerSpan]:
    """扫描字面量 + 模式标记区间（合并重叠）。"""
    if not text:
        return []
    literal, presets, custom, include_empty = parse_marker_config(cfg)
    found: list[MarkerSpan] = []
    found.extend(_scan_literal_spans(text, literal))

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
            if _accept_span(text, rs, re_, "custom", include_empty=include_empty):
                found.append(MarkerSpan(rs, re_, "custom"))

    return _merge_spans(found)


def has_markers(text: str, cfg: dict[str, Any]) -> bool:
    return bool(scan_markers(text, cfg))


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


def delete_markers(text: str, cfg: dict[str, Any]) -> str:
    return apply_marker_spans(text, scan_markers(text, cfg), replacement=None)


def replace_markers(text: str, cfg: dict[str, Any], *, replacement: str) -> str:
    return apply_marker_spans(text, scan_markers(text, cfg), replacement=replacement)


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
    """在字面量标记点拆分为多段（仅使用 ``literal`` 字段）。"""
    literal, _, _, _ = parse_marker_config(cfg)
    if not literal or literal not in text:
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
