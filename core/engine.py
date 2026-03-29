# -*- coding: utf-8 -*-
"""规则引擎：`rules` 中的 `steps`（match_block / end_rule）。"""
from __future__ import annotations

from typing import Any

from .steps import RuleExecContext, normalize_rule_steps, run_rule_steps


def process_text(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any] | None = None) -> str:
    return process_with_rules(rules_doc, message, meta=meta or {})


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


def _apply_rule(message: str, rule: dict[str, Any], meta: dict[str, Any]) -> str:
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
    return ctx.message


def process_with_rules(rules_doc: dict[str, Any], message: str, *, meta: dict[str, Any]) -> str:
    rules = rules_doc.get("rules")
    if not isinstance(rules, list):
        return message
    out = message
    for rule in _sort_rules([r for r in rules if isinstance(r, dict)]):
        out = _apply_rule(out, rule, meta)
    return out
