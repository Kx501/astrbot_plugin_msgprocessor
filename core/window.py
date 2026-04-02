# -*- coding: utf-8 -*-
"""可选文本窗口：前后字面锚点。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WindowSpan:
    start: int
    end: int


def _find_nth(haystack: str, needle: str, occurrence: int, search_from: int = 0) -> int | None:
    if not needle:
        return None
    pos = search_from
    idx = -1
    for _ in range(occurrence + 1):
        idx = haystack.find(needle, pos)
        if idx < 0:
            return None
        pos = idx + max(1, len(needle))
    return idx


def _anchor_edge(
    message: str,
    spec: dict[str, Any] | None,
    *,
    is_start: bool,
    search_from: int,
    search_to: int | None,
) -> int | None:
    if not spec:
        return None
    lit = spec.get("literal")
    if lit is None or not isinstance(lit, str):
        return None
    occ = int(spec.get("occurrence", 0))
    inclusive = bool(spec.get("inclusive", False))
    sub = message[search_from:] if search_to is None else message[search_from:search_to]
    rel = _find_nth(sub, lit, occ, 0)
    if rel is None:
        return None
    idx = search_from + rel
    ln = len(lit)
    if is_start:
        return idx if inclusive else idx + ln
    return idx + ln if inclusive else idx


def _anchor_start_idx(
    message: str,
    spec: dict[str, Any] | None,
    *,
    search_from: int,
) -> int | None:
    """返回第 occurrence 个锚点字面量的起始下标（不考虑 inclusive）。"""
    if not spec:
        return None
    lit = spec.get("literal")
    if lit is None or not isinstance(lit, str):
        return None
    occ = int(spec.get("occurrence", 0))
    sub = message[search_from:]
    rel = _find_nth(sub, lit, occ, 0)
    if rel is None:
        return None
    return search_from + rel


def resolve_window(
    message: str,
    window_cfg: dict[str, Any] | None,
) -> WindowSpan | None:
    if not window_cfg:
        return WindowSpan(0, len(message))

    start_spec = window_cfg.get("start")
    end_spec = window_cfg.get("end")
    whole_ignore_anchor_line = bool(window_cfg.get("ignore_anchor_line", False))
    ignore_start_anchor_line = bool(window_cfg.get("ignore_start_anchor_line", whole_ignore_anchor_line))
    ignore_end_anchor_line = bool(window_cfg.get("ignore_end_anchor_line", whole_ignore_anchor_line))

    n = len(message)
    win_start = 0
    win_end = n

    if start_spec:
        if ignore_start_anchor_line:
            s_idx = _anchor_start_idx(message, start_spec, search_from=0)
            if s_idx is None:
                return None
            nl = message.find("\n", s_idx)
            win_start = (nl + 1) if nl >= 0 else n
        else:
            edge = _anchor_edge(message, start_spec, is_start=True, search_from=0, search_to=None)
            if edge is None:
                return None
            win_start = max(0, min(edge, n))

    if end_spec:
        if ignore_end_anchor_line:
            e_idx = _anchor_start_idx(message, end_spec, search_from=win_start)
            if e_idx is None:
                return None
            prev_nl = message.rfind("\n", 0, e_idx)
            win_end = (prev_nl + 1) if prev_nl >= 0 else 0
        else:
            edge = _anchor_edge(
                message,
                end_spec,
                is_start=False,
                search_from=win_start,
                search_to=None,
            )
            if edge is None:
                return None
            win_end = max(0, min(edge, n))

    if win_end < win_start:
        return None
    return WindowSpan(win_start, win_end)
