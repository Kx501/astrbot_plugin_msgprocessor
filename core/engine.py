# -*- coding: utf-8 -*-
"""规则引擎：`rules` 中的 `steps`（match_block / end_rule）。"""
from __future__ import annotations

from typing import Any

from .steps import RuleExecContext, normalize_rule_steps, run_rule_steps, run_rule_steps_async


ProcessOutput = str | list[str]


def process_text(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any] | None = None) -> ProcessOutput:
    return process_with_rules(rules_doc, message, meta=meta or {})


async def process_text_async(
    rules_doc: dict[str, Any],
    message: str,
    *,
    meta: dict[str, Any] | None = None,
) -> ProcessOutput:
    return await process_with_rules_async(rules_doc, message, meta=meta or {})


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


def _apply_rule(message: str, rule: dict[str, Any], meta: dict[str, Any]) -> ProcessOutput:
    if not rule.get("enabled", True):
        return message

    rid = str(rule.get("id", ""))
    steps = normalize_rule_steps(rule)
    ctx = RuleExecContext(
        message=message,
        rule_id=rid,
        meta=dict(meta),
        limits=rule.get("limits") if isinstance(rule.get("limits"), dict) else {},
        stop_rule=False,
    )
    run_rule_steps(ctx, steps)
    if ctx.split_parts:
        return ctx.split_parts
    return ctx.message


async def _apply_rule_async(message: str, rule: dict[str, Any], meta: dict[str, Any]) -> ProcessOutput:
    if not rule.get("enabled", True):
        return message

    rid = str(rule.get("id", ""))
    steps = normalize_rule_steps(rule)
    ctx = RuleExecContext(
        message=message,
        rule_id=rid,
        meta=dict(meta),
        limits=rule.get("limits") if isinstance(rule.get("limits"), dict) else {},
        stop_rule=False,
    )
    await run_rule_steps_async(ctx, steps)
    if ctx.split_parts:
        return ctx.split_parts
    return ctx.message


def _fan_out_rule_results(pending: list[str], result: ProcessOutput) -> list[str]:
    if isinstance(result, list):
        pending.extend(result)
        return pending
    pending.append(result)
    return pending


def process_with_rules(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any]) -> ProcessOutput:
    rules = rules_doc.get("rules")
    if not isinstance(rules, list):
        return message
    pending = [message]
    for rule in _sort_rules([r for r in rules if isinstance(r, dict)]):
        next_pending: list[str] = []
        for msg in pending:
            _fan_out_rule_results(next_pending, _apply_rule(msg, rule, meta))
        pending = next_pending
    if len(pending) == 1:
        return pending[0]
    return pending


async def process_with_rules_async(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any]) -> ProcessOutput:
    rules = rules_doc.get("rules")
    if not isinstance(rules, list):
        return message
    pending = [message]
    for rule in _sort_rules([r for r in rules if isinstance(r, dict)]):
        next_pending: list[str] = []
        for msg in pending:
            _fan_out_rule_results(next_pending, await _apply_rule_async(msg, rule, meta))
        pending = next_pending
    if len(pending) == 1:
        return pending[0]
    return pending
