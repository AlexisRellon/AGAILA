"""
System Error Logging Utility for GAIA
Captures and tracks system crashes, silent bugs, and execution errors

Module: AC-06 (System Error Logger)
Table: gaia.audit_logs (with error tracking columns)
Security: Tamper-evident logging with integrity checksums
"""

import logging
import traceback
import sys
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum
from fastapi import Request

from backend.python.lib.supabase_client import supabase
from backend.python.middleware.audit_integrity import compute_checksum_for_log, GENESIS_HASH

logger = logging.getLogger(__name__)


class ErrorCategory(str, Enum):
    """Error categories matching gaia.error_category enum"""
    SYSTEM_CRASH = "system_crash"
    UNHANDLED_EXCEPTION = "unhandled_exception"
    SILENT_BUG = "silent_bug"
    EXECUTION_ERROR = "execution_error"
    DATABASE_ERROR = "database_error"
    EXTERNAL_API_ERROR = "external_api_error"
    MODEL_ERROR = "model_error"
    VALIDATION_ERROR = "validation_error"
    RESOURCE_EXHAUSTION = "resource_exhaustion"
    TIMEOUT_ERROR = "timeout_error"


class ErrorSource(str, Enum):
    """Error sources matching gaia.error_source enum"""
    BACKEND_PYTHON = "backend_python"
    FRONTEND_REACT = "frontend_react"
    DATABASE_SUPABASE = "database_supabase"
    AI_CLASSIFIER = "ai_classifier"
    AI_GEO_NER = "ai_geo_ner"
    RSS_PROCESSOR = "rss_processor"
    EXTERNAL_API = "external_api"
    SYSTEM = "system"


class ErrorStatus(str, Enum):
    """Error status matching gaia.error_status enum"""
    NEW = "new"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"
    KNOWN_ISSUE = "known_issue"
    IGNORED = "ignored"


class SystemErrorLogger:
    """
    Centralized system error logging utility.

    Usage:
        # Log unhandled exception
        await SystemErrorLogger.log_error(
            category=ErrorCategory.UNHANDLED_EXCEPTION,
            source=ErrorSource.BACKEND_PYTHON,
            error=exception,
            context={"endpoint": "/api/hazards"}
        )

        # Log silent bug
        await SystemErrorLogger.log_silent_bug(
            source=ErrorSource.AI_CLASSIFIER,
            description="Model returned invalid confidence score",
            context={"score": -0.5}
        )
    """

    @staticmethod
    async def log_error(
        category: ErrorCategory,
        source: ErrorSource,
        error: Optional[Exception] = None,
        error_message: Optional[str] = None,
        severity: str = "ERROR",
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        recovery_attempted: bool = False,
        recovery_successful: Optional[bool] = None
    ) -> bool:
        """
        Log a system error to audit_logs with error tracking fields.

        Args:
            category: Error category (from ErrorCategory enum)
            source: Error source (from ErrorSource enum)
            error: Exception object (if available)
            error_message: Custom error message
            severity: Severity level (INFO, WARNING, ERROR, CRITICAL)
            error_code: Custom error code for categorization
            context: Additional context as dict
            request: FastAPI request object
            user_id: User ID if error occurred in user context
            user_email: User email if available
            recovery_attempted: Whether recovery was attempted
            recovery_successful: Whether recovery succeeded

        Returns:
            bool: True if logged successfully
        """
        error_msg = "Unknown"
        try:
            # Extract error details
            if error:
                error_msg = str(error) if not error_message else error_message
                stack_trace = ''.join(traceback.format_exception(
                    type(error), error, error.__traceback__
                ))
            else:
                error_msg = error_message or "Unknown error"
                stack_trace = ''.join(traceback.format_stack())

            # Extract request context
            ip_address = None
            user_agent = None
            request_path = None
            request_method = None

            if request:
                forwarded = request.headers.get("X-Forwarded-For")
                ip_address = forwarded.split(",")[0] if forwarded else request.client.host if request.client else None
                user_agent = request.headers.get("User-Agent")
                request_path = str(request.url.path) if request.url else None
                request_method = request.method

            # Build error log entry
            timestamp = datetime.utcnow().isoformat()

            log_entry = {
                "event_type": "system_event",
                "severity": severity.upper(),
                "action": f"SYSTEM_ERROR_{category.value.upper()}",
                "action_description": error_msg,
                "resource_type": "system",
                "resource_id": error_code,

                # Error-specific fields
                "error_category": category.value,
                "error_source": source.value,
                "error_status": ErrorStatus.NEW.value,
                "error_code": error_code,
                "stack_trace": stack_trace,
                "recovery_attempted": recovery_attempted,
                "recovery_successful": recovery_successful,

                # Context
                "context": context or {},
                "metadata": {
                    **(context or {}),
                    "request_path": request_path,
                    "request_method": request_method,
                    "python_version": sys.version,
                },

                # User context
                "user_id": user_id,
                "user_email": user_email or "system",
                "user_role": "system",
                "ip_address": ip_address,
                "user_agent": user_agent,

                # Timestamps
                "created_at": timestamp,
                "first_occurred_at": timestamp,
                "last_occurred_at": timestamp,
                "occurrence_count": 1,

                # Status
                "status": "failure",
                "success": False,

                # Required fields with defaults
                "old_values": {},
                "new_values": {},
            }

            # Fetch the latest existing log's checksum to maintain the audit chain
            last_log_response = supabase.schema("gaia").from_("audit_logs").select("checksum").order("created_at", desc=True).limit(1).execute()
            previous_hash = last_log_response.data[0]["checksum"] if last_log_response.data and "checksum" in last_log_response.data[0] else GENESIS_HASH

            # Compute integrity checksum
            log_entry["checksum"] = compute_checksum_for_log(
                action=log_entry["action"],
                user_id=user_id,
                user_email=user_email or "system",
                user_role="system",
                resource_type="system",
                resource_id=error_code,
                ip_address=ip_address,
                details=log_entry["metadata"],
                timestamp=timestamp,
                previous_hash=previous_hash
            )

            # Insert into audit_logs
            response = supabase.schema("gaia").from_("audit_logs").insert(log_entry).execute()

            if response.data:
                logger.info(f"System error logged: {category.value} from {source.value}: {error_msg}")
                return True
            else:
                logger.error(f"System error log returned no data: {category.value} from {source.value}: {error_msg}")
                return False

        except Exception as e:
            # Don't let error logging failure crash the application
            logger.error(f"CRITICAL: Failed to log system error: {str(e)}")
            logger.error(f"Original error was: {error_msg}")
            return False

    @staticmethod
    async def log_unhandled_exception(
        exception: Exception,
        source: ErrorSource,
        request: Optional[Request] = None,
        context: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> bool:
        """
        Log an unhandled exception.

        Args:
            exception: The exception that was not handled
            source: Source of the exception
            request: FastAPI request object if available
            context: Additional context
            user_id: User ID if available
            user_email: User email if available

        Returns:
            bool: True if logged successfully
        """
        return await SystemErrorLogger.log_error(
            category=ErrorCategory.UNHANDLED_EXCEPTION,
            source=source,
            error=exception,
            severity="CRITICAL",
            context=context,
            request=request,
            user_id=user_id,
            user_email=user_email
        )

    @staticmethod
    async def log_silent_bug(
        source: ErrorSource,
        description: str,
        context: Optional[Dict[str, Any]] = None,
        severity: str = "WARNING",
        error_code: Optional[str] = None
    ) -> bool:
        """
        Log a silent bug (logic error without exception).

        Args:
            source: Source of the bug
            description: Description of the bug
            context: Additional context (data values, state, etc.)
            severity: Severity level
            error_code: Optional error code for categorization

        Returns:
            bool: True if logged successfully
        """
        return await SystemErrorLogger.log_error(
            category=ErrorCategory.SILENT_BUG,
            source=source,
            error_message=description,
            severity=severity,
            context=context,
            error_code=error_code
        )

    @staticmethod
    async def log_database_error(
        error: Exception,
        operation: str,
        table: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> bool:
        """
        Log a database operation error.

        Args:
            error: Database exception
            operation: Operation being performed (SELECT, INSERT, UPDATE, etc.)
            table: Table name if applicable
            context: Additional context
            user_id: User ID if applicable
            user_email: User email if applicable

        Returns:
            bool: True if logged successfully
        """
        full_context = {
            "operation": operation,
            "table": table,
            **(context or {})
        }

        return await SystemErrorLogger.log_error(
            category=ErrorCategory.DATABASE_ERROR,
            source=ErrorSource.DATABASE_SUPABASE,
            error=error,
            severity="ERROR",
            error_code=f"DB_{operation.upper()}",
            context=full_context,
            user_id=user_id,
            user_email=user_email
        )

    @staticmethod
    def _sanitize_input(input_data: Any) -> str:
        """Sanitizes sensitive fields from input data before logging."""
        if not input_data:
            return ""
        if isinstance(input_data, str):
            return input_data[:200]
        try:
            if isinstance(input_data, dict):
                sanitized = {}
                sensitive_keys = {"email", "phone", "ssn", "password", "hash", "secret", "token"}
                for k, v in input_data.items():
                    if any(sk in k.lower() for sk in sensitive_keys):
                        sanitized[k] = "[REDACTED]"
                    else:
                        sanitized[k] = v
                return str(sanitized)[:200]
            return str(input_data)[:200]
        except Exception:
            return "[UN-LOGGABLE DATA]"

    @staticmethod
    async def log_model_error(
        model_name: str,
        error: Exception,
        input_data: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> bool:
        """
        Log an AI model inference error.

        Args:
            model_name: Name of the model (classifier, geo_ner, etc.)
            error: Exception from model
            input_data: Input that caused the error (sanitized)
            user_id: User ID if applicable
            user_email: User email if applicable

        Returns:
            bool: True if logged successfully
        """
        source = ErrorSource.AI_CLASSIFIER if "classif" in model_name.lower() else ErrorSource.AI_GEO_NER

        return await SystemErrorLogger.log_error(
            category=ErrorCategory.MODEL_ERROR,
            source=source,
            error=error,
            severity="ERROR",
            error_code=f"MODEL_{model_name.upper()}",
            context={
                "model_name": model_name,
                "input_preview": SystemErrorLogger._sanitize_input(input_data) if input_data else None
            },
            user_id=user_id,
            user_email=user_email
        )

    @staticmethod
    async def log_system_crash(
        description: str,
        context: Optional[Dict[str, Any]] = None,
        error: Optional[Exception] = None
    ) -> bool:
        """
        Log a system crash event.

        Args:
            description: Description of the crash
            context: Additional context
            error: Exception that caused the crash if available

        Returns:
            bool: True if logged successfully
        """
        return await SystemErrorLogger.log_error(
            category=ErrorCategory.SYSTEM_CRASH,
            source=ErrorSource.SYSTEM,
            error=error,
            error_message=description,
            severity="CRITICAL",
            context=context
        )

    @staticmethod
    async def log_external_api_error(
        api_name: str,
        error: Exception,
        endpoint: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> bool:
        """
        Log an external API error.

        Args:
            api_name: Name of the external API
            error: Exception from API call
            endpoint: API endpoint that failed
            context: Additional context
            user_id: User ID if applicable
            user_email: User email if applicable

        Returns:
            bool: True if logged successfully
        """
        full_context = {
            "api_name": api_name,
            "endpoint": endpoint,
            **(context or {})
        }

        return await SystemErrorLogger.log_error(
            category=ErrorCategory.EXTERNAL_API_ERROR,
            source=ErrorSource.EXTERNAL_API,
            error=error,
            severity="ERROR",
            error_code=f"API_{api_name.upper()}",
            context=full_context,
            user_id=user_id,
            user_email=user_email
        )

    @staticmethod
    async def log_validation_error(
        source: ErrorSource,
        validation_type: str,
        error_message: str,
        context: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> bool:
        """
        Log a data validation error.

        Args:
            source: Source of the validation error
            validation_type: Type of validation that failed
            error_message: Description of validation failure
            context: Additional context (failed values, constraints)
            user_id: User ID if applicable
            user_email: User email if applicable

        Returns:
            bool: True if logged successfully
        """
        return await SystemErrorLogger.log_error(
            category=ErrorCategory.VALIDATION_ERROR,
            source=source,
            error_message=error_message,
            severity="WARNING",
            error_code=f"VALIDATION_{validation_type.upper()}",
            context=context,
            user_id=user_id,
            user_email=user_email
        )

    @staticmethod
    async def log_timeout_error(
        source: ErrorSource,
        operation: str,
        timeout_seconds: float,
        context: Optional[Dict[str, Any]] = None,
        error: Optional[Exception] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> bool:
        """
        Log an operation timeout error.

        Args:
            source: Source of the timeout
            operation: Operation that timed out
            timeout_seconds: Timeout threshold in seconds
            context: Additional context
            error: Exception if available
            user_id: User ID if applicable
            user_email: User email if applicable

        Returns:
            bool: True if logged successfully
        """
        full_context = {
            "operation": operation,
            "timeout_seconds": timeout_seconds,
            **(context or {})
        }

        return await SystemErrorLogger.log_error(
            category=ErrorCategory.TIMEOUT_ERROR,
            source=source,
            error=error,
            error_message=f"Operation '{operation}' timed out after {timeout_seconds}s",
            severity="ERROR",
            error_code=f"TIMEOUT_{operation.upper()}",
            context=full_context,
            user_id=user_id,
            user_email=user_email
        )
