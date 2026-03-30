# -*- coding: utf-8 -*-
"""AstrBot 入口：插件类须位于 main.py（AstrBot 约定）。"""

from __future__ import annotations

import asyncio
import json
import shutil
import threading
from pathlib import Path
from typing import Any

import uvicorn
from astrbot.api import logger as ab_logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star, StarTools, register

from .core.engine import process_text_async
from .core.loader import load_rules_from_path
from .core.modules import translate_llm_fallback
from .core.server import create_app

_PLUGIN_ROOT = Path(__file__).resolve().parent
_SAMPLE_RULES = _PLUGIN_ROOT / "sample_rules.json"
_WEB_DIST = _PLUGIN_ROOT / "web" / "dist"


def _default_plugin_config() -> dict[str, Any]:
    """与仓库根 sample_config.json 字段一致（类比 ApiDog 的 config.json + sample_config.json）。"""
    return {
        "web_enabled": True,
        "web_host": "127.0.0.1",
        "web_port": 5878,
        "process_messages": True,
        "llm_translate_enabled": False,
        "llm_translate_default_lang": "英文",
        "llm_translate_prompt_suffix": "",
    }


def _load_plugin_config(data_dir: Path) -> dict[str, Any]:
    base = _default_plugin_config()
    path = data_dir / "config.json"
    if not path.is_file():
        return base
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        ab_logger.exception("MsgProcessor: 读取 config.json 失败，使用默认配置")
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
    if "llm_translate_enabled" in raw:
        base["llm_translate_enabled"] = bool(raw["llm_translate_enabled"])
    if isinstance(raw.get("llm_translate_default_lang"), str):
        v = raw["llm_translate_default_lang"].strip()
        if v:
            base["llm_translate_default_lang"] = v
    if isinstance(raw.get("llm_translate_prompt_suffix"), str):
        base["llm_translate_prompt_suffix"] = raw["llm_translate_prompt_suffix"]
    return base


@register(
    "MsgProcessor",
    "按规则处理入站消息的纯文本（message_str），并可选启动 Web 配置台。数据目录与 ApiDog 相同：rules.json、config.json。",
    "0.1.0",
    "",
)
class MsgProcessorStar(Star):
    def __init__(self, context: Context) -> None:
        super().__init__(context)
        self._data_dir = Path(StarTools.get_data_dir(None))
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._rules_path = self._data_dir / "rules.json"
        self._ensure_rules_file()
        self._cfg = _load_plugin_config(self._data_dir)
        self._rules_mtime: float | None = None
        self._rules_cache: dict[str, Any] | None = None
        self._uvicorn_server: uvicorn.Server | None = None
        self._uvicorn_thread: threading.Thread | None = None
        if self._cfg.get("web_enabled", True):
            self._start_web_admin()

    def _ensure_rules_file(self) -> None:
        if self._rules_path.is_file():
            return
        if _SAMPLE_RULES.is_file():
            shutil.copy2(_SAMPLE_RULES, self._rules_path)
            ab_logger.info("MsgProcessor: 已从 sample_rules.json 初始化 %s", self._rules_path)
        else:
            stub = {"schema_version": 4, "rules": []}
            with open(self._rules_path, "w", encoding="utf-8") as f:
                json.dump(stub, f, ensure_ascii=False, indent=2)

    def _load_rules_doc(self) -> dict[str, Any]:
        if not self._rules_path.is_file():
            return {"schema_version": 4, "rules": []}
        try:
            mtime = self._rules_path.stat().st_mtime
        except OSError:
            return {"schema_version": 4, "rules": []}
        if self._rules_cache is not None and self._rules_mtime == mtime:
            return self._rules_cache
        try:
            doc = load_rules_from_path(self._rules_path)
        except Exception:
            ab_logger.exception("MsgProcessor: 加载 rules.json 失败")
            return {"schema_version": 4, "rules": []}
        self._rules_mtime = mtime
        self._rules_cache = doc
        return doc

    def _start_web_admin(self) -> None:
        host = str(self._cfg.get("web_host") or "127.0.0.1")
        try:
            port = int(self._cfg.get("web_port") or 5878)
        except (TypeError, ValueError):
            port = 5878
        try:
            app = create_app(data_dir=self._data_dir, web_dist=_WEB_DIST)
            config = uvicorn.Config(app, host=host, port=port, access_log=False)
            self._uvicorn_server = uvicorn.Server(config)
            self._uvicorn_thread = threading.Thread(target=self._uvicorn_server.run, daemon=True)
            self._uvicorn_thread.start()
            ab_logger.info("MsgProcessor: Web 配置台 http://%s:%s/", host, port)
        except Exception:
            ab_logger.exception("MsgProcessor: Web 启动失败（可在数据目录 config.json 中设 web_enabled: false）")

    async def terminate(self) -> None:
        if self._uvicorn_server is not None:
            self._uvicorn_server.should_exit = True
            th = self._uvicorn_thread
            if th is not None and th.is_alive():
                await asyncio.to_thread(th.join, 3.0)
        ab_logger.info("MsgProcessor 已停止")

    def _translate_llm_handler(self, event: AstrMessageEvent):
        """供规则引擎 meta 注入；内部使用 AstrBot 的 llm_generate（需框架 ≥ 4.5.7）。"""

        cfg_star = self._cfg
        ctx_ab = self.context

        async def translate_llm(text: str, scfg: dict[str, Any], _pctx: Any, _hit: Any) -> str:
            if not cfg_star.get("llm_translate_enabled", False):
                return translate_llm_fallback(text, scfg)
            target = str(scfg.get("target_lang") or cfg_star.get("llm_translate_default_lang") or "英文").strip()
            suffix = str(cfg_star.get("llm_translate_prompt_suffix") or "").strip()
            prompt = f"请将以下文本翻译成{target}，只输出译文，不要解释：\n\n{text}"
            if suffix:
                prompt = f"{prompt}\n\n{suffix}"
            try:
                umo = event.unified_msg_origin
                pid = await ctx_ab.get_current_chat_provider_id(umo=umo)
                resp = await ctx_ab.llm_generate(chat_provider_id=pid, prompt=prompt)
                out = (getattr(resp, "completion_text", None) or "").strip()
                return out if out else translate_llm_fallback(text, scfg)
            except Exception:
                ab_logger.exception("MsgProcessor: AI翻译失败")
                return translate_llm_fallback(text, scfg)

        return translate_llm

    @filter.event_message_type(
        filter.EventMessageType.GROUP_MESSAGE | filter.EventMessageType.PRIVATE_MESSAGE,
        priority=12,
    )
    async def on_text_pipeline(self, event: AstrMessageEvent) -> None:
        if not self._cfg.get("process_messages", True):
            return
        raw = event.message_str
        if not raw:
            return
        try:
            doc = self._load_rules_doc()
            meta = {"translate_llm": self._translate_llm_handler(event)}
            out = await process_text_async(doc, raw, meta=meta)
        except Exception:
            ab_logger.exception("MsgProcessor: process_text_async 异常")
            return
        if out != raw:
            event.message_str = out
