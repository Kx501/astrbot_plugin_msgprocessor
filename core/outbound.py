# -*- coding: utf-8 -*-
"""批量待发消息的发送编排（与 IM / 宿主框架解耦）。"""
from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TypeVar

T = TypeVar("T")

MODES = ("none", "fixed", "chars")


@dataclass(frozen=True)
class DelayPolicy:
    """拆分后第 2 条及以后、发送前的等待策略。"""

    mode: str = "fixed"
    base: float = 0.0
    per_char: float = 0.0
    jitter: float = 0.0
    min_sec: float = 0.0
    max_sec: float = 0.0

    def seconds_for(self, char_count: int) -> float:
        mode = self.mode if self.mode in MODES else "fixed"
        if mode == "none":
            return 0.0

        if mode == "chars":
            sec = self.base + self.per_char * max(0, char_count)
        else:
            sec = self.base

        if self.jitter > 0:
            sec += random.uniform(-self.jitter, self.jitter)

        sec = max(0.0, sec)
        if self.min_sec > 0:
            sec = max(sec, self.min_sec)
        if self.max_sec > 0:
            sec = min(sec, self.max_sec)
        return sec


def parse_delay_policy(cfg: dict[str, Any]) -> DelayPolicy:
    def _f(key: str) -> float:
        try:
            return max(0.0, float(cfg.get(key, 0)))
        except (TypeError, ValueError):
            return 0.0

    mode = str(cfg.get("batch_send_mode", "fixed")).strip().lower()
    if mode not in MODES:
        mode = "fixed"

    return DelayPolicy(
        mode=mode,
        base=_f("batch_send_delay"),
        per_char=_f("batch_send_per_char"),
        jitter=_f("batch_send_delay_jitter"),
        min_sec=_f("batch_send_delay_min"),
        max_sec=_f("batch_send_delay_max"),
    )


def plain_char_count(batch: Any) -> int:
    if not isinstance(batch, list):
        return 0
    total = 0
    for comp in batch:
        text = getattr(comp, "text", None)
        if isinstance(text, str):
            total += len(text)
    return total


async def send_follow_ups(
    items: list[T],
    *,
    send_one: Callable[[T], Awaitable[None]],
    delay: DelayPolicy,
    char_count: Callable[[T], int] | None = None,
    has_content: Callable[[T], bool] | None = None,
) -> None:
    """发送后续段；首段由调用方自行发送。"""
    count_fn = char_count or (lambda _item: 0)
    for item in items:
        if has_content is not None and not has_content(item):
            continue
        sec = delay.seconds_for(count_fn(item))
        if sec > 0:
            await asyncio.sleep(sec)
        await send_one(item)
