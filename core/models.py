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
    """主匹配在窗口内的一次命中（region 为 apply_hits 内层模块处理的片段）。"""

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
    skip_rule: bool = False
