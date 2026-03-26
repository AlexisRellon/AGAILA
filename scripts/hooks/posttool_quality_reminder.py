#!/usr/bin/env python3
"""Emit lightweight quality reminders after write-like tool usage."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import re
import sys
from typing import Any


WRITE_TOOL_HINTS = {
    "apply_patch",
    "create_file",
    "edit_notebook_file",
    "mcp_supabase_apply_migration",
}

TEST_STAMP_PATH = Path(".git/copilot-hook-test-stamp.json")
BACKEND_TEST_PATTERN = re.compile(
    r"(docker(?:-compose|\s+compose)\s+run\s+backend\s+pytest|\bpytest\b)",
    re.IGNORECASE,
)
FRONTEND_TEST_PATTERN = re.compile(
    r"(docker(?:-compose|\s+compose)\s+run\s+frontend\s+npm\s+test|\bnpm\s+test\b)",
    re.IGNORECASE,
)


def _safe_json_load(text: str) -> dict[str, Any]:
    if not text.strip():
        return {}
    try:
        loaded = json.loads(text)
        if isinstance(loaded, dict):
            return loaded
    except json.JSONDecodeError:
        pass
    return {}


def _find_tool_name(payload: Any) -> str:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in {"toolName", "tool_name", "name"} and isinstance(value, str):
                return value
            nested = _find_tool_name(value)
            if nested:
                return nested
    elif isinstance(payload, list):
        for item in payload:
            nested = _find_tool_name(item)
            if nested:
                return nested
    return ""


def _find_value(payload: Any, keys: set[str]) -> str:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in keys and isinstance(value, (str, int, float)):
                return str(value)
            nested = _find_value(value, keys)
            if nested:
                return nested
    elif isinstance(payload, list):
        for item in payload:
            nested = _find_value(item, keys)
            if nested:
                return nested
    return ""


def _update_test_stamp(command_text: str) -> None:
    matched_suites: list[str] = []
    if BACKEND_TEST_PATTERN.search(command_text):
        matched_suites.append("backend")
    if FRONTEND_TEST_PATTERN.search(command_text):
        matched_suites.append("frontend")
    if not matched_suites:
        return

    stamp: dict[str, Any] = {}
    if TEST_STAMP_PATH.exists():
        try:
            loaded = json.loads(TEST_STAMP_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                stamp = loaded
        except (OSError, json.JSONDecodeError):
            stamp = {}

    ts = datetime.now(timezone.utc).isoformat()
    for suite in matched_suites:
        stamp[suite] = {
            "timestamp": ts,
            "command": command_text,
        }

    TEST_STAMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEST_STAMP_PATH.write_text(json.dumps(stamp, indent=2), encoding="utf-8")


def main() -> int:
    payload = _safe_json_load(sys.stdin.read())
    tool_name = _find_tool_name(payload).strip()
    command = _find_value(payload, {"command"})

    if tool_name == "run_in_terminal" and command:
        _update_test_stamp(command)

    if tool_name in WRITE_TOOL_HINTS:
        print(
            json.dumps(
                {
                    "continue": True,
                    "systemMessage": (
                        "Code or schema changes detected. Verify with containerized tests "
                        "(backend: docker-compose run backend pytest, frontend: "
                        "docker-compose run frontend npm test) when relevant."
                    ),
                }
            )
        )
        return 0

    print(json.dumps({"continue": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
