# -*- coding: utf-8 -*-
"""AstrBot 入口：插件类须位于 main.py（AstrBot 约定）。仅处理待发消息的纯文本。"""

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

# Context.send_message 补丁：主动推送不走 on_decorating_result，需单独拦截。
_send_patch_installed = False
_msgprocessor_star_ref: Any = None
_SAMPLE_RULES = _PLUGIN_ROOT / "sample_rules.json"
_WEB_DIST = _PLUGIN_ROOT / "web" / "dist"


def _default_plugin_config() -> dict[str, Any]:
    """默认值：`sample_config.json` 仅含核心 Web 项；译向模型与提示词由 AstrBot 写入 config（见 `_conf_schema.json`）。"""
    return {
        "web_enabled": True,
        "web_host": "127.0.0.1",
        "web_port": 5878,
        "process_messages": True,
        "translate_llm": "default",
        "llm_translate_prompt": "请将以下文本翻译，只输出译文，不要解释。",
    }


def _translate_llm_provider(cfg: dict[str, Any]) -> tuple[bool, str | None]:
    """是否调用模型；(True, None) 表示用当前会话提供商；(True, id) 表示固定提供商；(False, None) 表示未配置提供商，只做前缀回退。"""
    raw = cfg.get("translate_llm", "default")
    s = "" if raw is None else str(raw).strip()
    if not s:
        return False, None
    if s.lower() == "default":
        return True, None
    return True, s


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
    if isinstance(raw.get("translate_llm"), str):
        base["translate_llm"] = raw["translate_llm"].strip()
    if "translate_llm" not in raw and "llm_translate_enabled" in raw:
        base["translate_llm"] = "default" if raw["llm_translate_enabled"] else ""
    if isinstance(raw.get("llm_translate_prompt"), str):
        base["llm_translate_prompt"] = raw["llm_translate_prompt"]
    return base


def _build_translate_prompt(instruction: str, text: str) -> str:
    """说明句（含译向，在 AstrBot 提示词中配置）与待译正文拼接。"""
    head = (instruction or "").strip()
    if not head:
        head = "请将以下文本翻译成中文，只输出译文，不要解释。"
    return f"{head}\n\n{text}"


def _preview_text(s: Any, max_len: int = 120) -> str:
    text = "" if s is None else str(s)
    text = text.replace("\n", "\\n")
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _ensure_send_message_patch(star: Any) -> None:
    """拦截 Context.send_message，使主动推送也走同一套规则。"""
    global _send_patch_installed, _msgprocessor_star_ref
    _msgprocessor_star_ref = star
    if _send_patch_installed:
        return
    _send_patch_installed = True
    orig = Context.send_message

    async def send_message_wrapped(self_ctx: Any, session: Any, message_chain: Any) -> bool:
        star_ref = _msgprocessor_star_ref
        if star_ref is None or not star_ref._cfg.get("process_messages", True):
            return await orig(self_ctx, session, message_chain)
        chain = getattr(message_chain, "chain", None)
        if not isinstance(chain, list) or not chain:
            return await orig(self_ctx, session, message_chain)
        try:
            umo = session if isinstance(session, str) else str(session)
            doc = star_ref._load_rules_doc()
            meta = {
                "translate_llm": star_ref._translate_llm_handler(
                    None,
                    proactive_umo=umo,
                ),
            }
            changed = await star_ref._apply_rules_to_plain_chain(chain, doc, meta)
            if changed > 0:
                ab_logger.debug(
                    "MsgProcessor: send_message patch changed_plain_segments=%s",
                    changed,
                )
        except Exception:
            ab_logger.exception("MsgProcessor: send_message patch 异常")
        return await orig(self_ctx, session, message_chain)

    Context.send_message = send_message_wrapped  # type: ignore[method-assign]
    Context._msgprocessor_send_message_orig = orig  # type: ignore[attr-defined]


def _restore_send_message_patch() -> None:
    global _send_patch_installed, _msgprocessor_star_ref
    _msgprocessor_star_ref = None
    orig = getattr(Context, "_msgprocessor_send_message_orig", None)
    if orig is not None:
        Context.send_message = orig  # type: ignore[method-assign]
        delattr(Context, "_msgprocessor_send_message_orig")
    _send_patch_installed = False


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
        _ensure_send_message_patch(self)

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
        _restore_send_message_patch()

    async def _apply_rules_to_plain_chain(
        self,
        chain: list[Any],
        doc: dict[str, Any],
        meta: dict[str, Any],
    ) -> int:
        changed = 0
        i = 0
        while i < len(chain):
            comp = chain[i]
            text = getattr(comp, "text", None)
            if not isinstance(text, str) or text == "":
                i += 1
                continue
            out = await process_text_async(doc, text, meta=meta)
            if isinstance(out, list):
                try:
                    new_comps = [type(comp)(part) for part in out]
                    chain[i : i + 1] = new_comps
                    changed += 1
                    i += len(new_comps)
                except Exception:
                    i += 1
                continue
            if out != text:
                try:
                    setattr(comp, "text", out)
                    changed += 1
                except Exception:
                    pass
            i += 1
        return changed

    def _translate_llm_handler(
        self,
        event: AstrMessageEvent | None = None,
        *,
        proactive_umo: str | None = None,
    ):
        """供规则引擎 meta 注入；内部使用 AstrBot 的 llm_generate（需框架 ≥ 4.5.7）。"""

        cfg_star = self._cfg
        ctx_ab = self.context

        async def translate_llm(text: str, scfg: dict[str, Any], _pctx: Any, _hit: Any) -> str:
            use_llm, fixed_provider = _translate_llm_provider(cfg_star)
            if not use_llm:
                return translate_llm_fallback(text, scfg)
            instruction = str(cfg_star.get("llm_translate_prompt") or "")
            prompt = _build_translate_prompt(instruction, text)
            try:
                if fixed_provider is None:
                    if proactive_umo is not None:
                        umo = proactive_umo
                    elif event is not None:
                        umo = event.unified_msg_origin
                    else:
                        return translate_llm_fallback(text, scfg)
                    pid = await ctx_ab.get_current_chat_provider_id(umo=umo)
                else:
                    pid = fixed_provider
                resp = await ctx_ab.llm_generate(chat_provider_id=pid, prompt=prompt)
                out = (getattr(resp, "completion_text", None) or "").strip()
                return out if out else translate_llm_fallback(text, scfg)
            except Exception:
                ab_logger.exception("MsgProcessor: AI翻译失败")
                return translate_llm_fallback(text, scfg)

        return translate_llm

    @filter.on_llm_response()
    async def on_llm_response_tap(self, event: AstrMessageEvent, resp: Any) -> None:
        """监听 LLM 回复阶段（发送前）。"""
        try:
            out = getattr(resp, "completion_text", None)
            preview = _preview_text(out)
            ab_logger.debug("MsgProcessor: on_llm_response preview=%s", preview)
        except Exception:
            ab_logger.exception("MsgProcessor: on_llm_response 监听异常")

    @filter.on_decorating_result()
    async def on_decorating_result_tap(self, event: AstrMessageEvent) -> None:
        """发送前装饰阶段：对结果链中的纯文本段应用规则处理。"""
        try:
            result = event.get_result()
            chain = getattr(result, "chain", None)
            if not isinstance(chain, list) or not chain:
                return
            if not self._cfg.get("process_messages", True):
                return

            doc = self._load_rules_doc()
            meta = {"translate_llm": self._translate_llm_handler(event)}
            changed = await self._apply_rules_to_plain_chain(chain, doc, meta)

            if changed > 0:
                ab_logger.debug("MsgProcessor: on_decorating_result changed_plain_segments=%s", changed)
        except Exception:
            ab_logger.exception("MsgProcessor: on_decorating_result 监听异常")
