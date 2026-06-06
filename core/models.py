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
    # 为 True 时拦截本条待发消息（不发送）
    drop: bool = False
    # 为 True 时终止所在规则的后续步骤（不拦截发送）
    end_rule: bool = False
    # 非空时表示将命中段拆为多条消息；text 为拆分后首段（供未感知拆分的调用方回退）
    split_parts: list[str] | None = None


@dataclass(frozen=True)
class ProcessSegment:
    """处理结果中的一条待发消息段（当前仅纯文本）。"""

    text: str
    type: str = "plain"


@dataclass(frozen=True)
class ProcessEffect:
    """结构性或可见的处理效果，供测试区展示。"""

    kind: str
    rule_id: str = ""
    detail: str = ""


@dataclass
class ProcessResult:
    input: str
    segments: list[ProcessSegment]
    effects: list[ProcessEffect] = field(default_factory=list)
    dropped: bool = False

    @property
    def unchanged(self) -> bool:
        return not self.dropped and len(self.segments) == 1 and self.segments[0].text == self.input

    def to_legacy_output(self) -> str | list[str] | None:
        if self.dropped:
            return None
        texts = [s.text for s in self.segments]
        if not texts:
            return ""
        if len(texts) == 1:
            return texts[0]
        return texts

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "input": self.input,
            "segments": [{"type": s.type, "text": s.text} for s in self.segments],
            "effects": [
                {"kind": e.kind, "rule_id": e.rule_id, "detail": e.detail} for e in self.effects
            ],
            "unchanged": self.unchanged,
            "dropped": self.dropped,
            "output": self.to_legacy_output(),
        }
