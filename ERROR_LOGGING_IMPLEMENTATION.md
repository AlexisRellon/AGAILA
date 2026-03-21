# System Error Logging - Implementation Complete

## Overview

The system error logging enhancement (AC-06) has been successfully implemented to track system crashes, silent bugs, and execution errors in the GAIA application.

## What Was Implemented

### 1. ✅ Database Schema Enhancement

**File:** `backend/supabase/error_logging_migration.sql`

**New Enum Types Created:**
- `gaia.error_category` - 10 error categories
- `gaia.error_source` - 8 error sources
- `gaia.error_status` - 5 lifecycle statuses

**New Columns Added to `audit_logs` Table:**
- `error_category` - Type of error
- `error_source` - Source component
- `error_status` - Lifecycle status (default: 'new')
- `stack_trace` - Full stack trace for debugging
- `error_code` - Custom error code
- `recovery_attempted` - Boolean flag
- `recovery_successful` - Boolean flag
- `occurrence_count` - Duplicate detection
- `first_occurred_at` - First occurrence timestamp
- `last_occurred_at` - Last occurrence timestamp

**Indexes Created:**
- `idx_audit_logs_error_category`
- `idx_audit_logs_error_source`
- `idx_audit_logs_error_status`
- `idx_audit_logs_error_analysis` (composite)
- `idx_audit_logs_last_occurred`

**Helper Functions Created:**
- `get_recent_critical_errors()` - For monitoring dashboards
- `get_error_statistics()` - For analytics
- `get_unresolved_errors()` - For tracking open issues

### 2. ✅ SystemErrorLogger Utility Class

**File:** `backend/python/middleware/error_logger.py`

**Classes:**
- `ErrorCategory` - Enum matching database error_category type
- `ErrorSource` - Enum matching database error_source type
- `ErrorStatus` - Enum matching database error_status type
- `SystemErrorLogger` - Main logging utility

**Methods Implemented:**
- `log_error()` - Generic error logging with full context
- `log_unhandled_exception()` - Catch unhandled exceptions
- `log_silent_bug()` - Report logic errors without exceptions
- `log_database_error()` - Database operation failures
- `log_model_error()` - AI model inference errors
- `log_system_crash()` - Critical system failures
- `log_external_api_error()` - External API failures
- `log_validation_error()` - Data validation errors
- `log_timeout_error()` - Operation timeout errors

**Features:**
- Full stack trace capture
- Request context extraction (IP, user agent, path, method)
- User context tracking (user_id, user_email)
- Recovery attempt tracking
- Tamper-evident logging (integrity checksums)
- Graceful failure (logging errors don't crash application)

### 3. ✅ Global Exception Handler

**File:** `backend/python/main.py` (lines 218-277)

**Implementation:**
- Catches all unhandled exceptions at FastAPI application level
- Logs exceptions with full context to audit_logs
- Preserves HTTPException status codes and details
- Returns generic error messages to clients (security best practice)
- Includes error_id and timestamp for tracking
- Attempts to extract user context from Authorization header

### 4. ✅ Integration with Existing Error Handlers

**Files Modified:**
- `backend/python/main.py` (lines 425-476)

**Integrated Error Logging:**
- Classification endpoint (`/api/v1/classify`) - logs model errors
- Location extraction endpoint (`/api/v1/extract-locations`) - logs model errors
- Both include input context for debugging

### 5. ✅ Unit Tests

**File:** `tests/python/test_error_logger.py`

**Test Coverage:**
- Test all SystemErrorLogger methods
- Test error logging with request context
- Test error logging with user context
- Test recovery tracking
- Test graceful failure on logging errors
- Test enum value validation
- Integration test placeholder (requires Supabase connection)

**Total Tests:** 15 unit tests + 1 integration test placeholder

---

## How to Use

### Basic Error Logging

```python
from backend.python.middleware.error_logger import SystemErrorLogger, ErrorSource, ErrorCategory

# Log unhandled exception
try:
    risky_operation()
except Exception as e:
    await SystemErrorLogger.log_unhandled_exception(
        exception=e,
        source=ErrorSource.BACKEND_PYTHON,
        context={"operation": "risky_operation"}
    )
```

### Log Silent Bug

```python
# Detect logic error without exception
if confidence_score < 0 or confidence_score > 1:
    await SystemErrorLogger.log_silent_bug(
        source=ErrorSource.AI_CLASSIFIER,
        description="Invalid confidence score detected",
        context={"score": confidence_score},
        error_code="INVALID_CONFIDENCE"
    )
```

### Log Database Error

```python
try:
    result = supabase.schema("gaia").from_("hazards").insert(data).execute()
except Exception as e:
    await SystemErrorLogger.log_database_error(
        error=e,
        operation="INSERT",
        table="hazards",
        context={"hazard_id": hazard_id}
    )
```

### Log Model Error

```python
try:
    result = model.predict(input_data)
except Exception as e:
    await SystemErrorLogger.log_model_error(
        model_name="climate-classifier",
        error=e,
        input_data={"text_length": len(text)}
    )
```

---

## Database Migration

To apply the schema changes to Supabase:

1. **Connect to Supabase SQL Editor** or use psql:
```bash
psql $DATABASE_URL
```

2. **Execute the migration:**
```sql
\i backend/supabase/error_logging_migration.sql
```

Or copy/paste the SQL directly into Supabase SQL Editor.

3. **Verify migration:**
```sql
-- Check enum types
SELECT typname FROM pg_type WHERE typnamespace = 'gaia'::regnamespace AND typname LIKE 'error_%';

-- Check new columns
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'gaia' AND table_name = 'audit_logs' AND column_name LIKE 'error_%';
```

---

## Query Examples

### Get Recent Critical Errors

```sql
SELECT * FROM gaia.get_recent_critical_errors(24, 50);
```

### Get Error Statistics

```sql
SELECT * FROM gaia.get_error_statistics(7);
```

### Get Unresolved Errors

```sql
SELECT * FROM gaia.get_unresolved_errors(100);
```

### Manual Queries

```sql
-- Get all system crashes in last 24 hours
SELECT
    error_category,
    error_source,
    action_description AS error_message,
    stack_trace,
    last_occurred_at
FROM gaia.audit_logs
WHERE error_category = 'system_crash'
    AND last_occurred_at >= NOW() - INTERVAL '24 hours'
ORDER BY last_occurred_at DESC;

-- Get error frequency by category
SELECT
    error_category,
    error_source,
    COUNT(*) as total_errors,
    SUM(occurrence_count) as total_occurrences,
    MAX(last_occurred_at) as last_seen
FROM gaia.audit_logs
WHERE error_category IS NOT NULL
GROUP BY error_category, error_source
ORDER BY total_occurrences DESC;

-- Get errors with failed recovery attempts
SELECT *
FROM gaia.audit_logs
WHERE recovery_attempted = TRUE
    AND recovery_successful = FALSE
ORDER BY last_occurred_at DESC;
```

---

## Testing

### Unit Tests

Run unit tests (requires pytest and mocks):
```bash
pytest tests/python/test_error_logger.py -v
```

### Integration Tests

Integration tests require:
- Valid Supabase connection
- Applied database migration
- Proper environment variables

```bash
pytest tests/python/test_error_logger.py::test_error_logger_integration -v
```

### Manual Testing

1. **Trigger intentional error:**
```bash
curl -X POST http://localhost:8000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "test", "threshold": 999}'  # Invalid threshold
```

2. **Check audit_logs table:**
```sql
SELECT * FROM gaia.audit_logs
WHERE error_category IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

3. **Verify stack trace captured:**
```sql
SELECT
    error_category,
    error_source,
    action_description,
    stack_trace
FROM gaia.audit_logs
WHERE error_category = 'unhandled_exception'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Architecture

### Error Flow

```
1. Error Occurs → 2. Exception Raised → 3. Global Handler Catches
                                           ↓
4. SystemErrorLogger.log_* → 5. Build Log Entry → 6. Compute Checksum
                                                     ↓
7. Insert to audit_logs → 8. Return Success/Failure → 9. Original Error Propagates
```

### Error Categories

1. **system_crash** - Application crashes, service failures
2. **unhandled_exception** - Uncaught exceptions at global level
3. **silent_bug** - Logic errors that don't raise exceptions
4. **execution_error** - Runtime errors during execution
5. **database_error** - Database operation failures
6. **external_api_error** - Third-party API call failures
7. **model_error** - AI/ML model inference errors
8. **validation_error** - Data validation failures
9. **resource_exhaustion** - Out of memory, disk space, etc.
10. **timeout_error** - Operations that exceed time limits

### Error Sources

1. **backend_python** - Python FastAPI backend
2. **frontend_react** - React PWA frontend
3. **database_supabase** - Supabase PostgreSQL database
4. **ai_classifier** - Climate-NLI classifier model
5. **ai_geo_ner** - Geo-NER location extraction model
6. **rss_processor** - RSS feed processing pipeline
7. **external_api** - External API services
8. **system** - Operating system level

---

## Security Features

1. **Tamper-Evident Logging** - All error logs include integrity checksums
2. **Sensitive Data Protection** - Stack traces don't expose environment variables
3. **Generic Error Messages** - Clients receive generic errors, not internal details
4. **IP Tracking** - Captures client IP for security analysis
5. **User Context** - Tracks which user triggered the error (when applicable)

---

## Performance Considerations

1. **Asynchronous Logging** - Error logging is non-blocking
2. **Graceful Failure** - Logging errors don't crash the application
3. **Indexed Queries** - Database indexes for fast error lookups
4. **Minimal Overhead** - Only logs when errors occur

---

## Future Enhancements

1. **Error Aggregation** - Group similar errors to reduce noise
2. **Automated Alerting** - Email/Slack notifications for critical errors
3. **Error Dashboard** - Visual analytics for error trends
4. **ML-based Detection** - Detect anomalies in error patterns
5. **Error Recovery** - Automated retry logic for recoverable errors
6. **Distributed Tracing** - Correlate errors across microservices

---

## Files Changed

### New Files Created
1. `backend/supabase/error_logging_migration.sql` - Database migration
2. `backend/python/middleware/error_logger.py` - SystemErrorLogger utility
3. `tests/python/test_error_logger.py` - Unit tests

### Modified Files
1. `backend/python/main.py` - Added global exception handler and integrated error logging

---

## Verification Checklist

- [x] Database enum types created
- [x] audit_logs table extended with error columns
- [x] Database indexes created for performance
- [x] Helper functions created for querying
- [x] SystemErrorLogger utility implemented
- [x] Global exception handler added to FastAPI
- [x] Error logging integrated into AI/ML endpoints
- [x] Unit tests created
- [x] Documentation created
- [ ] Database migration applied to Supabase (requires manual step)
- [ ] Integration tests run (requires Supabase connection)
- [ ] Error monitoring dashboard created (future enhancement)

---

## Support

For issues or questions about the error logging system:

1. Check the audit_logs table for error details
2. Use helper functions to query error statistics
3. Review stack traces for debugging
4. Consult this documentation for usage examples

---

**Module:** AC-06 (System Error Logger)
**Status:** Implementation Complete
**Version:** 1.0
**Date:** 2026-03-21
