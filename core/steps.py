# -*- coding: utf-8 -*-
"""规则步骤：match_block（matcher + region + 内层模块）、end_rule。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .matchers import find_hits
from .models import MatchHit, ModuleResult, ProcessingContext
from .modules import get_module

StepFn = Callable[["RuleExecContext", dict[str, Any]], None]


def _non_overlapping_hits(hits: list[MatchHit]) -> list[MatchHit]:
    ordered = sorted(hits, key=lambda h: (h.region_span.start, h.region_span.end))
    out: list[MatchHit] = []
    cur_end = -1
    for h in ordered:
        if h.region_span.start >= cur_end:
            out.append(h)
            cur_end = h.region_span.end
    return out


def _parse_max_matches(limits: dict[str, Any]) -> int:
    try:
        max_matches = int(limits.get("max_matches", 64))
    except (TypeError, ValueError):
        max_matches = 64
    return max(1, min(max_matches, 256))


def _parse_max_len(limits: dict[str, Any]) -> int:
    try:
        return int(limits.get("max_message_length", 1_000_000))
    except (TypeError, ValueError):
        return 1_000_000


@dataclass
class RuleExecContext:
    message: str
    rule_id: str
    meta: dict[str, Any]
    limits: dict[str, Any]
    stop_rule: bool = False


def step_match_block(ctx: RuleExecContext, cfg: dict[str, Any]) -> None:
    matcher_cfg = cfg.get("matcher") if isinstance(cfg.get("matcher"), dict) else None
    if matcher_cfg is None:
        matcher_cfg = {"type": "regex", "pattern": ".*"}
    region_cfg = cfg.get("region") if isinstance(cfg.get("region"), dict) else None
    sub = cfg.get("steps")
    if not isinstance(sub, list):
        sub = []

    message = ctx.message
    max_matches = _parse_max_matches(ctx.limits)
    hits = find_hits(
        message,
        0,
        matcher_cfg,
        region_cfg,
        max_matches=max_matches,
    )
    if not hits:
        return
    hits = _non_overlapping_hits(hits)

    max_len = _parse_max_len(ctx.limits)
    buf = message
    if len(buf) > max_len:
        ctx.stop_rule = True
        return

    rid = ctx.rule_id
    ordered = sorted(hits, key=lambda h: (h.region_span.start, h.region_span.end))
    hit_count = len(ordered)
    for doc_idx, hit in sorted(
        list(enumerate(ordered)),
        key=lambda pair: pair[1].region_span.start,
        reverse=True,
    ):
        base_extra = dict(ctx.meta) if isinstance(ctx.meta, dict) else {}
        base_extra["hit_index"] = doc_idx
        base_extra["hit_count"] = hit_count
        pctx = ProcessingContext(message=buf, rule_id=rid, extra=base_extra)
        region_text = hit.region_text
        skip = False
        for st in sub:
            if not isinstance(st, dict):
                continue
            mid = st.get("id")
            if not isinstance(mid, str):
                continue
            fn = get_module(mid)
            if fn is None:
                continue
            scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
            res: ModuleResult = fn(region_text, scfg, pctx, hit)
            if res.skip_rule:
                skip = True
                break
            region_text = res.text
        if skip:
            continue
        s, e = hit.region_span.start, hit.region_span.end
        buf = buf[:s] + region_text + buf[e:]
    ctx.message = buf


def step_end_rule(ctx: RuleExecContext, cfg: dict[str, Any]) -> None:
    _ = cfg
    ctx.stop_rule = True


STEP_HANDLERS: dict[str, StepFn] = {
    "match_block": step_match_block,
    "end_rule": step_end_rule,
}


def normalize_rule_steps(rule: dict[str, Any]) -> list[dict[str, Any]]:
    raw = rule.get("steps")
    if not isinstance(raw, list):
        return []
    return [s for s in raw if isinstance(s, dict)]


def run_rule_steps(ctx: RuleExecContext, steps: list[dict[str, Any]]) -> None:
    for step in steps:
        if ctx.stop_rule:
            break
        sid = step.get("id")
        if not isinstance(sid, str):
            continue
        fn = STEP_HANDLERS.get(sid)
        if fn is None:
            continue
        cfg = step.get("config") if isinstance(step.get("config"), dict) else {}
        fn(ctx, cfg)
