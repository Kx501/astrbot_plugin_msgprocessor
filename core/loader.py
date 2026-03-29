# -*- coding: utf-8 -*-
"""规则 JSON 加载。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_rules_from_path(path: Path | str) -> dict[str, Any]:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(p)
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)
