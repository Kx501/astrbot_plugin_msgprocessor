# -*- coding: utf-8 -*-
"""条件运算：供 guard 模块对命中段（或整段消息）求值。"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

_DEFAULT_DATE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("%Y-%m-%d", r"\d{4}-\d{2}-\d{2}"),
    ("%Y/%m/%d", r"\d{4}/\d{2}/\d{2}"),
    ("%Y.%m.%d", r"\d{4}\.\d{2}\.\d{2}"),
    ("%Y年%m月%d日", r"\d{4}年\d{1,2}月\d{1,2}日"),
)


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


def _eval_one(region_text: str, full_message: str, cond: dict[str, Any]) -> bool:
    op = str(cond.get("op") or "").strip().lower()
    if not op:
        return False

    source = _text_source(region_text, full_message, cond)
    ignore_case = bool(cond.get("ignore_case", False))
    hay = source.lower() if ignore_case else source

    if op == "contains":
        needle = cond.get("value")
        if not isinstance(needle, str) or needle == "":
            return False
        n = needle.lower() if ignore_case else needle
        return n in hay

    if op == "not_contains":
        needle = cond.get("value")
        if not isinstance(needle, str) or needle == "":
            return True
        n = needle.lower() if ignore_case else needle
        return n not in hay

    if op == "regex":
        pattern = cond.get("pattern")
        if not isinstance(pattern, str) or pattern == "":
            return False
        try:
            return re.search(pattern, source, flags=_parse_regex_flags(cond.get("regex_flags"))) is not None
        except re.error:
            return False

    if op == "date_older_than":
        try:
            days = float(cond.get("days", 7))
        except (TypeError, ValueError):
            days = 7.0
        parsed = _parse_date_from_text(source, cond)
        if parsed is None:
            missing = str(cond.get("if_no_date", "false")).strip().lower()
            return missing in ("true", "1", "yes")
        now = datetime.now(timezone.utc)
        dt = parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        return now - dt > timedelta(days=days)

    return False


def eval_conditions(region_text: str, full_message: str, cfg: dict[str, Any]) -> bool:
    """对条件列表求值；空列表视为恒成立。"""
    raw = cfg.get("conditions")
    if not isinstance(raw, list) or not raw:
        return True

    results: list[bool] = []
    for item in raw:
        if isinstance(item, dict):
            results.append(_eval_one(region_text, full_message, item))

    if not results:
        return True

    logic = str(cfg.get("logic", "all")).strip().lower()
    if logic == "any":
        return any(results)
    return all(results)
