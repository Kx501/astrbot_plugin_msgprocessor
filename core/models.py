# -*- coding: utf-8 -*-
"""领域模型：区间、命中、流水线上下文。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Span:
    """半开区间 [start, end)，相对整条消息的字符下标。"""

    start: int
    end: int

    def __post_init__(self) -> None:
        if self.start > self.end:
            raise ValueError(f"invalid span: {self.start} > {self.end}")


@dataclass
class MatchHit:
    """主匹配的一次命中；``region_text`` 为内层模块处理的命中段。"""

    span: Span
    region_span: Span
    region_text: str
    groups: tuple[str, ...] = ()


@dataclass
class ProcessingContext:
    message: str
    rule_id: str
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ModuleResult:
    text: str
    # 为 True 时不采纳本步的 text，保持进入本步前的命中段并继续执行后续模块
    skip_rule: bool = False
