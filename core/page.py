"""AstrBot Pages API for rule editing and isolated previews."""

from pathlib import Path
from typing import Any, Literal

from astrbot.api import logger
from astrbot.api.star import Context
from astrbot.api.web import error_response, json_response, request
from pydantic import BaseModel, Field, ValidationError

from .engine import process_message
from .injection import InjectionContext, process_request, validate_request_rules
from .loader import load_rules_from_path


class RulesDocument(BaseModel):
    schema_version: int = 6
    rules: list[dict[str, Any]]


class ProcessBody(BaseModel):
    message: str = Field(max_length=2_000_000)
    rules: RulesDocument | None = None
    rule_ids: list[str] | None = None
    target: Literal["outbound", "llm_request"] = "outbound"
    system_prompt: str = ""
    context: dict[str, str] = Field(default_factory=dict)
    daily_dates: dict[str, str] = Field(default_factory=dict)


class PageAPI:
    """Expose the plugin's rules file through authenticated Dashboard routes."""

    def __init__(self, context: Context, rules_path: Path) -> None:
        self.rules_path = rules_path
        for endpoint, handler, methods, description in (
            ("rules", self.get_rules, ["GET"], "Read message processor rules"),
            ("rules/save", self.save_rules, ["POST"], "Save message processor rules"),
            ("process", self.preview, ["POST"], "Preview message processor rules"),
        ):
            context.register_web_api(
                f"/astrbot_plugin_msgprocessor/{endpoint}", handler, methods, description
            )

    async def get_rules(self):
        """Read the existing plugin data file.

        Returns:
            Rules JSON, or an error response if the file cannot be read.
        """
        try:
            return json_response(load_rules_from_path(self.rules_path))
        except (OSError, ValueError):
            logger.exception("MsgProcessor: could not read rules")
            return error_response("无法读取规则文件", status_code=500)

    async def save_rules(self):
        """Validate and atomically replace the fixed rules file.

        Returns:
            The saved filename or an input/storage error response.
        """
        try:
            body = RulesDocument.model_validate(await request.json(default={}))
            doc = body.model_dump()
            validate_request_rules(doc)
        except (ValidationError, ValueError, TypeError) as exc:
            return error_response(str(exc), status_code=400)
        try:
            temporary = self.rules_path.with_suffix(".json.tmp")
            temporary.write_text(body.model_dump_json(indent=2), encoding="utf-8")
            temporary.replace(self.rules_path)
        except OSError:
            logger.exception("MsgProcessor: could not save rules")
            return error_response("无法保存规则文件", status_code=500)
        return json_response({"saved": self.rules_path.name})

    async def preview(self):
        """Preview rules without changing live conversation or daily state.

        Returns:
            Outgoing segments or modified request fields and preview counters.
        """
        try:
            body = ProcessBody.model_validate(await request.json(default={}))
            doc = (
                body.rules.model_dump() if body.rules is not None
                else load_rules_from_path(self.rules_path)
            )
            validate_request_rules(doc)
            if body.target == "llm_request":
                context = InjectionContext(**{
                    key: value for key, value in body.context.items()
                    if key in InjectionContext.__dataclass_fields__
                })
                result = process_request(
                    doc, body.message, body.system_prompt, context,
                    daily_dates=body.daily_dates, rule_ids=body.rule_ids,
                )
                return json_response({
                    "schema_version": 1,
                    "input": body.message,
                    "segments": [{"type": "plain", "text": result.prompt}],
                    "effects": [],
                    "dropped": False,
                    "unchanged": not result.blocks,
                    "output": result.prompt,
                    "request": {
                        "prompt": result.prompt,
                        "system_prompt": result.system_prompt,
                        "parts": result.parts,
                        "blocks": result.blocks,
                        "daily_dates": result.daily_dates,
                    },
                })
            result = process_message(doc, body.message, rule_ids=body.rule_ids)
            return json_response(result.to_api_dict())
        except (ValidationError, ValueError, TypeError) as exc:
            return error_response(str(exc), status_code=400)
        except Exception:
            logger.exception("MsgProcessor: preview failed")
            return error_response("规则预览失败，请检查规则配置和插件日志", status_code=500)
