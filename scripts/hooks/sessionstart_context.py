#!/usr/bin/env python3
"""Inject project-specific working context at session start."""

from __future__ import annotations

import json
import sys


PROJECT_CONTEXT = (
    "AGAILA policy: Development is container-first. "
    "Use Docker Compose service names (not localhost) for inter-service networking. "
    "Run backend/frontend tests inside containers where possible, and prefer "
    "project scripts under scripts/ for repeatable workflows."
)


def main() -> int:
    # Read stdin to remain compatible with hook input contract.
    _ = sys.stdin.read()
    payload = {
        "continue": True,
        "systemMessage": PROJECT_CONTEXT,
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
