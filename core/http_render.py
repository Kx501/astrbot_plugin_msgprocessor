# -*- coding: utf-8 -*-
"""HTTP 渲染：向链接请求并把返回结果转为图片段。"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import urllib.error
import urllib.request
from typing import Any

from .segment_markers import build_image_base64_marker

_METHODS = frozenset({"GET", "POST"})
_TEXT_PLACEHOLDER = "{{text}}"
logger = logging.getLogger(__name__)


def _parse_method(raw: Any) -> str:
    s = str(raw or "GET").strip().upper()
    if s == "POST_JSON":
        return "POST"
    return s if s in _METHODS else "GET"


def _apply_text_template(raw: Any, text: str) -> str:
    s = "" if raw is None else str(raw)
    if _TEXT_PLACEHOLDER in s:
        return s.replace(_TEXT_PLACEHOLDER, text)
    return s


def _inject_text_template_value(value: Any, message_text: str) -> Any:
    """在已解析的 JSON 树中替换 ``{{text}}``，多行正文由 ``json.dumps`` 正确转义。"""
    if isinstance(value, str):
        if _TEXT_PLACEHOLDER in value:
            return value.replace(_TEXT_PLACEHOLDER, message_text)
        return value
    if isinstance(value, dict):
        return {
            key: _inject_text_template_value(item, message_text)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_inject_text_template_value(item, message_text) for item in value]
    return value


def _parse_body_json(raw: Any, *, message_text: str) -> bytes | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raw = str(raw)
    source = raw.strip()
    if not source:
        return None

    # 先解析 JSON，再注入正文，避免多行/引号破坏 JSON。
    try:
        obj = json.loads(source)
        obj = _inject_text_template_value(obj, message_text)
        return json.dumps(obj, ensure_ascii=False).encode("utf-8")
    except json.JSONDecodeError:
        pass

    # 兼容旧配置：整段替换后再解析（仅适用于单行正文）。
    templated = _apply_text_template(raw, message_text).strip()
    if not templated:
        return None
    obj = json.loads(templated)
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


def _looks_like_image(data: bytes) -> bool:
    if len(data) < 3:
        return False
    if data[:3] == b"\xff\xd8\xff":
        return True
    if len(data) >= 4 and data[:4] == b"\x89PNG":
        return True
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    return False


def _fetch_bytes(url: str, *, method: str, body: bytes | None, timeout_s: float) -> bytes:
    headers: dict[str, str] = {"User-Agent": "msgprocessor/1.0"}
    if method == "POST":
        data = body or json.dumps({"text": ""}, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=headers, method="GET")

    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return resp.read()


async def render_image_http(text: str, cfg: dict[str, Any]) -> str:
    """请求 cfg.url 并将返回字节编码为 image_base64 段标记。"""
    url = _apply_text_template(cfg.get("url"), text).strip()
    if not url:
        return ""
    method = _parse_method(cfg.get("method"))
    timeout_s = float(cfg.get("timeout_s") or 15.0)
    if timeout_s <= 0:
        timeout_s = 15.0
    try:
        body = _parse_body_json(cfg.get("body_json"), message_text=text)
    except Exception as exc:
        logger.warning("render_image: body_json parse failed: %s", exc)
        body = None
    if method == "POST" and body is None:
        logger.warning(
            "render_image: falling back to default JSON body (tmpl/t2i fields will be lost)"
        )
        body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")

    try:
        data = await asyncio.to_thread(_fetch_bytes, url, method=method, body=body, timeout_s=timeout_s)
    except (urllib.error.URLError, ValueError, OSError) as exc:
        logger.warning("render_image: request failed url=%s err=%s", url, exc)
        return ""
    if not data:
        logger.warning("render_image: empty response from %s", url)
        return ""
    if not _looks_like_image(data):
        preview = data[:120].decode("utf-8", errors="replace")
        logger.warning(
            "render_image: response is not image bytes from %s preview=%r "
            "(check json:false for AstrBot t2i /generate)",
            url,
            preview,
        )
        return ""
    b64 = base64.b64encode(data).decode("ascii")
    return build_image_base64_marker(b64)
