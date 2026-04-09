#!/usr/bin/env python3
"""Emit a concise end-of-session checklist with repository context."""

from __future__ import annotations

import json
import subprocess
import sys


def _run_git(args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return ""
    return result.stdout.strip()


def _count_changed_files() -> int:
    raw = _run_git(["status", "--porcelain"])
    if not raw:
        return 0
    return len([line for line in raw.splitlines() if line.strip()])


def main() -> int:
    _ = sys.stdin.read()
    branch = _run_git(["branch", "--show-current"]) or "unknown"
    changed_count = _count_changed_files()

    message = (
        "Session checklist: "
        f"branch={branch}, pending_files={changed_count}. "
        "Confirm tests were run for impacted areas, ensure commit messages are conventional, "
        "and avoid force-push to keep remote history clean."
    )
    print(json.dumps({"continue": True, "systemMessage": message}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
