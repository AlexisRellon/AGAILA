"""
Test Password Reset Audit Logging

Tests that password reset operations create audit log entries.
Follows TDD approach: write failing test, then implement fix.

Run with: docker-compose run backend pytest tests/python/test_password_reset_audit.py -v
"""

import pytest
import os
import sys
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'python'))


class TestPasswordResetAuditLogging:
    """Test password reset audit logging"""

    @pytest.mark.asyncio
    async def test_password_reset_creates_audit_log(self):
        """Test that password reset operation creates an audit log entry"""
        from backend.python.admin_api import reset_user_password
        from backend.python.middleware.rbac import UserContext, UserRole, UserStatus
        from fastapi import Request
        
        # Create mock request
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {
            "X-Forwarded-For": "192.168.1.100",
            "User-Agent": "TestClient/1.0"
        }
        mock_request.client.host = "192.168.1.100"
        
        # Create mock admin user
        admin_user = UserContext(
            user_id="admin-123",
            email="admin@test.com",
            role=UserRole.MASTER_ADMIN,
            status=UserStatus.ACTIVE,
            full_name="Test Admin"
        )
        
        # Create mock password reset request
        class MockPasswordResetRequest:
            new_password = "NewSecurePassword123!"
            event_type = "security_event"
            severity = "warning"
            status = "success"
        
        password_reset_request = MockPasswordResetRequest()
        
        # Mock Supabase responses
        mock_supabase_response = MagicMock()
        mock_supabase_response.data = [{
            "id": "user-456",
            "email": "testuser@test.com",
            "role": "lgu_responder",
            "status": "active"
        }]
        
        audit_log_inserted = []
        
        def mock_insert(data):
            """Capture audit log insertions"""
            audit_log_inserted.append(data)
            mock_response = MagicMock()
            mock_response.execute.return_value = MagicMock(data=[data])
            return mock_response
        
        with patch('backend.python.admin_api.supabase') as mock_supabase:
            # Mock user profile query
            mock_supabase.schema.return_value.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_supabase_response
            
            # Mock auth update
            mock_supabase.auth.admin.update_user_by_id = MagicMock()
            
            # Mock audit log insertion
            mock_audit_table = MagicMock()
            mock_audit_table.insert = mock_insert
            mock_supabase.schema.return_value.from_.return_value = mock_audit_table
            
            # Call the password reset endpoint
            result = await reset_user_password(
                user_id="user-456",
                password_reset=password_reset_request,
                request=mock_request,
                current_user=admin_user
            )
            
            # Verify the result
            assert result["message"] == "Password reset successfully for testuser@test.com"
            
            # Verify audit log was created
            assert len(audit_log_inserted) > 0, "No audit log entry was created"
            
            # Verify audit log contains expected fields (new schema)
            audit_entry = audit_log_inserted[0]
            assert "user_id" in audit_entry
            assert audit_entry["user_id"] == admin_user.user_id
            assert "user_email" in audit_entry
            assert audit_entry["user_email"] == admin_user.email
            assert "action" in audit_entry
            assert "password_reset" in audit_entry["action"].lower()
            assert "resource" in audit_entry
            assert "user-456" in audit_entry["resource"]  # resource_id in resource field
            assert "ip_address" in audit_entry
            assert audit_entry["ip_address"] == "192.168.1.100"
            assert "event_type" in audit_entry
            assert audit_entry["event_type"] == "security_event"
            assert "severity" in audit_entry
            assert audit_entry["severity"] == "warning"
            assert "message" in audit_entry
            assert "testuser@test.com" in audit_entry["message"].lower()
    
    @pytest.mark.asyncio
    async def test_password_reset_audit_log_includes_target_user(self):
        """Test that audit log includes information about the target user"""
        from backend.python.admin_api import reset_user_password
        from backend.python.middleware.rbac import UserContext, UserRole, UserStatus
        from fastapi import Request
        
        # Create mock request
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"
        
        # Create mock admin user
        admin_user = UserContext(
            user_id="admin-789",
            email="admin@test.com",
            role=UserRole.MASTER_ADMIN,
            status=UserStatus.ACTIVE
        )
        
        # Create mock password reset request
        class MockPasswordResetRequest:
            new_password = "NewPassword123!"
            event_type = "security_event"
            severity = "warning"
            status = "success"
        
        password_reset_request = MockPasswordResetRequest()
        
        # Mock Supabase responses
        mock_supabase_response = MagicMock()
        mock_supabase_response.data = [{
            "id": "target-user-999",
            "email": "targetuser@test.com",
            "role": "validator",
            "status": "active"
        }]
        
        audit_log_data = []
        
        def mock_insert(data):
            audit_log_data.append(data)
            mock_response = MagicMock()
            mock_response.execute.return_value = MagicMock(data=[data])
            return mock_response
        
        with patch('backend.python.admin_api.supabase') as mock_supabase:
            mock_supabase.schema.return_value.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_supabase_response
            mock_supabase.auth.admin.update_user_by_id = MagicMock()
            
            mock_audit_table = MagicMock()
            mock_audit_table.insert = mock_insert
            mock_supabase.schema.return_value.from_.return_value = mock_audit_table
            
            # Call password reset
            await reset_user_password(
                user_id="target-user-999",
                password_reset=password_reset_request,
                request=mock_request,
                current_user=admin_user
            )
            
            # Verify audit log contains target user info
            assert len(audit_log_data) > 0
            audit_entry = audit_log_data[0]
            
            # Check message includes target user email
            assert "message" in audit_entry
            assert "targetuser@test.com" in audit_entry["message"].lower()
            
            # Check metadata includes resource_id
            assert "metadata" in audit_entry
            assert "resource_id" in audit_entry["metadata"]
            assert audit_entry["metadata"]["resource_id"] == "target-user-999"
    
    @pytest.mark.asyncio
    async def test_password_reset_audit_log_severity_is_warning(self):
        """Test that password reset audit logs have WARNING severity"""
        from backend.python.admin_api import reset_user_password
        from backend.python.middleware.rbac import UserContext, UserRole, UserStatus
        from fastapi import Request
        
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"
        
        admin_user = UserContext(
            user_id="admin-001",
            email="admin@test.com",
            role=UserRole.MASTER_ADMIN,
            status=UserStatus.ACTIVE
        )
        
        class MockPasswordResetRequest:
            new_password = "NewPassword123!"
            event_type = "security_event"
            severity = "warning"
            status = "success"
        
        password_reset_request = MockPasswordResetRequest()
        
        mock_supabase_response = MagicMock()
        mock_supabase_response.data = [{
            "id": "user-001",
            "email": "user@test.com",
            "role": "citizen",
            "status": "active"
        }]
        
        captured_audit = []
        
        def mock_insert(data):
            captured_audit.append(data)
            mock_response = MagicMock()
            mock_response.execute.return_value = MagicMock(data=[data])
            return mock_response
        
        with patch('backend.python.admin_api.supabase') as mock_supabase:
            mock_supabase.schema.return_value.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_supabase_response
            mock_supabase.auth.admin.update_user_by_id = MagicMock()
            
            mock_audit_table = MagicMock()
            mock_audit_table.insert = mock_insert
            mock_supabase.schema.return_value.from_.return_value = mock_audit_table
            
            await reset_user_password(
                user_id="user-001",
                password_reset=password_reset_request,
                request=mock_request,
                current_user=admin_user
            )
            
            # Verify severity
            assert len(captured_audit) > 0
            audit_entry = captured_audit[0]
            assert "severity" in audit_entry
            assert audit_entry["severity"] == "warning"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
