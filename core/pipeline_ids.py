# -*- coding: utf-8 -*-
"""Pipeline 步骤 id 常量。"""
from __future__ import annotations

LOCATE_STEP_ID = "locate"


def is_locate_step(step_id: str | None) -> bool:
    return step_id == LOCATE_STEP_ID
