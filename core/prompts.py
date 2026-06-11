# -*- coding: utf-8 -*-
"""LLM 提示词解析（与宿主平台无关）。"""
from __future__ import annotations

from typing import Any


def render_llm_prompt(instruction: str, text: str) -> str:
    """将指令与正文拼成最终 prompt；支持 ``{{text}}`` 占位符。"""
    head = (instruction or "").strip()
    if not head:
        return text
    if "{{text}}" in head:
        return head.replace("{{text}}", text)
    return f"{head}\n\n{text}"


def resolve_step_prompt(
    scfg: dict[str, Any],
    global_prompt: str,
    *,
    default: str,
) -> str:
    """优先级：步骤 config.prompt → 全局 config → 内置默认。"""
    for key in ("prompt", "instruction"):
        raw = scfg.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    if isinstance(global_prompt, str) and global_prompt.strip():
        return global_prompt.strip()
    return default
