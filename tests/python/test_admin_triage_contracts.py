import os
import sys
from types import SimpleNamespace

import pytest

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend", "python"))

from backend.python import admin_api  # noqa: E402


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, data):
        self._data = data
        self.eq_calls = []
        self.is_calls = []

    def select(self, *_args, **_kwargs):
        return self

    def is_(self, key, value):
        self.is_calls.append((key, value))
        return self

    def eq(self, key, value):
        self.eq_calls.append((key, value))
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def ilike(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def execute(self):
        filtered = self._data
        for key, value in self.eq_calls:
            filtered = [row for row in filtered if row.get(key) == value]
        for key, value in self.is_calls:
            if value is None:
                filtered = [row for row in filtered if row.get(key) is None]
        return _FakeResponse(filtered)


class _FakeSupabase:
    def __init__(self, data):
        self.query = _FakeQuery(data)

    def schema(self, *_args, **_kwargs):
        return self

    def from_(self, *_args, **_kwargs):
        return self.query


@pytest.mark.asyncio
async def test_triage_rejected_status_does_not_force_validated_by_null(monkeypatch):
    reports = [
        {
            "id": "1",
            "tracking_id": "TR-001",
            "status": "rejected",
            "validated_by": "admin-1",
            "submitted_at": "2026-01-01T00:00:00Z",
            "description": "report",
            "image_url": None,
        }
    ]

    fake_supabase = _FakeSupabase(reports)
    monkeypatch.setattr(admin_api, "supabase", fake_supabase)
    monkeypatch.setattr(admin_api, "decrypt_pii_fields", lambda row: row)

    result = await admin_api.get_triage_queue(
        status_filter="rejected",
        hazard_type=None,
        min_confidence=None,
        max_confidence=None,
        limit=50,
        offset=0,
        current_user=SimpleNamespace(email="validator@example.com"),
    )

    assert len(result) == 1
    assert ("status", "rejected") in fake_supabase.query.eq_calls
    assert ("validated_by", None) not in fake_supabase.query.is_calls


@pytest.mark.asyncio
async def test_triage_unverified_still_filters_validated_by_null(monkeypatch):
    reports = [
        {
            "id": "2",
            "tracking_id": "TR-002",
            "status": "unverified",
            "validated_by": None,
            "submitted_at": "2026-01-01T00:00:00Z",
            "description": "report",
            "image_url": None,
        }
    ]

    fake_supabase = _FakeSupabase(reports)
    monkeypatch.setattr(admin_api, "supabase", fake_supabase)
    monkeypatch.setattr(admin_api, "decrypt_pii_fields", lambda row: row)

    await admin_api.get_triage_queue(
        status_filter="unverified",
        hazard_type=None,
        min_confidence=None,
        max_confidence=None,
        limit=50,
        offset=0,
        current_user=SimpleNamespace(email="validator@example.com"),
    )

    assert ("validated_by", None) in fake_supabase.query.is_calls


@pytest.mark.asyncio
async def test_audit_logs_accepts_event_filter_alias(monkeypatch):
    fake_supabase = _FakeSupabase(
        [
            {
                "id": "a1",
                "action": "report_rejected",
                "user_role": "validator",
                "old_values": {},
                "new_values": {},
                "success": True,
                "created_at": "2026-01-01T00:00:00Z",
                "severity": "INFO",
                "status": "success",
            }
        ]
    )
    monkeypatch.setattr(admin_api, "supabase", fake_supabase)

    await admin_api.get_audit_logs(
        user_email=None,
        event="report_rejected",
        action=None,
        resource_type=None,
        start_date=None,
        end_date=None,
        success=None,
        limit=100,
        offset=0,
        current_user=SimpleNamespace(email="validator@example.com"),
    )

    assert ("action", "report_rejected") in fake_supabase.query.eq_calls
