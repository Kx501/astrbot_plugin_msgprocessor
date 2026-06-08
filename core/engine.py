# -*- coding: utf-8 -*-
"""规则引擎：按 priority 依次执行各规则的扁平 pipeline。"""
from __future__ import annotations

from typing import Any

from .models import ProcessResult, ProcessSegment
from .steps import RuleExecContext, normalize_rule_pipeline, run_rule_pipeline, run_rule_pipeline_async

ProcessOutput = str | list[str] | None


def _sort_rules(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(r: dict[str, Any]) -> tuple[int, str]:
        pr = r.get("priority", 0)
        try:
            p = int(pr)
        except (TypeError, ValueError):
            p = 0
        rid = str(r.get("id", ""))
        return (-p, rid)

    return sorted(rules, key=key)


def _rules_from_doc(rules_doc: dict[str, Any], *, rule_ids: list[str] | None = None) -> list[dict[str, Any]]:
    rules = rules_doc.get("rules")
    if not isinstance(rules, list):
        return []
    items = [r for r in rules if isinstance(r, dict)]
    if rule_ids:
        id_set = {str(rid) for rid in rule_ids if str(rid).strip()}
        items = [r for r in items if str(r.get("id", "")) in id_set]
        return [{**r, "enabled": True} for r in items]
    return items


def _apply_rule(message: str, rule: dict[str, Any], meta: dict[str, Any]) -> ProcessOutput:
    if not rule.get("enabled", True):
        return message

    rid = str(rule.get("id", ""))
    pipeline = normalize_rule_pipeline(rule)
    ctx = RuleExecContext(
        message=message,
        rule_id=rid,
        meta=dict(meta),
        limits=rule.get("limits") if isinstance(rule.get("limits"), dict) else {},
        halt=False,
    )
    run_rule_pipeline(ctx, pipeline)
    if ctx.dropped:
        return None
    if ctx.split_parts:
        return ctx.split_parts
    return ctx.message


async def _apply_rule_async(message: str, rule: dict[str, Any], meta: dict[str, Any]) -> ProcessOutput:
    if not rule.get("enabled", True):
        return message

    rid = str(rule.get("id", ""))
    pipeline = normalize_rule_pipeline(rule)
    ctx = RuleExecContext(
        message=message,
        rule_id=rid,
        meta=dict(meta),
        limits=rule.get("limits") if isinstance(rule.get("limits"), dict) else {},
        halt=False,
    )
    await run_rule_pipeline_async(ctx, pipeline)
    if ctx.dropped:
        return None
    if ctx.split_parts:
        return ctx.split_parts
    return ctx.message


def _fan_out_rule_results(pending: list[str], result: ProcessOutput) -> list[str]:
    if result is None:
        return pending
    if isinstance(result, list):
        pending.extend(result)
        return pending
    pending.append(result)
    return pending


def _build_process_result(message: str, pending: list[str]) -> ProcessResult:
    dropped = not pending and bool(message.strip())
    return ProcessResult(
        input=message,
        segments=_segments_from_pending(pending),
        dropped=dropped,
    )


def _segments_from_pending(pending: list[str]) -> list[ProcessSegment]:
    if not pending:
        return []
    return [ProcessSegment(text=text) for text in pending]


def process_message(
    rules_doc: dict[str, Any],
    message: str,
    *,
    meta: dict[str, Any] | None = None,
    rule_ids: list[str] | None = None,
) -> ProcessResult:
    meta = meta or {}
    pending = [message]
    for rule in _sort_rules(_rules_from_doc(rules_doc, rule_ids=rule_ids)):
        next_pending: list[str] = []
        for msg in pending:
            _fan_out_rule_results(next_pending, _apply_rule(msg, rule, meta))
        pending = next_pending
    return _build_process_result(message, pending)


async def process_message_async(
    rules_doc: dict[str, Any],
    message: str,
    *,
    meta: dict[str, Any] | None = None,
    rule_ids: list[str] | None = None,
) -> ProcessResult:
    meta = meta or {}
    pending = [message]
    for rule in _sort_rules(_rules_from_doc(rules_doc, rule_ids=rule_ids)):
        next_pending: list[str] = []
        for msg in pending:
            _fan_out_rule_results(next_pending, await _apply_rule_async(msg, rule, meta))
        pending = next_pending
    return _build_process_result(message, pending)


def process_text(
    rules_doc: dict[str, Any],
    message: str,
    *,
    meta: dict[str, Any] | None = None,
    rule_ids: list[str] | None = None,
) -> ProcessOutput:
    return process_message(rules_doc, message, meta=meta, rule_ids=rule_ids).to_legacy_output() or ""


async def process_text_async(
    rules_doc: dict[str, Any],
    message: str,
    *,
    meta: dict[str, Any] | None = None,
    rule_ids: list[str] | None = None,
) -> ProcessOutput:
    result = await process_message_async(rules_doc, message, meta=meta, rule_ids=rule_ids)
    legacy = result.to_legacy_output()
    return legacy if legacy is not None else ""


def process_with_rules(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any]) -> ProcessOutput:
    return process_text(rules_doc, message, meta=meta)


async def process_with_rules_async(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any]) -> ProcessOutput:
    return await process_text_async(rules_doc, message, meta=meta)
