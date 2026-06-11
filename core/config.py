# -*- coding: utf-8 -*-
"""插件运行时配置（与宿主平台无关）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .outbound import DelayPolicy, parse_delay_policy


def defaults() -> dict[str, Any]:
    return {
        "web_enabled": True,
        "web_host": "127.0.0.1",
        "web_port": 5878,
        "process_messages": True,
        "translate_llm": "default",
        "llm_translate_prompt": "请将以下文本翻译，只输出译文，不要解释。",
        "review_llm": "default",
        "llm_review_prompt": (
            "以下是即将发到聊天平台的回复。若含连续空行：\n"
            "- 若是文章/长文排版，保持原样\n"
            "- 若是日常闲聊且应分多条发送，用单独一行的 --- 分隔各段，去掉多余空行\n"
            "只输出修正后正文。\n\n{{text}}"
        ),
        "batch_send_mode": "fixed",
        "batch_send_delay": 0.0,
        "batch_send_per_char": 0.05,
        "batch_send_delay_jitter": 0.0,
        "batch_send_delay_min": 0.0,
        "batch_send_delay_max": 0.0,
    }


def _float_nonneg(raw: Any, *, fallback: float) -> float:
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        return fallback


def load_config(data_dir: Path, *, on_error: Any = None) -> dict[str, Any]:
    base = defaults()
    path = data_dir / "config.json"
    if not path.is_file():
        return base
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as exc:
        if on_error is not None:
            on_error(exc)
        return base
    if not isinstance(raw, dict):
        return base

    if "web_enabled" in raw:
        base["web_enabled"] = bool(raw["web_enabled"])
    if isinstance(raw.get("web_host"), str) and raw["web_host"].strip():
        base["web_host"] = raw["web_host"].strip()
    if "web_port" in raw:
        try:
            p = int(raw["web_port"])
            if 1 <= p <= 65535:
                base["web_port"] = p
        except (TypeError, ValueError):
            pass
    if "process_messages" in raw:
        base["process_messages"] = bool(raw["process_messages"])
    if isinstance(raw.get("translate_llm"), str):
        base["translate_llm"] = raw["translate_llm"].strip()
    if isinstance(raw.get("llm_translate_prompt"), str):
        base["llm_translate_prompt"] = raw["llm_translate_prompt"]
    if isinstance(raw.get("review_llm"), str):
        base["review_llm"] = raw["review_llm"].strip()
    if isinstance(raw.get("llm_review_prompt"), str):
        base["llm_review_prompt"] = raw["llm_review_prompt"]
    if isinstance(raw.get("batch_send_mode"), str) and raw["batch_send_mode"].strip():
        base["batch_send_mode"] = raw["batch_send_mode"].strip().lower()
    for key in (
        "batch_send_delay",
        "batch_send_per_char",
        "batch_send_delay_jitter",
        "batch_send_delay_min",
        "batch_send_delay_max",
    ):
        if key in raw:
            base[key] = _float_nonneg(raw[key], fallback=0.0)
    return base


def build_config(
    data_dir: Path,
    ab_cfg: Any | None = None,
    *,
    on_error: Any = None,
) -> dict[str, Any]:
    """合并数据目录 config.json 与 AstrBot _conf_schema 配置（WebUI 下拉等）。"""
    cfg = load_config(data_dir, on_error=on_error)
    if ab_cfg is None:
        return cfg
    try:
        src = dict(ab_cfg)
    except (TypeError, ValueError):
        return cfg
    for key in defaults():
        if key.startswith("web_"):
            continue
        if key in src:
            cfg[key] = src[key]
    return cfg


__all__ = ["DelayPolicy", "defaults", "load_config", "build_config", "parse_delay_policy"]
