# -*- coding: utf-8 -*-
"""主匹配：regex / simple / passthrough / anchor_slice。锚点仅用于 anchor_slice。"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from .models import MatchHit, Span
from .window import resolve_window


def _parse_flags(names: list[str] | None) -> int:
    if not names:
        return 0
    bits = 0
    for name in names:
        key = name.upper().replace("RE.", "")
        if hasattr(re, key):
            bits |= int(getattr(re, key))
    return bits


@lru_cache(maxsize=512)
def _compile_cached(pattern: str, flags_key: tuple[str, ...]) -> re.Pattern[str]:
    return re.compile(pattern, _parse_flags(list(flags_key)))


def find_hits_regex(
    slice_text: str,
    global_offset: int,
    pattern: str,
    flags: list[str] | None,
    region_cfg: dict[str, Any] | None,
    *,
    max_matches: int,
) -> list[MatchHit]:
    fk = tuple(flags or ())
    rx = _compile_cached(pattern, fk)
    hits: list[MatchHit] = []
    for m in rx.finditer(slice_text):
        if len(hits) >= max_matches:
            break
        kind = (region_cfg or {}).get("kind", "match")
        if kind == "match":
            rs, re_ = m.span()
        elif kind == "group":
            g = (region_cfg or {}).get("index")
            if g is None:
                g = (region_cfg or {}).get("name")
            if isinstance(g, int):
                span_t = m.span(g)
            elif isinstance(g, str):
                span_t = m.span(g)
            else:
                span_t = m.span()
            rs, re_ = span_t
        else:
            rs, re_ = m.span()
        rel = Span(rs, re_)
        glob = Span(global_offset + rel.start, global_offset + rel.end)
        region_text = slice_text[rs:re_]
        hits.append(
            MatchHit(
                span=glob,
                region_span=glob,
                region_text=region_text,
                groups=m.groups(),
            )
        )
    return hits


def find_hits_simple(
    slice_text: str,
    global_offset: int,
    cfg: dict[str, Any],
    *,
    max_matches: int,
) -> list[MatchHit]:
    op = (cfg.get("op") or "contains").lower()
    value = cfg.get("value")
    if value is None or not isinstance(value, str):
        return []
    ignore_case = bool(cfg.get("ignore_case", False))
    hay = slice_text.lower() if ignore_case else slice_text
    needle = value.lower() if ignore_case else value
    hits: list[MatchHit] = []

    def add(rs: int, re_: int) -> None:
        if len(hits) >= max_matches:
            return
        glob = Span(global_offset + rs, global_offset + re_)
        hits.append(
            MatchHit(
                span=glob,
                region_span=glob,
                region_text=slice_text[rs:re_],
                groups=(),
            )
        )

    if op == "equals":
        if hay == needle:
            add(0, len(slice_text))
        return hits
    if op == "startswith":
        if hay.startswith(needle):
            add(0, len(value))
        return hits
    if op == "endswith":
        if hay.endswith(needle):
            add(len(slice_text) - len(value), len(slice_text))
        return hits
    if op == "contains":
        pos = 0
        while pos <= len(slice_text):
            idx = hay.find(needle, pos)
            if idx < 0:
                break
            add(idx, idx + len(value))
            pos = idx + max(1, len(value))
            if len(hits) >= max_matches:
                break
        return hits
    return hits


def find_hits_passthrough(
    slice_text: str,
    global_offset: int,
    _matcher_cfg: dict[str, Any],
    *,
    max_matches: int,
) -> list[MatchHit]:
    """整段文本一次命中，进入内层；空串不产生命中。"""
    n = len(slice_text)
    if n == 0:
        return []
    if max_matches < 1:
        return []
    glob = Span(global_offset, global_offset + n)
    return [
        MatchHit(
            span=glob,
            region_span=glob,
            region_text=slice_text,
            groups=(),
        )
    ]


def find_hits_anchor_slice(
    slice_text: str,
    global_offset: int,
    matcher_cfg: dict[str, Any],
    *,
    max_matches: int,
) -> list[MatchHit]:
    """锚点间整段内容作为单次命中；cfg 含 start/end（与 window 同形）。"""
    wspan = resolve_window(slice_text, matcher_cfg)
    if wspan is None:
        return []
    wstart, wend = wspan.start, wspan.end
    inner = slice_text[wstart:wend]
    if len(inner) == 0:
        return []
    if max_matches < 1:
        return []
    glob = Span(global_offset + wstart, global_offset + wend)
    return [
        MatchHit(
            span=glob,
            region_span=glob,
            region_text=inner,
            groups=(),
        )
    ]


def find_hits(
    slice_text: str,
    global_offset: int,
    matcher_cfg: dict[str, Any],
    region_cfg: dict[str, Any] | None,
    *,
    max_matches: int,
) -> list[MatchHit]:
    mtype = (matcher_cfg.get("type") or "regex").lower()
    if mtype == "passthrough":
        return find_hits_passthrough(
            slice_text,
            global_offset,
            matcher_cfg,
            max_matches=max_matches,
        )
    if mtype == "anchor_slice":
        return find_hits_anchor_slice(
            slice_text,
            global_offset,
            matcher_cfg,
            max_matches=max_matches,
        )
    if mtype == "regex":
        return find_hits_regex(
            slice_text,
            global_offset,
            matcher_cfg.get("pattern") or "",
            matcher_cfg.get("flags"),
            region_cfg,
            max_matches=max_matches,
        )
    if mtype == "simple":
        return find_hits_simple(
            slice_text,
            global_offset,
            matcher_cfg,
            max_matches=max_matches,
        )
    return []
