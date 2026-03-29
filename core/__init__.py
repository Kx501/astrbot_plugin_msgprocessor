# -*- coding: utf-8 -*-
"""
与 ApiDog 一致的核心逻辑包（目录名 ``core``）。

插件根目录另有 ``main.py`` / ``metadata.yaml``；运行时数据在 ``StarTools.get_data_dir(None)`` 下，与 ApiDog 相同为**扁平 JSON**（本插件使用 ``rules.json``、``config.json``）。
"""
from __future__ import annotations

from .engine import process_text
from .loader import load_rules_from_path

__all__ = ["process_text", "load_rules_from_path", "__version__"]

__version__ = "0.1.0"
