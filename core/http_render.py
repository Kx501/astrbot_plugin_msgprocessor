# -*- coding: utf-8 -*-
"""HTTP 渲染：向链接请求并把返回结果转为图片段。"""
from __future__ import annotations

import asyncio
import base64
import json
import urllib.error
import urllib.request
from typing import Any

from .segment_markers import build_image_base64_marker

_METHODS = frozenset({"GET", "POST"})


def _parse_method(raw: Any) -> str:
    s = str(raw or "GET").strip().upper()
    if s == "POST_JSON":
        return "POST"
    return s if s in _METHODS else "GET"


def _apply_text_template(raw: Any, text: str) -> str:
    s = "" if raw is None else str(raw)
    if "{{text}}" in s:
        return s.replace("{{text}}", text)
    return s


def _parse_body_json(raw: Any, *, message_text: str) -> bytes | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raw = str(raw)
    templated = _apply_text_template(raw, message_text).strip()
    if not templated:
        return None
    obj = json.loads(templated)
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


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
    except Exception:
        body = None
    if method == "POST" and body is None:
        body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")

    try:
        data = await asyncio.to_thread(_fetch_bytes, url, method=method, body=body, timeout_s=timeout_s)
    except (urllib.error.URLError, ValueError, OSError):
        return ""
    if not data:
        return ""
    b64 = base64.b64encode(data).decode("ascii")
    return build_image_base64_marker(b64)
