from types import SimpleNamespace

import pytest
from fastapi import Request, Response, HTTPException

from backend.python.api import auth


class _MockQuery:
    def __init__(self, data):
        self._data = data
        self.ilike_calls = []

    def select(self, *_args, **_kwargs):
        return self

    def ilike(self, key, value):
        self.ilike_calls.append((key, value))
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _MockSupabase:
    def __init__(self, data):
        self.query = _MockQuery(data)

    def schema(self, *_args, **_kwargs):
        return self

    def from_(self, *_args, **_kwargs):
        return self.query


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/check-email",
            "headers": [],
        }
    )


@pytest.mark.asyncio
async def test_check_email_normalizes_before_query(monkeypatch):
    fake = _MockSupabase(data=[{"id": "user-1"}])
    monkeypatch.setattr(auth, "supabase", fake)

    await auth.check_email_exists(
        request=_request(),
        response=Response(),
        body=auth.CheckEmailRequest(email="Known@Example.COM"),
    )

    assert ("email", "known@example.com") in fake.query.ilike_calls


@pytest.mark.asyncio
async def test_check_email_raises_422_for_unknown_email(monkeypatch):
    monkeypatch.setattr(auth, "supabase", _MockSupabase(data=[]))

    with pytest.raises(HTTPException) as exc:
        await auth.check_email_exists(
            request=_request(),
            response=Response(),
            body=auth.CheckEmailRequest(email="unknown@example.com"),
        )

    assert exc.value.status_code == 422
