# -*- coding: utf-8 -*-
"""将特殊文本标记映射为结构化输出段。"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SegMarker:
    seg_type: str
    prefix: str


IMAGE_BASE64 = SegMarker(seg_type="image_base64", prefix="__mp_seg_image_base64__:")

_ALL = (IMAGE_BASE64,)


def parse_segment_marker(text: str) -> tuple[str, str] | None:
    """若 text 为特殊段标记，返回 (type, payload)，否则返回 None。"""
    for m in _ALL:
        if text.startswith(m.prefix):
            return m.seg_type, text[len(m.prefix) :]
    return None


def build_image_base64_marker(b64: str) -> str:
    return f"{IMAGE_BASE64.prefix}{b64}"

