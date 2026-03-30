# -*- coding: utf-8 -*-
"""HTTP API；静态页需先在前端目录执行 ``npm run build``。"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .engine import process_text

_PKG = Path(__file__).resolve().parent
_REPO_ROOT = _PKG.parent
_SAMPLE_RULES = _REPO_ROOT / "sample_rules.json"
_DEFAULT_DATA_DIR = _REPO_ROOT / "data"
_DEFAULT_WEB_DIST = _REPO_ROOT / "web" / "dist"


class ProcessBody(BaseModel):
    message: str = Field(..., min_length=0, max_length=2_000_000)
    rules: dict | None = None


class RulesDocument(BaseModel):
    schema_version: int = 4
    rules: list


def _load_sample_rules() -> dict:
    if not _SAMPLE_RULES.is_file():
        raise HTTPException(404, "missing sample_rules.json in repo root")
    with open(_SAMPLE_RULES, "r", encoding="utf-8") as f:
        return json.load(f)


def create_app(
    *,
    data_dir: Path | None = None,
    web_dist: Path | None = None,
) -> FastAPI:
    """
    :param data_dir: 与 ApiDog 相同：插件/独立运行时的**数据根目录**，其下为 ``rules.json``、``config.json`` 等。
    :param web_dist: 前端构建输出，默认 ``<仓库根>/web/dist``。
    """
    dd = (data_dir if data_dir is not None else _DEFAULT_DATA_DIR).resolve()
    wd = (web_dist if web_dist is not None else _DEFAULT_WEB_DIST).resolve()
    dd.mkdir(parents=True, exist_ok=True)

    def _read_rules_json(name: str) -> dict:
        base = Path(name).name
        fname2 = base if base.endswith(".json") else f"{base}.json"
        p = (dd / fname2).resolve()
        if p.is_file() and p.parent == dd:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        if fname2 == "rules.json":
            return _load_sample_rules()
        raise HTTPException(404, f"missing {fname2}")

    app = FastAPI(title="MsgProcessor API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/rules/{name}")
    def get_rules(name: str) -> dict:
        return _read_rules_json(name)

    @app.post("/api/rules/{name}")
    def save_rules(name: str, body: RulesDocument) -> dict:
        base = Path(name).name
        fname = base if base.endswith(".json") else f"{base}.json"
        path = (dd / fname).resolve()
        if path.parent != dd:
            raise HTTPException(400, "invalid name")
        dd.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(body.model_dump(), f, ensure_ascii=False, indent=2)
        return {"saved": fname}

    @app.post("/api/process")
    def process(body: ProcessBody) -> dict:
        try:
            if body.rules is not None:
                doc = body.rules
            else:
                doc = _read_rules_json("rules.json")
            out = process_text(doc, body.message, meta={})
        except HTTPException:
            raise
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"invalid json: {e}") from e
        except Exception as e:
            raise HTTPException(400, str(e)) from e
        return {"output": out}

    if wd.is_dir() and (wd / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=wd / "assets"), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str):
            if full_path.startswith("api"):
                raise HTTPException(404)
            safe = (wd / full_path).resolve()
            if not str(safe).startswith(str(wd.resolve())):
                raise HTTPException(404)
            if safe.is_file():
                return FileResponse(safe)
            return FileResponse(wd / "index.html")

    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run(
        "core.server:app",
        host="127.0.0.1",
        port=5878,
        reload=False,
    )


if __name__ == "__main__":
    main()
