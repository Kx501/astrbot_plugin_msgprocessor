"""Evaluate LLM request injection without depending on AstrBot."""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass
class InjectionContext:
    user_id: str = ""
    user_nickname: str = ""
    group_id: str = ""
    umo: str = ""
    session_id: str = ""
    self_id: str = ""
    timezone: str = "Asia/Shanghai"
    conversation_id: str = ""


@dataclass
class InjectionResult:
    prompt: str
    system_prompt: str
    parts: list[dict[str, Any]] = field(default_factory=list)
    blocks: list[dict[str, Any]] = field(default_factory=list)
    daily_dates: dict[str, str] = field(default_factory=dict)
    date: str = ""


POSITIONS = {
    "system_start", "system_end", "message_start", "message_end", "message_replace"
}


def validate_request_rules(doc: dict[str, Any]) -> None:
    """Reject ambiguous stages and invalid injection configurations.

    Args:
        doc: A message processor rules document.

    Raises:
        ValueError: A rule mixes stages or contains invalid injection settings.
        TypeError: A rule or configuration has an invalid value type.
    """
    ids: set[str] = set()
    for rule in doc.get("rules", []):
        if not isinstance(rule, dict):
            raise TypeError("Each rule must be an object")
        rid = str(rule.get("id", "")).strip()
        if not rid or rid in ids:
            raise ValueError("Rule IDs must be nonempty and unique")
        ids.add(rid)
        target = rule.get("target", "outbound")
        if target not in {"outbound", "llm_request"}:
            raise ValueError(f"Unknown rule target: {target}")
        labels: set[str] = set()
        for index, step in enumerate(rule.get("pipeline", [])):
            if not isinstance(step, dict):
                raise TypeError("Each pipeline step must be an object")
            if target == "outbound":
                if step.get("id") == "inject":
                    raise ValueError("Injection requires the LLM request category")
                continue
            if step.get("id") != "inject":
                raise ValueError("LLM request rules currently support only injection")
            label = str(step.get("label") or f"s{index + 1}")
            if label in labels:
                raise ValueError("Injection step labels must be unique within a rule")
            labels.add(label)
            cfg = step.get("config", {})
            if not isinstance(cfg, dict):
                raise TypeError("Injection configuration must be an object")
            if cfg.get("position") not in POSITIONS:
                raise ValueError("Invalid injection position")
            if cfg.get("schedule", "always") not in {"always", "daily"}:
                raise ValueError("Invalid injection schedule")
            if not isinstance(cfg.get("template", ""), str):
                raise TypeError("Injection template must be a string")
            if cfg.get("ephemeral") and cfg.get("position") != "message_end":
                raise ValueError("Temporary injection requires message_end")
            when = cfg.get("when", {})
            if not isinstance(when, dict):
                raise TypeError("Injection conditions must be an object")
            if when.get("chat", "any") not in {"any", "private", "group"}:
                raise ValueError("Invalid chat condition")
            for key in ("user_ids", "group_ids"):
                if key in when and not isinstance(when[key], list):
                    raise ValueError(f"{key} must be a list")
            if when.get("message_regex"):
                try:
                    re.compile(str(when["message_regex"]))
                except re.error as exc:
                    raise ValueError(f"Invalid injection regex: {exc}") from exc


def process_request(
    doc: dict[str, Any],
    prompt: str,
    system_prompt: str,
    context: InjectionContext,
    *,
    daily_dates: dict[str, str] | None = None,
    rule_ids: list[str] | None = None,
    now: datetime | None = None,
) -> InjectionResult:
    """Apply request rules and return state without persisting or mutating inputs.

    Args:
        doc: Rules sharing the message processor document.
        prompt: Current user prompt.
        system_prompt: Current system instructions.
        context: Sender, session and timezone variables.
        daily_dates: Previously applied dates keyed by session, rule and step.
        rule_ids: Optional rules to preview, including disabled rules.
        now: Optional clock override for deterministic testing.

    Returns:
        Updated request fields, actual injection trace and daily state.
    """
    try:
        tz = ZoneInfo(context.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        # Windows may not provide an IANA timezone database.
        tz = timezone(timedelta(hours=8))
    current = datetime.now(tz) if now is None else now.astimezone(tz)
    result = InjectionResult(prompt, system_prompt, daily_dates=dict(daily_dates or {}))
    result.date = current.strftime("%Y-%m-%d")
    rules = [
        rule for rule in doc.get("rules", [])
        if isinstance(rule, dict) and rule.get("target") == "llm_request"
        and (str(rule.get("id")) in rule_ids if rule_ids else rule.get("enabled", True))
    ]
    rules.sort(key=lambda rule: (-int(rule.get("priority", 0)), str(rule.get("id", ""))))
    # Keep always-before-daily behavior when importing InfoInjection rules.
    for schedule in ("always", "daily"):
        for rule in rules:
            for index, step in enumerate(rule.get("pipeline", [])):
                if step.get("id") != "inject":
                    continue
                cfg = step.get("config", {})
                if cfg.get("schedule", "always") != schedule:
                    continue
                position = cfg.get("position")
                if position not in POSITIONS:
                    continue
                rid = str(rule.get("id", ""))
                label = str(step.get("label") or f"s{index + 1}")
                state_key = json.dumps([
                    context.umo, context.conversation_id or context.session_id,
                    rid, str(cfg.get("state_id") or label),
                ])
                if schedule == "daily" and result.daily_dates.get(state_key) == result.date:
                    continue
                when = cfg.get("when", {})
                chat = when.get("chat", "any")
                if (chat == "private" and context.group_id) or (chat == "group" and not context.group_id):
                    continue
                user_ids = {str(v).strip() for v in when.get("user_ids", []) if str(v).strip()}
                group_ids = {str(v).strip() for v in when.get("group_ids", []) if str(v).strip()}
                if user_ids and context.user_id not in user_ids:
                    continue
                if group_ids and (not context.group_id or context.group_id not in group_ids):
                    continue
                # Conditions inspect the original input; templates see the current prompt.
                if when.get("message_contains") and str(when["message_contains"]) not in prompt:
                    continue
                if when.get("message_regex"):
                    try:
                        if not re.search(str(when["message_regex"]), prompt):
                            continue
                    except re.error:
                        continue
                values = {
                    "date": result.date,
                    "datetime": current.strftime("%Y-%m-%d %H:%M:%S"),
                    "time": current.strftime("%H:%M:%S"),
                    "weekday": ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")[current.weekday()],
                    "user": html.escape(context.user_nickname or context.user_id, quote=True),
                    "id": html.escape(context.user_id, quote=True),
                    "content": html.escape(result.prompt, quote=False),
                    "user_id": context.user_id,
                    "user_nickname": context.user_nickname,
                    "user_message": result.prompt,
                    "prompt": result.prompt,
                    "group_id": context.group_id,
                    "session_id": context.session_id,
                    "umo": context.umo,
                    "self_id": context.self_id,
                }
                text = re.sub(
                    r"\{\{\s*([a-zA-Z_][\w]*)\s*\}\}",
                    lambda match, values=values: values.get(match[1], ""),
                    str(cfg.get("template", "")),
                ).strip()
                if not text:
                    continue
                ephemeral = bool(cfg.get("ephemeral", False)) and position == "message_end"
                if position == "message_replace":
                    if not result.prompt.strip():
                        continue
                    if result.prompt.startswith("<msg ") and "</msg>" in result.prompt:
                        continue
                    result.prompt = text
                elif position == "message_start":
                    result.prompt = text + ("\n\n" + result.prompt if result.prompt else "")
                elif position == "system_start":
                    result.system_prompt = text + ("\n" + result.system_prompt if result.system_prompt else "")
                elif position == "system_end":
                    result.system_prompt += ("\n" if result.system_prompt else "") + text
                else:
                    result.parts.append({"text": text, "ephemeral": ephemeral})
                result.blocks.append({
                    "rule_id": rid, "step": label, "position": position,
                    "ephemeral": ephemeral, "priority": rule.get("priority", 0),
                    "text": text, "text_len": len(text),
                })
                if schedule == "daily":
                    result.daily_dates[state_key] = result.date
    return result
