#!/usr/bin/env python3
"""Enforce basic safety policies for risky tool invocations."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


BLOCK_PATTERNS = [
    re.compile(r"\bgit\s+reset\s+--hard\b", re.IGNORECASE),
    re.compile(r"\bgit\s+checkout\s+--\b", re.IGNORECASE),
    re.compile(r"\brm\s+-rf\s+(/|\\*|\.)", re.IGNORECASE),
    re.compile(r"\bremove-item\b.*\b-recurse\b.*\b-force\b", re.IGNORECASE),
]

ASK_PATTERNS = [
    re.compile(r"\bdocker(?:-compose|\s+compose)\s+down\b.*(?:-v|--volumes)", re.IGNORECASE),
    re.compile(r"\bdrop\s+table\b", re.IGNORECASE),
    re.compile(r"\btruncate\s+table\b", re.IGNORECASE),
]

BRANCH_CREATE_PATTERN = re.compile(
    r"\bgit\s+(?:checkout\s+-b|switch\s+-c)\s+([^\s]+)", re.IGNORECASE
)
COMMIT_WITH_MESSAGE_PATTERN = re.compile(
    r"\bgit\s+commit\b.*?\s-m\s+(?:\"([^\"]+)\"|'([^']+)'|([^\s]+))",
    re.IGNORECASE,
)
FORCE_PUSH_PATTERN = re.compile(
    r"\bgit\s+push\b[^\n\r]*(?:--force-with-lease|--force|\s-f(?:\s|$))",
    re.IGNORECASE,
)
CONVENTIONAL_COMMIT_PATTERN = re.compile(
    r"^(feat|fix|chore|test|docs|refactor|perf|build|ci|style|revert)(\([^)]+\))?:\s.+"
)
TEST_STAMP_PATH = Path(".git/copilot-hook-test-stamp.json")
CRITICAL_PATH_PREFIXES = {
    "backend/python/": "backend",
    "frontend/src/": "frontend",
}
TEST_STAMP_MAX_AGE = timedelta(hours=8)


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


def _find_value(payload: Any, keys: set[str]) -> str:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in keys and isinstance(value, (str, int, float)):
                return str(value)
            found = _find_value(value, keys)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _find_value(item, keys)
            if found:
                return found
    return ""


def _serialize_compact(value: Any) -> str:
    try:
        return json.dumps(value, separators=(",", ":"), ensure_ascii=True)
    except TypeError:
        return str(value)


def _decision_json(decision: str, reason: str) -> str:
    return json.dumps(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": decision,
                "permissionDecisionReason": reason,
            }
        }
    )


def _current_branch() -> str:
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.stdout.strip()
    except OSError:
        return ""


def _extract_commit_message(command_text: str) -> str:
    match = COMMIT_WITH_MESSAGE_PATTERN.search(command_text)
    if not match:
        return ""
    return (match.group(1) or match.group(2) or match.group(3) or "").strip()


def _changed_files() -> list[str]:
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return []

    files: list[str] = []
    for raw_line in result.stdout.splitlines():
        line = raw_line.rstrip()
        if len(line) < 4:
            continue
        path_part = line[3:].strip()
        if " -> " in path_part:
            path_part = path_part.split(" -> ", 1)[1].strip()
        if path_part:
            files.append(path_part.replace("\\", "/"))
    return files


def _required_test_suites(files: list[str]) -> set[str]:
    required: set[str] = set()
    for file_path in files:
        for prefix, suite in CRITICAL_PATH_PREFIXES.items():
            if file_path.startswith(prefix):
                required.add(suite)
    return required


def _load_test_stamp() -> dict[str, Any]:
    if not TEST_STAMP_PATH.exists():
        return {}
    try:
        loaded = json.loads(TEST_STAMP_PATH.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            return loaded
    except (OSError, json.JSONDecodeError):
        return {}
    return {}


def _has_recent_test_evidence(required_suites: set[str]) -> tuple[bool, str]:
    if not required_suites:
        return True, "No critical-path changes require test evidence."

    stamp = _load_test_stamp()
    now = datetime.now(timezone.utc)
    missing: list[str] = []

    for suite in sorted(required_suites):
        suite_data = stamp.get(suite)
        if not isinstance(suite_data, dict):
            missing.append(suite)
            continue
        timestamp_text = suite_data.get("timestamp")
        if not isinstance(timestamp_text, str):
            missing.append(suite)
            continue
        try:
            ts = datetime.fromisoformat(timestamp_text)
        except ValueError:
            missing.append(suite)
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if now - ts > TEST_STAMP_MAX_AGE:
            missing.append(suite)

    if not missing:
        return True, "Recent test evidence is present for critical-path changes."

    hints = {
        "backend": "docker-compose run backend pytest tests/python/",
        "frontend": "docker-compose run frontend npm test",
    }
    commands = "; ".join([hints[suite] for suite in missing if suite in hints])
    return (
        False,
        "Missing recent test evidence for: "
        f"{', '.join(missing)}. Run: {commands}",
    )


def _evaluate_git_policy(command_text: str, haystack: str) -> tuple[str, str, int] | None:
    is_commit = bool(re.search(r"\bgit\s+commit\b", command_text, flags=re.IGNORECASE))
    is_push = bool(re.search(r"\bgit\s+push\b", command_text, flags=re.IGNORECASE))

    if FORCE_PUSH_PATTERN.search(command_text):
        return (
            "deny",
            "Force push is blocked. Rebase is local-only; do not rewrite remote history.",
            2,
        )

    if BRANCH_CREATE_PATTERN.search(command_text):
        current_branch = _current_branch()
        if current_branch and current_branch != "main":
            return (
                "deny",
                "Create new branches from main only. Switch to main before branch creation.",
                2,
            )

    if is_commit:
        current_branch = _current_branch()
        if current_branch == "main":
            return (
                "deny",
                "Direct commits to main are blocked. Create a new branch from main first.",
                2,
            )

        commit_message = _extract_commit_message(command_text)
        if not commit_message:
            return (
                "ask",
                "Commit message could not be validated. Use conventional format like feat(scope): summary.",
                0,
            )
        if not CONVENTIONAL_COMMIT_PATTERN.match(commit_message):
            return (
                "deny",
                "Commit message must follow conventional format: type(scope): summary.",
                2,
            )

    if is_commit or is_push:
        required = _required_test_suites(_changed_files())
        has_evidence, reason = _has_recent_test_evidence(required)
        if not has_evidence:
            return ("ask", reason, 0)

    if re.search(r"\bgit\s+rebase\b", haystack, flags=re.IGNORECASE):
        return (
            "allow",
            "Local rebase detected and allowed.",
            0,
        )

    return None


def main() -> int:
    payload = _safe_json_load(sys.stdin.read())
    tool_name = _find_value(payload, {"toolName", "tool_name", "name"}).lower()
    command = _find_value(payload, {"command"})
    raw_input = _find_value(payload, {"input", "arguments", "params", "toolInput"})
    haystack = " ".join(
        [tool_name, command, raw_input, _serialize_compact(payload)]
    ).strip()

    if not haystack:
        print(_decision_json("allow", "No actionable command content found."))
        return 0

    for pattern in BLOCK_PATTERNS:
        if pattern.search(haystack):
            print(
                _decision_json(
                    "deny",
                    "Blocked by workspace hook: potentially destructive command detected.",
                )
            )
            return 2

    policy_result = _evaluate_git_policy(command, haystack)
    if policy_result is not None:
        decision, reason, exit_code = policy_result
        print(_decision_json(decision, reason))
        return exit_code

    for pattern in ASK_PATTERNS:
        if pattern.search(haystack):
            print(
                _decision_json(
                    "ask",
                    "Risky operation detected. Explicit confirmation is required.",
                )
            )
            return 0

    print(_decision_json("allow", "Command passed safety checks."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
