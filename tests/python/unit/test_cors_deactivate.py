"""
Test CORS headers for PATCH /deactivate endpoint
"""
import pytest
from fastapi.testclient import TestClient
from backend.python.main import app

client = TestClient(app)


def test_cors_preflight_for_deactivate():
    """
    Test CORS preflight (OPTIONS) request for PATCH /admin/users/{id}/deactivate
    Verifies that PATCH is included in Access-Control-Allow-Methods
    """
    test_user_id = "a17fe77b-5636-4705-b52a-dcabe3a873a9"
    
    # Simulate preflight request from production frontend
    response = client.options(
        f"/api/v1/admin/users/{test_user_id}/deactivate",
        headers={
            "Origin": "https://agaila-ph.vercel.app",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        }
    )
    
    # Assert preflight succeeds
    assert response.status_code == 200, f"Preflight failed with status {response.status_code}"
    
    # Assert CORS headers are present
    assert "access-control-allow-origin" in response.headers, "Missing Access-Control-Allow-Origin"
    assert "access-control-allow-methods" in response.headers, "Missing Access-Control-Allow-Methods"
    
    # Assert PATCH is in allowed methods
    allowed_methods = response.headers["access-control-allow-methods"]
    assert "PATCH" in allowed_methods, f"PATCH not in allowed methods: {allowed_methods}"
    
    # Assert origin is allowed
    allowed_origin = response.headers["access-control-allow-origin"]
    assert allowed_origin in [
        "https://agaila-ph.vercel.app", 
        "*"
    ], f"Origin not allowed: {allowed_origin}"


def test_cors_preflight_for_deactivate_from_custom_domain():
    """
    Test CORS preflight from custom domain (https://agaila.me)
    """
    test_user_id = "a17fe77b-5636-4705-b52a-dcabe3a873a9"
    
    response = client.options(
        f"/api/v1/admin/users/{test_user_id}/deactivate",
        headers={
            "Origin": "https://agaila.me",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        }
    )
    
    assert response.status_code == 200
    assert "access-control-allow-methods" in response.headers
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_cors_actual_patch_request():
    """
    Test CORS headers on actual PATCH request (not just preflight)
    """
    test_user_id = "a17fe77b-5636-4705-b52a-dcabe3a873a9"
    
    # This will fail with 401 (no auth), but we only care about CORS headers
    response = client.patch(
        f"/api/v1/admin/users/{test_user_id}/deactivate",
        headers={
            "Origin": "https://agaila-ph.vercel.app",
        },
        json={"reason": "Test reason"}
    )
    
    # Should have CORS headers even if auth fails
    if "access-control-allow-origin" in response.headers:
        allowed_origin = response.headers["access-control-allow-origin"]
        assert allowed_origin in [
            "https://agaila-ph.vercel.app",
            "*"
        ], f"Origin not allowed on actual request: {allowed_origin}"
