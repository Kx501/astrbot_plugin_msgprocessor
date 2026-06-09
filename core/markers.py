# -*- coding: utf-8 -*-
"""标记处理：字面量标记，供 marker 模块与 locate(marker) 共用。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_BACKSLASH_PLACEHOLDER = "\x00"


def unescape_config_literal(s: str) -> str:
    out = s.replace("\\\\", _BACKSLASH_PLACEHOLDER)
    out = out.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
    return out.replace(_BACKSLASH_PLACEHOLDER, "\\")


@dataclass(frozen=True)
class MarkerSpan:
    start: int
    end: int


def parse_literal(cfg: dict[str, Any]) -> str:
    literal_raw = cfg.get("literal")
    if not isinstance(literal_raw, str):
        return ""
    return unescape_config_literal(literal_raw)


def scan_literal_spans(text: str, cfg: dict[str, Any]) -> list[MarkerSpan]:
    """扫描文本中所有字面量标记出现位置。"""
    literal = parse_literal(cfg)
    if not literal or not text:
        return []
    spans: list[MarkerSpan] = []
    pos = 0
    while pos <= len(text):
        idx = text.find(literal, pos)
        if idx < 0:
            break
        spans.append(MarkerSpan(idx, idx + len(literal)))
        pos = idx + max(1, len(literal))
    return spans


def has_literal_marker(text: str, cfg: dict[str, Any]) -> bool:
    literal = parse_literal(cfg)
    return bool(literal) and literal in text


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
    """在字面量标记点拆分为多段。"""
    literal = parse_literal(cfg)
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
