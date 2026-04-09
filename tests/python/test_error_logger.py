"""
Unit tests for System Error Logger (AC-06)

Tests error logging functionality including:
- Unhandled exception logging
- Silent bug logging
- Database error logging
- Model error logging
- System crash logging
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime

from backend.python.middleware.error_logger import (
    SystemErrorLogger,
    ErrorCategory,
    ErrorSource,
    ErrorStatus
)


class TestSystemErrorLogger:
    """Test suite for SystemErrorLogger utility"""

    @pytest.mark.asyncio
    async def test_log_unhandled_exception(self):
        """Test logging an unhandled exception"""
        # Create test exception
        test_exception = ValueError("Test exception for logging")

        # Mock supabase client
        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            # Log the exception
            result = await SystemErrorLogger.log_unhandled_exception(
                exception=test_exception,
                source=ErrorSource.BACKEND_PYTHON,
                context={"test": True}
            )

            # Verify result
            assert result is True

            # Verify supabase was called
            mock_supabase.schema.assert_called_with("gaia")

    @pytest.mark.asyncio
    async def test_log_silent_bug(self):
        """Test logging a silent bug (logic error without exception)"""
        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_silent_bug(
                source=ErrorSource.AI_CLASSIFIER,
                description="Invalid confidence score detected",
                context={"score": -0.5},
                error_code="INVALID_SCORE"
            )

            assert result is True
            mock_supabase.schema.assert_called_with("gaia")

    @pytest.mark.asyncio
    async def test_log_database_error(self):
        """Test logging a database error"""
        db_error = Exception("Connection timeout")

        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_database_error(
                error=db_error,
                operation="SELECT",
                table="hazards",
                context={"query": "test"}
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_log_model_error(self):
        """Test logging an AI model error"""
        model_error = RuntimeError("Model inference failed")

        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_model_error(
                model_name="climate-classifier",
                error=model_error,
                input_data={"text": "test input"}
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_log_system_crash(self):
        """Test logging a system crash"""
        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_system_crash(
                description="Application crashed due to memory exhaustion",
                context={"memory_used_mb": 4096}
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_log_external_api_error(self):
        """Test logging an external API error"""
        api_error = Exception("API request timed out")

        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_external_api_error(
                api_name="weather-api",
                error=api_error,
                endpoint="/api/forecast",
                context={"timeout": 30}
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_log_validation_error(self):
        """Test logging a validation error"""
        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_validation_error(
                source=ErrorSource.BACKEND_PYTHON,
                validation_type="coordinates",
                error_message="Invalid coordinates: latitude out of range",
                context={"latitude": 95.0}
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_log_timeout_error(self):
        """Test logging a timeout error"""
        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_timeout_error(
                source=ErrorSource.EXTERNAL_API,
                operation="geocoding",
                timeout_seconds=30.0,
                context={"location": "Manila"}
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_error_logging_failure_does_not_crash(self):
        """Test that error logging failure doesn't crash the application"""
        # Simulate supabase failure
        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_supabase.schema.side_effect = Exception("Supabase connection failed")

            # Should return False but not raise exception
            result = await SystemErrorLogger.log_silent_bug(
                source=ErrorSource.BACKEND_PYTHON,
                description="Test bug"
            )

            assert result is False  # Logging failed gracefully

    @pytest.mark.asyncio
    async def test_error_with_request_context(self):
        """Test logging error with FastAPI request context"""
        from fastapi import Request

        # Create mock request
        mock_request = Mock(spec=Request)
        mock_request.method = "POST"
        mock_request.url.path = "/api/v1/classify"
        mock_request.client.host = "127.0.0.1"
        mock_request.headers = {
            "User-Agent": "test-client",
            "X-Forwarded-For": "192.168.1.1"
        }

        test_error = Exception("Test error with request")

        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_error(
                category=ErrorCategory.EXECUTION_ERROR,
                source=ErrorSource.BACKEND_PYTHON,
                error=test_error,
                request=mock_request
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_error_categories_match_enum(self):
        """Test that all error categories are valid enum values"""
        categories = [
            ErrorCategory.SYSTEM_CRASH,
            ErrorCategory.UNHANDLED_EXCEPTION,
            ErrorCategory.SILENT_BUG,
            ErrorCategory.EXECUTION_ERROR,
            ErrorCategory.DATABASE_ERROR,
            ErrorCategory.EXTERNAL_API_ERROR,
            ErrorCategory.MODEL_ERROR,
            ErrorCategory.VALIDATION_ERROR,
            ErrorCategory.RESOURCE_EXHAUSTION,
            ErrorCategory.TIMEOUT_ERROR
        ]

        for category in categories:
            assert isinstance(category, ErrorCategory)
            assert isinstance(category.value, str)

    @pytest.mark.asyncio
    async def test_error_sources_match_enum(self):
        """Test that all error sources are valid enum values"""
        sources = [
            ErrorSource.BACKEND_PYTHON,
            ErrorSource.FRONTEND_REACT,
            ErrorSource.DATABASE_SUPABASE,
            ErrorSource.AI_CLASSIFIER,
            ErrorSource.AI_GEO_NER,
            ErrorSource.RSS_PROCESSOR,
            ErrorSource.EXTERNAL_API,
            ErrorSource.SYSTEM
        ]

        for source in sources:
            assert isinstance(source, ErrorSource)
            assert isinstance(source.value, str)

    @pytest.mark.asyncio
    async def test_error_with_recovery_tracking(self):
        """Test error logging with recovery attempt tracking"""
        test_error = Exception("Recoverable error")

        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_error(
                category=ErrorCategory.EXECUTION_ERROR,
                source=ErrorSource.BACKEND_PYTHON,
                error=test_error,
                recovery_attempted=True,
                recovery_successful=True
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_error_with_user_context(self):
        """Test error logging with user context"""
        test_error = Exception("User-triggered error")

        with patch('backend.python.middleware.error_logger.supabase') as mock_supabase:
            mock_response = Mock()
            mock_response.data = [{"id": "test-id"}]
            mock_supabase.schema.return_value.from_.return_value.insert.return_value.execute.return_value = mock_response

            result = await SystemErrorLogger.log_error(
                category=ErrorCategory.VALIDATION_ERROR,
                source=ErrorSource.BACKEND_PYTHON,
                error=test_error,
                user_id="user-123",
                user_email="test@example.com"
            )

            assert result is True


# Integration test markers
@pytest.mark.integration
@pytest.mark.asyncio
async def test_error_logger_integration():
    """
    Integration test for error logger with actual Supabase connection.

    This test requires:
    - Valid Supabase connection configured
    - audit_logs table with error columns
    - Proper permissions

    Run with: pytest tests/python/test_error_logger.py::test_error_logger_integration
    """
    # pytest.skip("Integration test - requires Supabase connection")

    # Integration tests are enabled; comment out to disable
    test_error = ValueError("Integration test error")
    
    result = await SystemErrorLogger.log_unhandled_exception(
        exception=test_error,
        source=ErrorSource.BACKEND_PYTHON,
        context={"test": "integration"}
    )
    
    assert result is True
    
    # Verify error was logged to database
    from backend.python.lib.supabase_client import supabase
    response = supabase.schema("gaia").from_("audit_logs") \
        .select("*") \
        .eq("error_category", "unhandled_exception") \
        .eq("context->>test", "integration") \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    
    assert response.data and len(response.data) > 0, "No audit log found for test context"
    assert response.data[0]["error_source"] == "backend_python"
    
    # Cleanup inserted test row
    # if response.data and response.data[0].get("id"):
    #     supabase.schema("gaia").from_("audit_logs") \
    #         .delete() \
    #         .eq("id", response.data[0]["id"]) \
    #         .execute()
    try:
        assert response.data and len(response.data) > 0, "No audit log found for test context"
        assert response.data[0]["error_source"] == "backend_python"
    finally:
        # Cleanup inserted test row - uncomment if you want to keep test data for manual verification
        if response.data and response.data[0].get("id"):
            supabase.schema("gaia").from_("audit_logs") \
                .delete() \
                .eq("id", response.data[0]["id"]) \
                .execute()
        print("Integration test completed - check Supabase audit_logs for entry with context->>test = 'integration'")
