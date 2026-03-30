# -*- coding: utf-8 -*-
"""规则步骤：match_block（matcher + region + 内层模块）、end_rule。"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .matchers import find_hits
from .models import MatchHit, ModuleResult, ProcessingContext
from .modules import get_module, translate_llm_fallback

StepFn = Callable[["RuleExecContext", dict[str, Any]], None]
AsyncStepFn = Callable[["RuleExecContext", dict[str, Any]], Awaitable[None]]

TranslateLlmSync = Callable[[str, dict[str, Any], ProcessingContext, MatchHit], str]
TranslateLlmAsync = Callable[[str, dict[str, Any], ProcessingContext, MatchHit], Awaitable[str]]


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


def _run_inner_pipeline(
    region_text: str,
    sub: list,
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmSync,
) -> str:
    for st in sub:
        if not isinstance(st, dict):
            continue
        mid = st.get("id")
        if not isinstance(mid, str):
            continue
        scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
        if mid == "translate_llm":
            region_text = on_translate_llm(region_text, scfg, pctx, hit)
            continue
        if mid == "translate_stub":
            region_text = translate_llm_fallback(region_text, scfg)
            continue
        if mid == "filter":
            c = scfg.get("contain")
            if isinstance(c, str) and c != "" and c not in region_text:
                continue
            continue
        fn = get_module(mid)
        if fn is None:
            continue
        res: ModuleResult = fn(region_text, scfg, pctx, hit)
        if res.skip_rule:
            continue
        region_text = res.text
    return region_text


async def _run_inner_pipeline_async(
    region_text: str,
    sub: list,
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmAsync,
) -> str:
    for st in sub:
        if not isinstance(st, dict):
            continue
        mid = st.get("id")
        if not isinstance(mid, str):
            continue
        scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
        if mid == "translate_llm":
            region_text = await on_translate_llm(region_text, scfg, pctx, hit)
            continue
        if mid == "translate_stub":
            region_text = translate_llm_fallback(region_text, scfg)
            continue
        if mid == "filter":
            c = scfg.get("contain")
            if isinstance(c, str) and c != "" and c not in region_text:
                continue
            continue
        fn = get_module(mid)
        if fn is None:
            continue
        res: ModuleResult = fn(region_text, scfg, pctx, hit)
        if res.skip_rule:
            continue
        region_text = res.text
    return region_text


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
    hit_count = len(hits)
    # 自右向左替换，避免前面的改写打乱后面的下标（hits 已按起点升序）
    for doc_idx in range(hit_count - 1, -1, -1):
        hit = hits[doc_idx]
        base_extra = dict(ctx.meta) if isinstance(ctx.meta, dict) else {}
        base_extra["hit_index"] = doc_idx
        base_extra["hit_count"] = hit_count
        pctx = ProcessingContext(message=buf, rule_id=rid, extra=base_extra)
        region_text = _run_inner_pipeline(
            hit.region_text,
            sub,
            pctx,
            hit,
            on_translate_llm=lambda t, sc, pc, h: translate_llm_fallback(t, sc),
        )
        s, e = hit.region_span.start, hit.region_span.end
        buf = buf[:s] + region_text + buf[e:]
    ctx.message = buf


async def step_match_block_async(ctx: RuleExecContext, cfg: dict[str, Any]) -> None:
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
    hit_count = len(hits)

    async def _on_tl(t: str, sc: dict[str, Any], pc: ProcessingContext, h: MatchHit) -> str:
        fn = ctx.meta.get("translate_llm")
        if callable(fn):
            return await fn(t, sc, pc, h)
        return translate_llm_fallback(t, sc)

    for doc_idx in range(hit_count - 1, -1, -1):
        hit = hits[doc_idx]
        base_extra = dict(ctx.meta) if isinstance(ctx.meta, dict) else {}
        base_extra["hit_index"] = doc_idx
        base_extra["hit_count"] = hit_count
        pctx = ProcessingContext(message=buf, rule_id=rid, extra=base_extra)
        region_text = await _run_inner_pipeline_async(
            hit.region_text,
            sub,
            pctx,
            hit,
            on_translate_llm=_on_tl,
        )
        s, e = hit.region_span.start, hit.region_span.end
        buf = buf[:s] + region_text + buf[e:]
    ctx.message = buf


def step_end_rule(ctx: RuleExecContext, cfg: dict[str, Any]) -> None:
    _ = cfg
    ctx.stop_rule = True


async def step_end_rule_async(ctx: RuleExecContext, cfg: dict[str, Any]) -> None:
    step_end_rule(ctx, cfg)


STEP_HANDLERS: dict[str, StepFn] = {
    "match_block": step_match_block,
    "end_rule": step_end_rule,
}

STEP_HANDLERS_ASYNC: dict[str, AsyncStepFn] = {
    "match_block": step_match_block_async,
    "end_rule": step_end_rule_async,
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


async def run_rule_steps_async(ctx: RuleExecContext, steps: list[dict[str, Any]]) -> None:
    for step in steps:
        if ctx.stop_rule:
            break
        sid = step.get("id")
        if not isinstance(sid, str):
            continue
        fn = STEP_HANDLERS_ASYNC.get(sid)
        if fn is None:
            continue
        cfg = step.get("config") if isinstance(step.get("config"), dict) else {}
        await fn(ctx, cfg)
