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

# goto 循环保护：线性执行最多 n 次，额外允许少量回跳（正常规则远用不满）
_INNER_PIPELINE_MAX_EXTRA_ITERS = 20


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
        max_matches = int(limits.get("max_matches", 0))
    except (TypeError, ValueError):
        max_matches = 0
    # 0 或负数视为无限；正数沿用上限保护
    if max_matches <= 0:
        return 0
    return min(max_matches, 256)


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
    split_parts: list[str] | None = None
    dropped: bool = False


@dataclass
class _StepEffect:
    dropped: bool = False
    end_rule: bool = False
    goto: str | None = None


@dataclass
class InnerPipelineResult:
    payload: str | list[str] | None = None
    end_rule: bool = False


def _apply_one_module_step(
    text: str,
    st: dict[str, Any],
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmSync,
) -> ModuleResult:
    mid = st.get("id")
    if not isinstance(mid, str):
        return ModuleResult(text)
    scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
    if mid == "translate_llm":
        return ModuleResult(on_translate_llm(text, scfg, pctx, hit))
    if mid == "translate_stub":
        return ModuleResult(translate_llm_fallback(text, scfg))
    if mid == "translate_stub":
        return ModuleResult(translate_llm_fallback(text, scfg))
    fn = get_module(mid)
    if fn is None:
        return ModuleResult(text)
    return fn(text, scfg, pctx, hit)


async def _apply_one_module_step_async(
    text: str,
    st: dict[str, Any],
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmAsync,
) -> ModuleResult:
    mid = st.get("id")
    if not isinstance(mid, str):
        return ModuleResult(text)
    scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
    if mid == "translate_llm":
        return ModuleResult(await on_translate_llm(text, scfg, pctx, hit))
    if mid == "translate_stub":
        return ModuleResult(translate_llm_fallback(text, scfg))
    fn = get_module(mid)
    if fn is None:
        return ModuleResult(text)
    return fn(text, scfg, pctx, hit)


def _effect_from_result(res: ModuleResult) -> _StepEffect:
    goto = res.goto if isinstance(res.goto, str) and res.goto.strip() else None
    return _StepEffect(dropped=bool(res.drop), end_rule=bool(res.end_rule), goto=goto)


def _build_step_label_index(steps: list) -> dict[str, int]:
    labels: dict[str, int] = {}
    for i, st in enumerate(steps):
        if not isinstance(st, dict):
            continue
        raw = st.get("label")
        if not isinstance(raw, str):
            continue
        key = raw.strip()
        if key and key not in labels:
            labels[key] = i
    return labels


def _resolve_goto_index(labels: dict[str, int], target: str | None, *, fallback: int) -> int:
    if not target:
        return fallback
    idx = labels.get(target.strip())
    if idx is None:
        return fallback
    return idx


def _consume_module_result(
    text: str, res: ModuleResult
) -> tuple[str, list[str] | None, _StepEffect]:
    eff = _effect_from_result(res)
    if eff.dropped:
        return text, None, eff
    if eff.end_rule:
        return res.text, None, eff
    if eff.goto:
        return res.text, None, eff
    if res.split_parts:
        return res.text, res.split_parts, _StepEffect()
    return res.text, None, _StepEffect()


def _run_parts_through_step(
    parts: list[str],
    st: dict[str, Any],
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmSync,
) -> tuple[list[str], _StepEffect]:
    out: list[str] = []
    eff = _StepEffect()
    for part in parts:
        res = _apply_one_module_step(part, st, pctx, hit, on_translate_llm=on_translate_llm)
        new_text, split_parts, step_eff = _consume_module_result(part, res)
        if step_eff.dropped:
            continue
        if step_eff.goto:
            eff.goto = step_eff.goto
            out.append(new_text)
            return out, eff
        if step_eff.end_rule:
            eff.end_rule = True
            out.append(new_text)
            break
        if split_parts:
            out.extend(split_parts)
        else:
            out.append(new_text)
    return out, eff


async def _run_parts_through_step_async(
    parts: list[str],
    st: dict[str, Any],
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmAsync,
) -> tuple[list[str], _StepEffect]:
    out: list[str] = []
    eff = _StepEffect()
    for part in parts:
        res = await _apply_one_module_step_async(part, st, pctx, hit, on_translate_llm=on_translate_llm)
        new_text, split_parts, step_eff = _consume_module_result(part, res)
        if step_eff.dropped:
            continue
        if step_eff.goto:
            eff.goto = step_eff.goto
            out.append(new_text)
            return out, eff
        if step_eff.end_rule:
            eff.end_rule = True
            out.append(new_text)
            break
        if split_parts:
            out.extend(split_parts)
        else:
            out.append(new_text)
    return out, eff


def _run_inner_pipeline(
    region_text: str,
    sub: list,
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmSync,
) -> InnerPipelineResult:
    labels = _build_step_label_index(sub)
    split_parts: list[str] | None = None
    end_rule = False
    i = 0
    n = len(sub)
    guard_iters = 0
    max_iters = n + _INNER_PIPELINE_MAX_EXTRA_ITERS
    while i < n:
        guard_iters += 1
        if guard_iters > max_iters:
            break
        st = sub[i]
        if not isinstance(st, dict):
            i += 1
            continue
        if split_parts is not None:
            split_parts, step_eff = _run_parts_through_step(
                split_parts,
                st,
                pctx,
                hit,
                on_translate_llm=on_translate_llm,
            )
            if step_eff.end_rule:
                end_rule = True
            if step_eff.goto:
                i = _resolve_goto_index(labels, step_eff.goto, fallback=i + 1)
                continue
            if not split_parts:
                return InnerPipelineResult(payload=None)
            if end_rule:
                return InnerPipelineResult(payload=split_parts, end_rule=True)
            i += 1
            continue
        res = _apply_one_module_step(region_text, st, pctx, hit, on_translate_llm=on_translate_llm)
        region_text, new_split, step_eff = _consume_module_result(region_text, res)
        if step_eff.dropped:
            return InnerPipelineResult(payload=None)
        if step_eff.end_rule:
            end_rule = True
            if new_split:
                split_parts = new_split
            break
        if step_eff.goto:
            i = _resolve_goto_index(labels, step_eff.goto, fallback=i + 1)
            continue
        if new_split:
            split_parts = new_split
        i += 1
    if split_parts is not None:
        payload: str | list[str] | None = split_parts if split_parts else None
        return InnerPipelineResult(payload=payload, end_rule=end_rule)
    return InnerPipelineResult(payload=region_text, end_rule=end_rule)


async def _run_inner_pipeline_async(
    region_text: str,
    sub: list,
    pctx: ProcessingContext,
    hit: MatchHit,
    *,
    on_translate_llm: TranslateLlmAsync,
) -> InnerPipelineResult:
    labels = _build_step_label_index(sub)
    split_parts: list[str] | None = None
    end_rule = False
    i = 0
    n = len(sub)
    guard_iters = 0
    max_iters = n + _INNER_PIPELINE_MAX_EXTRA_ITERS
    while i < n:
        guard_iters += 1
        if guard_iters > max_iters:
            break
        st = sub[i]
        if not isinstance(st, dict):
            i += 1
            continue
        if split_parts is not None:
            split_parts, step_eff = await _run_parts_through_step_async(
                split_parts,
                st,
                pctx,
                hit,
                on_translate_llm=on_translate_llm,
            )
            if step_eff.end_rule:
                end_rule = True
            if step_eff.goto:
                i = _resolve_goto_index(labels, step_eff.goto, fallback=i + 1)
                continue
            if not split_parts:
                return InnerPipelineResult(payload=None)
            if end_rule:
                return InnerPipelineResult(payload=split_parts, end_rule=True)
            i += 1
            continue
        res = await _apply_one_module_step_async(region_text, st, pctx, hit, on_translate_llm=on_translate_llm)
        region_text, new_split, step_eff = _consume_module_result(region_text, res)
        if step_eff.dropped:
            return InnerPipelineResult(payload=None)
        if step_eff.end_rule:
            end_rule = True
            if new_split:
                split_parts = new_split
            break
        if step_eff.goto:
            i = _resolve_goto_index(labels, step_eff.goto, fallback=i + 1)
            continue
        if new_split:
            split_parts = new_split
        i += 1
    if split_parts is not None:
        payload: str | list[str] | None = split_parts if split_parts else None
        return InnerPipelineResult(payload=payload, end_rule=end_rule)
    return InnerPipelineResult(payload=region_text, end_rule=end_rule)


def _apply_inner_result(ctx: RuleExecContext, buf: str, hit: MatchHit, result: InnerPipelineResult) -> None:
    if result.payload is None:
        ctx.dropped = True
        ctx.stop_rule = True
        return
    s, e = hit.region_span.start, hit.region_span.end
    pipeline_out = result.payload
    if isinstance(pipeline_out, list):
        ctx.split_parts = _merge_split_with_surround(buf[:s], pipeline_out, buf[e:])
        ctx.message = ctx.split_parts[0] if ctx.split_parts else buf
        ctx.stop_rule = True
        return
    ctx.message = buf[:s] + pipeline_out + buf[e:]
    if result.end_rule:
        ctx.stop_rule = True


def _merge_split_with_surround(prefix: str, parts: list[str], suffix: str) -> list[str]:
    if not parts:
        merged = prefix + suffix
        return [merged] if merged else []
    if len(parts) == 1:
        return [prefix + parts[0] + suffix]
    return [prefix + parts[0]] + parts[1:-1] + [parts[-1] + suffix]


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
        inner = _run_inner_pipeline(
            hit.region_text,
            sub,
            pctx,
            hit,
            on_translate_llm=lambda t, sc, pc, h: translate_llm_fallback(t, sc),
        )
        _apply_inner_result(ctx, buf, hit, inner)
        if ctx.dropped or ctx.stop_rule or ctx.split_parts is not None:
            return
        buf = ctx.message
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
        inner = await _run_inner_pipeline_async(
            hit.region_text,
            sub,
            pctx,
            hit,
            on_translate_llm=_on_tl,
        )
        _apply_inner_result(ctx, buf, hit, inner)
        if ctx.dropped or ctx.stop_rule or ctx.split_parts is not None:
            return
        buf = ctx.message
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
