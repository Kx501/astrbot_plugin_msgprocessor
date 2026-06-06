# -*- coding: utf-8 -*-
"""条件运算：guard 模块使用的运算型判断（matcher 无法表达的谓词）。"""
from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

_DEFAULT_DATE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("%Y-%m-%d", r"\d{4}-\d{2}-\d{2}"),
    ("%Y/%m/%d", r"\d{4}/\d{2}/\d{2}"),
    ("%Y.%m.%d", r"\d{4}\.\d{2}\.\d{2}"),
    ("%Y年%m月%d日", r"\d{4}年\d{1,2}月\d{1,2}日"),
)

_NUMBER_SCAN = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")

_COMPARATORS: dict[str, Callable[[float, float], bool]] = {
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
}


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


def _text_source(region_text: str, full_message: str, cfg: dict[str, Any]) -> str:
    where = str(cfg.get("in", "region")).strip().lower()
    if where in ("message", "full"):
        return full_message
    return region_text


def _flag_true(raw: Any) -> bool:
    return str(raw or "false").strip().lower() in ("true", "1", "yes")


def _parse_float(raw: Any, default: float) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _parse_date_from_text(text: str, cfg: dict[str, Any]) -> datetime | None:
    regex = cfg.get("regex") or cfg.get("date_regex")
    if isinstance(regex, str) and regex.strip():
        try:
            m = re.search(regex, text, flags=_parse_regex_flags(cfg.get("regex_flags")))
        except re.error:
            m = None
        if not m:
            return None
        raw = m.group(1) if m.lastindex else m.group(0)
        fmt_raw = cfg.get("format") or cfg.get("date_format") or "%Y-%m-%d"
        formats = [str(fmt_raw)] if str(fmt_raw).strip() else ["%Y-%m-%d"]
        for fmt in formats:
            try:
                return datetime.strptime(raw.strip(), fmt)
            except ValueError:
                continue
        return None

    for fmt, pat in _DEFAULT_DATE_PATTERNS:
        m = re.search(pat, text)
        if not m:
            continue
        try:
            return datetime.strptime(m.group(0), fmt)
        except ValueError:
            continue
    return None


def _extract_number(text: str, cfg: dict[str, Any]) -> float | None:
    regex = cfg.get("regex")
    if isinstance(regex, str) and regex.strip():
        try:
            m = re.search(regex, text, flags=_parse_regex_flags(cfg.get("regex_flags")))
        except re.error:
            m = None
        if not m:
            return None
        raw = m.group(1) if m.lastindex else m.group(0)
        try:
            return float(raw.strip())
        except ValueError:
            return None

    m = _NUMBER_SCAN.search(text)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def _compare_op_parts(op: str) -> tuple[str, str] | None:
    for prefix in ("number", "length"):
        head = f"{prefix}_"
        if not op.startswith(head):
            continue
        cmp_key = op[len(head) :]
        if cmp_key in _COMPARATORS:
            return prefix, cmp_key
    return None


def eval_condition(region_text: str, full_message: str, cfg: dict[str, Any]) -> bool:
    """单条运算型条件；未配置 op 时视为恒成立。"""
    op = str(cfg.get("op") or "").strip().lower()
    if not op:
        return True

    source = _text_source(region_text, full_message, cfg)

    if op == "date_older_than":
        days = _parse_float(cfg.get("days"), 7.0)
        parsed = _parse_date_from_text(source, cfg)
        if parsed is None:
            return _flag_true(cfg.get("if_no_date"))
        now = datetime.now(timezone.utc)
        dt = parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        return now - dt > timedelta(days=days)

    parts = _compare_op_parts(op)
    if parts is not None:
        kind, cmp_key = parts
        threshold = _parse_float(cfg.get("value"), 0.0)
        fn = _COMPARATORS[cmp_key]
        if kind == "number":
            parsed = _extract_number(source, cfg)
            if parsed is None:
                return _flag_true(cfg.get("if_missing"))
            return fn(parsed, threshold)
        if kind == "length":
            return fn(float(len(source)), threshold)

    return False
