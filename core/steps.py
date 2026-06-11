# -*- coding: utf-8 -*-
"""规则流水线：扁平 pipeline，locate 步骤划定作用域，其余步骤变换 working_text。"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .matchers import find_hits
from .models import MatchHit, ModuleResult, ProcessingContext
from .pipeline_ids import is_locate_step
from .modules import get_module, review_llm_fallback, translate_llm_fallback

_LLM_STEP_IDS = frozenset({"translate_llm", "review_llm"})

LlmStepSync = Callable[[str, str, dict[str, Any], ProcessingContext, MatchHit | None], str]
LlmStepAsync = Callable[[str, str, dict[str, Any], ProcessingContext, MatchHit | None], Awaitable[str]]


def _llm_step_fallback(mid: str, text: str, scfg: dict[str, Any]) -> str:
    if mid == "translate_llm":
        return translate_llm_fallback(text, scfg)
    if mid == "review_llm":
        return review_llm_fallback(text, scfg)
    return text

_PIPELINE_MAX_EXTRA_ITERS = 20


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
    halt: bool = False
    split_parts: list[str] | None = None
    dropped: bool = False


@dataclass
class _StepEffect:
    dropped: bool = False
    halt: bool = False
    goto: str | None = None


@dataclass
class _SegmentResult:
    payload: str | list[str] | None = None
    halt: bool = False


def _apply_one_module_step(
    text: str,
    st: dict[str, Any],
    pctx: ProcessingContext,
    hit: MatchHit | None,
    *,
    on_llm_step: LlmStepSync,
) -> ModuleResult:
    mid = st.get("id")
    if not isinstance(mid, str):
        return ModuleResult(text)
    scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
    if mid in _LLM_STEP_IDS:
        return ModuleResult(on_llm_step(mid, text, scfg, pctx, hit))
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
    hit: MatchHit | None,
    *,
    on_llm_step: LlmStepAsync,
) -> ModuleResult:
    mid = st.get("id")
    if not isinstance(mid, str):
        return ModuleResult(text)
    scfg = st.get("config") if isinstance(st.get("config"), dict) else {}
    if mid in _LLM_STEP_IDS:
        return ModuleResult(await on_llm_step(mid, text, scfg, pctx, hit))
    if mid == "translate_stub":
        return ModuleResult(translate_llm_fallback(text, scfg))
    fn = get_module(mid)
    if fn is None:
        return ModuleResult(text)
    return fn(text, scfg, pctx, hit)


def _effect_from_result(res: ModuleResult) -> _StepEffect:
    goto = res.goto if isinstance(res.goto, str) and res.goto.strip() else None
    return _StepEffect(dropped=bool(res.drop), halt=bool(res.halt), goto=goto)


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
    if eff.halt:
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
    hit: MatchHit | None,
    *,
    on_llm_step: LlmStepSync,
) -> tuple[list[str], _StepEffect]:
    out: list[str] = []
    eff = _StepEffect()
    for part in parts:
        res = _apply_one_module_step(part, st, pctx, hit, on_llm_step=on_llm_step)
        new_text, split_parts, step_eff = _consume_module_result(part, res)
        if step_eff.dropped:
            continue
        if step_eff.goto:
            eff.goto = step_eff.goto
            out.append(new_text)
            return out, eff
        if step_eff.halt:
            eff.halt = True
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
    hit: MatchHit | None,
    *,
    on_llm_step: LlmStepAsync,
) -> tuple[list[str], _StepEffect]:
    out: list[str] = []
    eff = _StepEffect()
    for part in parts:
        res = await _apply_one_module_step_async(part, st, pctx, hit, on_llm_step=on_llm_step)
        new_text, split_parts, step_eff = _consume_module_result(part, res)
        if step_eff.dropped:
            continue
        if step_eff.goto:
            eff.goto = step_eff.goto
            out.append(new_text)
            return out, eff
        if step_eff.halt:
            eff.halt = True
            out.append(new_text)
            break
        if split_parts:
            out.extend(split_parts)
        else:
            out.append(new_text)
    return out, eff


def _run_transform_segment(
    region_text: str,
    sub: list,
    pctx: ProcessingContext,
    hit: MatchHit | None,
    *,
    on_llm_step: LlmStepSync,
) -> _SegmentResult:
    labels = _build_step_label_index(sub)
    split_parts: list[str] | None = None
    halt = False
    i = 0
    n = len(sub)
    guard_iters = 0
    max_iters = n + _PIPELINE_MAX_EXTRA_ITERS
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
                on_llm_step=on_llm_step,
            )
            if step_eff.halt:
                halt = True
            if step_eff.goto:
                i = _resolve_goto_index(labels, step_eff.goto, fallback=i + 1)
                continue
            if not split_parts:
                return _SegmentResult(payload=None)
            if halt:
                return _SegmentResult(payload=split_parts, halt=True)
            i += 1
            continue
        res = _apply_one_module_step(region_text, st, pctx, hit, on_llm_step=on_llm_step)
        region_text, new_split, step_eff = _consume_module_result(region_text, res)
        if step_eff.dropped:
            return _SegmentResult(payload=None)
        if step_eff.halt:
            halt = True
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
        return _SegmentResult(payload=payload, halt=halt)
    return _SegmentResult(payload=region_text, halt=halt)


async def _run_transform_segment_async(
    region_text: str,
    sub: list,
    pctx: ProcessingContext,
    hit: MatchHit | None,
    *,
    on_llm_step: LlmStepAsync,
) -> _SegmentResult:
    labels = _build_step_label_index(sub)
    split_parts: list[str] | None = None
    halt = False
    i = 0
    n = len(sub)
    guard_iters = 0
    max_iters = n + _PIPELINE_MAX_EXTRA_ITERS
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
                on_llm_step=on_llm_step,
            )
            if step_eff.halt:
                halt = True
            if step_eff.goto:
                i = _resolve_goto_index(labels, step_eff.goto, fallback=i + 1)
                continue
            if not split_parts:
                return _SegmentResult(payload=None)
            if halt:
                return _SegmentResult(payload=split_parts, halt=True)
            i += 1
            continue
        res = await _apply_one_module_step_async(region_text, st, pctx, hit, on_llm_step=on_llm_step)
        region_text, new_split, step_eff = _consume_module_result(region_text, res)
        if step_eff.dropped:
            return _SegmentResult(payload=None)
        if step_eff.halt:
            halt = True
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
        return _SegmentResult(payload=payload, halt=halt)
    return _SegmentResult(payload=region_text, halt=halt)


def _merge_split_with_surround(prefix: str, parts: list[str], suffix: str) -> list[str]:
    if not parts:
        merged = prefix + suffix
        return [merged] if merged else []
    if len(parts) == 1:
        return [prefix + parts[0] + suffix]
    return [prefix + parts[0]] + parts[1:-1] + [parts[-1] + suffix]


def _apply_hit_result(ctx: RuleExecContext, buf: str, hit: MatchHit, result: _SegmentResult) -> None:
    if result.payload is None:
        ctx.dropped = True
        ctx.halt = True
        return
    s, e = hit.region_span.start, hit.region_span.end
    pipeline_out = result.payload
    if isinstance(pipeline_out, list):
        ctx.split_parts = _merge_split_with_surround(buf[:s], pipeline_out, buf[e:])
        ctx.message = ctx.split_parts[0] if ctx.split_parts else buf
        ctx.halt = True
        return
    ctx.message = buf[:s] + pipeline_out + buf[e:]
    if result.halt:
        ctx.halt = True


def _apply_full_message_result(ctx: RuleExecContext, result: _SegmentResult) -> None:
    if result.payload is None:
        ctx.dropped = True
        ctx.halt = True
        return
    if isinstance(result.payload, list):
        ctx.split_parts = result.payload
        ctx.message = result.payload[0] if result.payload else ctx.message
        ctx.halt = True
        return
    ctx.message = result.payload
    if result.halt:
        ctx.halt = True


def _next_locate_index(pipeline: list, start: int, end: int) -> int:
    for j in range(start, end):
        if isinstance(pipeline[j], dict) and is_locate_step(pipeline[j].get("id")):
            return j
    return end


def _run_locate_step(
    ctx: RuleExecContext,
    pipeline: list,
    locate_idx: int,
    end: int,
    *,
    on_llm_step: LlmStepSync,
) -> None:
    step = pipeline[locate_idx]
    cfg = step.get("config") if isinstance(step.get("config"), dict) else {}
    matcher_cfg = cfg.get("matcher") if isinstance(cfg.get("matcher"), dict) else {"type": "regex", "pattern": ".*"}
    region_cfg = cfg.get("region") if isinstance(cfg.get("region"), dict) else None

    max_matches = _parse_max_matches(ctx.limits)
    hits = find_hits(ctx.message, 0, matcher_cfg, region_cfg, max_matches=max_matches)
    if not hits:
        return
    hits = _non_overlapping_hits(hits)

    max_len = _parse_max_len(ctx.limits)
    buf = ctx.message
    if len(buf) > max_len:
        ctx.halt = True
        return

    sub_start = locate_idx + 1
    sub_end = _next_locate_index(pipeline, sub_start, end)
    sub = pipeline[sub_start:sub_end]

    hit_count = len(hits)
    for doc_idx in range(hit_count - 1, -1, -1):
        hit = hits[doc_idx]
        base_extra = dict(ctx.meta) if isinstance(ctx.meta, dict) else {}
        base_extra["hit_index"] = doc_idx
        base_extra["hit_count"] = hit_count
        pctx = ProcessingContext(message=buf, rule_id=ctx.rule_id, extra=base_extra)
        inner = _run_transform_segment(
            hit.region_text,
            sub,
            pctx,
            hit,
            on_llm_step=on_llm_step,
        )
        _apply_hit_result(ctx, buf, hit, inner)
        if ctx.dropped or ctx.halt or ctx.split_parts is not None:
            return
        buf = ctx.message
    ctx.message = buf


async def _run_locate_step_async(
    ctx: RuleExecContext,
    pipeline: list,
    locate_idx: int,
    end: int,
    *,
    on_llm_step: LlmStepAsync,
) -> None:
    step = pipeline[locate_idx]
    cfg = step.get("config") if isinstance(step.get("config"), dict) else {}
    matcher_cfg = cfg.get("matcher") if isinstance(cfg.get("matcher"), dict) else {"type": "regex", "pattern": ".*"}
    region_cfg = cfg.get("region") if isinstance(cfg.get("region"), dict) else None

    max_matches = _parse_max_matches(ctx.limits)
    hits = find_hits(ctx.message, 0, matcher_cfg, region_cfg, max_matches=max_matches)
    if not hits:
        return
    hits = _non_overlapping_hits(hits)

    max_len = _parse_max_len(ctx.limits)
    buf = ctx.message
    if len(buf) > max_len:
        ctx.halt = True
        return

    sub_start = locate_idx + 1
    sub_end = _next_locate_index(pipeline, sub_start, end)
    sub = pipeline[sub_start:sub_end]

    hit_count = len(hits)
    for doc_idx in range(hit_count - 1, -1, -1):
        hit = hits[doc_idx]
        base_extra = dict(ctx.meta) if isinstance(ctx.meta, dict) else {}
        base_extra["hit_index"] = doc_idx
        base_extra["hit_count"] = hit_count
        pctx = ProcessingContext(message=buf, rule_id=ctx.rule_id, extra=base_extra)
        inner = await _run_transform_segment_async(
            hit.region_text,
            sub,
            pctx,
            hit,
            on_llm_step=on_llm_step,
        )
        _apply_hit_result(ctx, buf, hit, inner)
        if ctx.dropped or ctx.halt or ctx.split_parts is not None:
            return
        buf = ctx.message
    ctx.message = buf


def _run_whole_message_segment(
    ctx: RuleExecContext,
    pipeline: list,
    start: int,
    end: int,
    *,
    on_llm_step: LlmStepSync,
) -> None:
    """无 locate 时：将连续变换步骤作为一段在整段消息上执行（支持 goto / split）。"""
    sub = [s for s in pipeline[start:end] if isinstance(s, dict)]
    if not sub:
        return
    pctx = ProcessingContext(
        message=ctx.message,
        rule_id=ctx.rule_id,
        extra=dict(ctx.meta) if isinstance(ctx.meta, dict) else {},
    )
    result = _run_transform_segment(
        ctx.message,
        sub,
        pctx,
        None,
        on_llm_step=on_llm_step,
    )
    _apply_full_message_result(ctx, result)


async def _run_whole_message_segment_async(
    ctx: RuleExecContext,
    pipeline: list,
    start: int,
    end: int,
    *,
    on_llm_step: LlmStepAsync,
) -> None:
    sub = [s for s in pipeline[start:end] if isinstance(s, dict)]
    if not sub:
        return
    pctx = ProcessingContext(
        message=ctx.message,
        rule_id=ctx.rule_id,
        extra=dict(ctx.meta) if isinstance(ctx.meta, dict) else {},
    )
    result = await _run_transform_segment_async(
        ctx.message,
        sub,
        pctx,
        None,
        on_llm_step=on_llm_step,
    )
    _apply_full_message_result(ctx, result)


def run_rule_pipeline(ctx: RuleExecContext, pipeline: list[dict[str, Any]]) -> None:
    """执行扁平 pipeline。locate 未命中时跳过直至下一个 locate；无 locate 时步骤作用于整段消息。"""
    skip_until_locate = False
    i = 0
    n = len(pipeline)

    while i < n:
        if ctx.halt or ctx.dropped:
            break
        step = pipeline[i]
        if not isinstance(step, dict):
            i += 1
            continue
        sid = step.get("id")
        if not isinstance(sid, str):
            i += 1
            continue

        if skip_until_locate:
            if not is_locate_step(sid):
                i += 1
                continue
            skip_until_locate = False

        if is_locate_step(sid):
            cfg = step.get("config") if isinstance(step.get("config"), dict) else {}
            matcher_cfg = cfg.get("matcher") if isinstance(cfg.get("matcher"), dict) else {"type": "regex", "pattern": ".*"}
            region_cfg = cfg.get("region") if isinstance(cfg.get("region"), dict) else None
            max_matches = _parse_max_matches(ctx.limits)
            hits = find_hits(ctx.message, 0, matcher_cfg, region_cfg, max_matches=max_matches)
            if not hits:
                skip_until_locate = True
                i += 1
                continue
            _run_locate_step(
                ctx,
                pipeline,
                i,
                n,
                on_llm_step=lambda mid, t, sc, pc, h: _llm_step_fallback(mid, t, sc),
            )
            if ctx.dropped or ctx.halt or ctx.split_parts is not None:
                break
            sub_end = _next_locate_index(pipeline, i + 1, n)
            i = sub_end
            continue

        sub_end = _next_locate_index(pipeline, i, n)
        _run_whole_message_segment(
            ctx,
            pipeline,
            i,
            sub_end,
            on_llm_step=lambda mid, t, sc, pc, h: _llm_step_fallback(mid, t, sc),
        )
        if ctx.dropped or ctx.halt or ctx.split_parts is not None:
            break
        i = sub_end


async def run_rule_pipeline_async(ctx: RuleExecContext, pipeline: list[dict[str, Any]]) -> None:
    skip_until_locate = False
    i = 0
    n = len(pipeline)

    async def _on_llm(mid: str, t: str, sc: dict[str, Any], pc: ProcessingContext, h: MatchHit | None) -> str:
        fn = ctx.meta.get(mid)
        if callable(fn):
            return await fn(t, sc, pc, h)
        return _llm_step_fallback(mid, t, sc)

    while i < n:
        if ctx.halt or ctx.dropped:
            break
        step = pipeline[i]
        if not isinstance(step, dict):
            i += 1
            continue
        sid = step.get("id")
        if not isinstance(sid, str):
            i += 1
            continue

        if skip_until_locate:
            if not is_locate_step(sid):
                i += 1
                continue
            skip_until_locate = False

        if is_locate_step(sid):
            cfg = step.get("config") if isinstance(step.get("config"), dict) else {}
            matcher_cfg = cfg.get("matcher") if isinstance(cfg.get("matcher"), dict) else {"type": "regex", "pattern": ".*"}
            region_cfg = cfg.get("region") if isinstance(cfg.get("region"), dict) else None
            max_matches = _parse_max_matches(ctx.limits)
            hits = find_hits(ctx.message, 0, matcher_cfg, region_cfg, max_matches=max_matches)
            if not hits:
                skip_until_locate = True
                i += 1
                continue
            await _run_locate_step_async(ctx, pipeline, i, n, on_llm_step=_on_llm)
            if ctx.dropped or ctx.halt or ctx.split_parts is not None:
                break
            sub_end = _next_locate_index(pipeline, i + 1, n)
            i = sub_end
            continue

        sub_end = _next_locate_index(pipeline, i, n)
        await _run_whole_message_segment_async(ctx, pipeline, i, sub_end, on_llm_step=_on_llm)
        if ctx.dropped or ctx.halt or ctx.split_parts is not None:
            break
        i = sub_end


def normalize_rule_pipeline(rule: dict[str, Any]) -> list[dict[str, Any]]:
    raw = rule.get("pipeline")
    if not isinstance(raw, list):
        return []
    return [s for s in raw if isinstance(s, dict)]
