import pytest
from unittest.mock import patch, Mock, AsyncMock
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
import json

from backend.python.main import global_exception_handler, app
from backend.python.middleware.error_logger import SystemErrorLogger, ErrorSource

# We can create a test client to hit a dummy endpoint that raises an error
# but since the handler is attached to the app, we can just call it directly.

@pytest.fixture
def mock_request():
    request = Mock(spec=Request)
    request.method = "GET"
    request.url.path = "/api/test"
    request.headers = {}
    return request

class TestGlobalExceptionHandler:
    """Test suite for the global exception handler added in main.py"""

    @pytest.mark.asyncio
    @patch('backend.python.main.SystemErrorLogger.log_unhandled_exception', new_callable=AsyncMock)
    async def test_global_exception_handler_general_exception(self, mock_log_unhandled_exception, mock_request):
        """Test that a general unhandled exception is logged and returning 500"""
        mock_request.headers = {"Authorization": "Bearer fake_token_here"}
        test_exception = ValueError("Something completely unexpected mapping failed")

        response = await global_exception_handler(mock_request, test_exception)

        # Ensure we returned a JSONResponse with 500
        assert isinstance(response, JSONResponse)
        assert response.status_code == 500
        
        content = response.body.decode()
        assert "internal server error" in content.lower()
        
        # Verify the SystemErrorLogger was called correctly with auth info extracted
        mock_log_unhandled_exception.assert_called_once()
        kwargs = mock_log_unhandled_exception.call_args.kwargs
        assert kwargs["exception"] == test_exception
        assert kwargs["source"] == ErrorSource.BACKEND_PYTHON
        assert kwargs["context"]["method"] == "GET"
        assert kwargs["context"]["endpoint"] == "/api/test"
        assert kwargs["context"]["exception_type"] == "ValueError"
        assert kwargs["request"] == mock_request
        assert kwargs["user_email"] == "authenticated_user"

    @pytest.mark.asyncio
    @patch('backend.python.main.SystemErrorLogger.log_unhandled_exception', new_callable=AsyncMock)
    async def test_global_exception_handler_http_exception(self, mock_log_unhandled_exception, mock_request):
        """Test that HTTPException retains its status code but still gets logged"""
        test_exception = HTTPException(status_code=403, detail="Not authorized for this action")

        response = await global_exception_handler(mock_request, test_exception)

        # Ensure we returned the original status code
        assert isinstance(response, JSONResponse)
        assert response.status_code == 403
        
        content = json.loads(response.body.decode())
        assert content["detail"] == "Not authorized for this action"
        
        # Verify it was still logged
        mock_log_unhandled_exception.assert_called_once()
        kwargs = mock_log_unhandled_exception.call_args.kwargs
        assert kwargs["exception"] == test_exception
        assert kwargs["source"] == ErrorSource.BACKEND_PYTHON
        assert kwargs["user_email"] is None # Assuming no auth header


class TestModelErrorIntegration:
    """Test suite for the model error logging integration via endpoints"""
    
    @patch('backend.python.main.SystemErrorLogger.log_model_error', new_callable=AsyncMock)
    @patch('backend.python.main.classifier.classify')
    def test_classify_text_error_logging(self, mock_classify, mock_log_model_error):
        """Test that a classification error triggers log_model_error"""
        mock_classify.side_effect = RuntimeError("Mocked classify timeout")
        
        client = TestClient(app)
        response = client.post("/api/v1/classify", json={"text": "Test storm", "threshold": 0.5})
        
        assert response.status_code == 500
        mock_log_model_error.assert_called_once()
        kwargs = mock_log_model_error.call_args.kwargs
        assert kwargs["model_name"] == "climate-classifier"
        assert kwargs["input_data"]["text_length"] == 10
        assert kwargs["input_data"]["threshold"] == 0.5

    @patch('backend.python.main.SystemErrorLogger.log_model_error', new_callable=AsyncMock)
    @patch('backend.python.main.geo_ner.extract_locations')
    def test_extract_locations_error_logging(self, mock_extract, mock_log_model_error):
        """Test that a geo-ner error triggers log_model_error"""
        mock_extract.side_effect = RuntimeError("Mocked ner timeout")
        
        client = TestClient(app)
        response = client.post("/api/v1/extract-locations", json={"text": "Test storm in Manila", "threshold": 0.5})
        
        assert response.status_code == 500
        mock_log_model_error.assert_called_once()
        kwargs = mock_log_model_error.call_args.kwargs
        assert kwargs["model_name"] == "geo-ner"
        assert kwargs["input_data"]["text_length"] == 20
