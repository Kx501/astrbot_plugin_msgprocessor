# -*- coding: utf-8 -*-
"""AstrBot 入口：插件类须位于 main.py。仅处理待发消息纯文本。"""

from __future__ import annotations

import asyncio
import json
import shutil
import threading
from pathlib import Path
from typing import Any

import uvicorn
from astrbot.api import logger as ab_logger
from astrbot.api.event import AstrMessageEvent, MessageChain, filter
from astrbot.api.message_components import Plain
from astrbot.api.star import Context, Star, StarTools

from .core.config import build_config, parse_delay_policy
from .core.engine import process_message_async
from .core.loader import load_rules_from_path
from .core.modules import translate_llm_fallback
from .core.outbound import plain_char_count, send_follow_ups
from .core.server import create_app

_ROOT = Path(__file__).resolve().parent
_SAMPLE_RULES = _ROOT / "sample_rules.json"
_WEB_DIST = _ROOT / "web" / "dist"

_send_patched = False
_star_ref: Any = None
_EXTRA_PENDING = "_mp_pending_batches"


def _llm_provider(cfg: dict[str, Any]) -> tuple[bool, str | None]:
    raw = cfg.get("translate_llm", "default")
    s = "" if raw is None else str(raw).strip()
    if not s:
        return False, None
    if s.lower() == "default":
        return True, None
    return True, s


def _translate_prompt(instruction: str, text: str) -> str:
    head = (instruction or "").strip()
    if not head:
        head = "请将以下文本翻译成中文，只输出译文，不要解释。"
    return f"{head}\n\n{text}"


def _plain_nonempty(comp: Any) -> bool:
    text = getattr(comp, "text", None)
    return isinstance(text, str) and bool(text.strip())


def _has_content(batch: list[Any]) -> bool:
    for comp in batch:
        if _plain_nonempty(comp):
            return True
        if getattr(comp, "text", None) is None:
            return True
    return False


def _plain(comp: Any, text: str) -> Any:
    try:
        return type(comp)(text)
    except Exception:
        return Plain(text)


def _preview(s: Any, max_len: int = 120) -> str:
    text = "" if s is None else str(s)
    text = text.replace("\n", "\\n")
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _patch_send(star: Any) -> None:
    global _send_patched, _star_ref
    _star_ref = star
    if _send_patched:
        return
    _send_patched = True
    orig = Context.send_message

    async def wrapped(self_ctx: Any, session: Any, message_chain: Any) -> bool:
        ref = _star_ref
        if ref is None or not ref._cfg.get("process_messages", True):
            return await orig(self_ctx, session, message_chain)
        chain = getattr(message_chain, "chain", None)
        if not isinstance(chain, list) or not chain:
            return await orig(self_ctx, session, message_chain)
        try:
            umo = session if isinstance(session, str) else str(session)
            doc = ref._rules_doc()
            meta = {"translate_llm": ref._translate_llm(None, proactive_umo=umo)}
            first, rest, dropped = await ref._split_chain(chain, doc, meta)
            if dropped:
                return True
            chain[:] = first
            if not chain:
                return True
            ok = await orig(self_ctx, session, message_chain)
            delay = parse_delay_policy(ref._cfg)

            async def send_one(batch: list[Any]) -> None:
                await orig(self_ctx, session, MessageChain(batch))

            await send_follow_ups(
                rest,
                send_one=send_one,
                delay=delay,
                char_count=plain_char_count,
                has_content=_has_content,
            )
            return ok
        except Exception:
            ab_logger.exception("MsgProcessor: send_message patch 异常")
        return await orig(self_ctx, session, message_chain)

    Context.send_message = wrapped  # type: ignore[method-assign]
    Context._mp_send_message_orig = orig  # type: ignore[attr-defined]


def _unpatch_send() -> None:
    global _send_patched, _star_ref
    _star_ref = None
    orig = getattr(Context, "_mp_send_message_orig", None)
    if orig is not None:
        Context.send_message = orig  # type: ignore[method-assign]
        delattr(Context, "_mp_send_message_orig")
    _send_patched = False


class MsgProcessorStar(Star):
    def __init__(self, context: Context, config: Any = None) -> None:
        super().__init__(context)
        self._data_dir = Path(StarTools.get_data_dir(None))
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._rules_path = self._data_dir / "rules.json"
        self._init_rules()
        self._cfg = build_config(
            self._data_dir,
            config,
            on_error=lambda _e: ab_logger.exception("MsgProcessor: 读取 config.json 失败"),
        )
        self._rules_mtime: float | None = None
        self._rules_cache: dict[str, Any] | None = None
        self._uvicorn_server: uvicorn.Server | None = None
        self._uvicorn_thread: threading.Thread | None = None
        if self._cfg.get("web_enabled", True):
            self._start_web()
        _patch_send(self)

    def _init_rules(self) -> None:
        if self._rules_path.is_file():
            return
        if _SAMPLE_RULES.is_file():
            shutil.copy2(_SAMPLE_RULES, self._rules_path)
            ab_logger.info("MsgProcessor: 已从 sample_rules.json 初始化 %s", self._rules_path)
        else:
            stub = {"schema_version": 4, "rules": []}
            with open(self._rules_path, "w", encoding="utf-8") as f:
                json.dump(stub, f, ensure_ascii=False, indent=2)

    def _rules_doc(self) -> dict[str, Any]:
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

    def _start_web(self) -> None:
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
            ab_logger.exception("MsgProcessor: Web 启动失败")

    async def terminate(self) -> None:
        if self._uvicorn_server is not None:
            self._uvicorn_server.should_exit = True
            th = self._uvicorn_thread
            if th is not None and th.is_alive():
                await asyncio.to_thread(th.join, 3.0)
        ab_logger.info("MsgProcessor 已停止")
        _unpatch_send()

    async def _split_chain(
        self,
        chain: list[Any],
        doc: dict[str, Any],
        meta: dict[str, Any],
    ) -> tuple[list[Any], list[list[Any]], bool]:
        batches: list[list[Any]] = [[]]

        for comp in chain:
            text = getattr(comp, "text", None)
            if not isinstance(text, str) or text == "":
                batches[-1].append(comp)
                continue

            result = await process_message_async(doc, text, meta=meta)
            if result.dropped or not result.segments:
                continue

            texts = [s.text for s in result.segments]
            if len(texts) > 1:
                for idx, part in enumerate(texts):
                    new_comp = _plain(comp, part)
                    if idx == 0:
                        batches[-1].append(new_comp)
                    else:
                        batches.append([new_comp])
                continue

            out = texts[0]
            if out != text:
                try:
                    setattr(comp, "text", out)
                except Exception:
                    comp = _plain(comp, out)
            batches[-1].append(comp)

        if not batches:
            return [], [], True
        first = batches[0]
        rest = batches[1:]
        while first and not _has_content(first) and rest:
            first = rest.pop(0)
        rest = [b for b in rest if _has_content(b)]
        if not _has_content(first):
            return [], [], True
        return first, rest, False

    def _translate_llm(
        self,
        event: AstrMessageEvent | None = None,
        *,
        proactive_umo: str | None = None,
    ):
        cfg = self._cfg
        ctx = self.context

        async def translate(text: str, scfg: dict[str, Any], _pctx: Any, _hit: Any) -> str:
            use_llm, fixed_provider = _llm_provider(cfg)
            if not use_llm:
                return translate_llm_fallback(text, scfg)
            prompt = _translate_prompt(str(cfg.get("llm_translate_prompt") or ""), text)
            try:
                if fixed_provider is None:
                    if proactive_umo is not None:
                        umo = proactive_umo
                    elif event is not None:
                        umo = event.unified_msg_origin
                    else:
                        return translate_llm_fallback(text, scfg)
                    pid = await ctx.get_current_chat_provider_id(umo=umo)
                else:
                    pid = fixed_provider
                resp = await ctx.llm_generate(chat_provider_id=pid, prompt=prompt)
                out = (getattr(resp, "completion_text", None) or "").strip()
                return out if out else translate_llm_fallback(text, scfg)
            except Exception:
                ab_logger.exception("MsgProcessor: AI翻译失败")
                return translate_llm_fallback(text, scfg)

        return translate

    @filter.on_llm_response()
    async def on_llm_response(self, event: AstrMessageEvent, resp: Any) -> None:
        try:
            out = getattr(resp, "completion_text", None)
            ab_logger.debug("MsgProcessor: on_llm_response preview=%s", _preview(out))
        except Exception:
            ab_logger.exception("MsgProcessor: on_llm_response 异常")

    @filter.on_decorating_result()
    async def on_decorating_result(self, event: AstrMessageEvent) -> None:
        try:
            result = event.get_result()
            chain = getattr(result, "chain", None)
            if not isinstance(chain, list) or not chain:
                return
            if not self._cfg.get("process_messages", True):
                return

            doc = self._rules_doc()
            meta = {"translate_llm": self._translate_llm(event)}
            first, rest, dropped = await self._split_chain(chain, doc, meta)
            if dropped:
                chain.clear()
                return
            chain[:] = first
            if rest:
                event.set_extra(_EXTRA_PENDING, rest)
                ab_logger.debug(
                    "MsgProcessor: split %s messages (1 now + %s follow-up)",
                    len(rest) + 1,
                    len(rest),
                )
        except Exception:
            ab_logger.exception("MsgProcessor: on_decorating_result 异常")

    @filter.after_message_sent()
    async def on_after_sent(self, event: AstrMessageEvent) -> None:
        pending = event.get_extra(_EXTRA_PENDING)
        if not pending:
            return
        event.set_extra(_EXTRA_PENDING, None)
        if not isinstance(pending, list):
            return
        delay = parse_delay_policy(self._cfg)

        async def send_one(batch: list[Any]) -> None:
            try:
                await event.send(MessageChain(batch))
            except Exception:
                ab_logger.exception("MsgProcessor: 发送拆分消息失败")

        await send_follow_ups(
            pending,
            send_one=send_one,
            delay=delay,
            char_count=plain_char_count,
            has_content=lambda b: isinstance(b, list) and _has_content(b),
        )
