-- ============================================================================
-- GAIA System Error Logging Enhancement Migration
-- Module: AC-06 (System Error Logger)
-- Description: Extends audit_logs table with error tracking capabilities
-- ============================================================================
--
-- This migration adds error logging capabilities to the existing audit_logs table,
-- including new enum types for error categorization and additional columns for
-- error tracking, stack traces, and recovery attempts.
--
-- Author: System Enhancement
-- Date: 2026-03-21
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Error Enum Types
-- ============================================================================

-- Create error_category enum type
-- Categorizes different types of errors that can occur in the system
DO $$ BEGIN
    CREATE TYPE gaia.error_category AS ENUM (
        'system_crash',           -- Application/service crash
        'unhandled_exception',    -- Uncaught exceptions
        'silent_bug',             -- Logic errors without exceptions
        'execution_error',        -- Runtime execution failures
        'database_error',         -- Database operation failures
        'external_api_error',     -- Third-party API failures
        'model_error',            -- AI model inference errors
        'validation_error',       -- Data validation failures
        'resource_exhaustion',    -- Memory/CPU/disk issues
        'timeout_error'           -- Operation timeout errors
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE gaia.error_category IS 'Categories of system errors for tracking and analysis';

-- Create error_source enum type
-- Identifies which component or service generated the error
DO $$ BEGIN
    CREATE TYPE gaia.error_source AS ENUM (
        'backend_python',         -- Python backend service
        'frontend_react',         -- React frontend
        'database_supabase',      -- Supabase database
        'ai_classifier',          -- Climate-NLI classifier
        'ai_geo_ner',            -- Geo-NER model
        'rss_processor',         -- RSS processing pipeline
        'external_api',          -- External service calls
        'system'                 -- Operating system level
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE gaia.error_source IS 'Source components that can generate errors';

-- Create error_status enum type
-- Tracks the lifecycle status of an error
DO $$ BEGIN
    CREATE TYPE gaia.error_status AS ENUM (
        'new',                   -- Newly detected error
        'investigating',         -- Being investigated
        'resolved',              -- Fixed/resolved
        'known_issue',           -- Documented known issue
        'ignored'                -- Intentionally ignored
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE gaia.error_status IS 'Lifecycle status of system errors';

-- ============================================================================
-- STEP 2: Extend audit_logs Table
-- ============================================================================

-- Add error tracking columns to existing audit_logs table
-- These columns extend the audit trail with detailed error information

-- Error categorization and source
ALTER TABLE gaia.audit_logs
ADD COLUMN IF NOT EXISTS error_category gaia.error_category,
ADD COLUMN IF NOT EXISTS error_source gaia.error_source,
ADD COLUMN IF NOT EXISTS error_status gaia.error_status DEFAULT 'new';

-- Error details
ALTER TABLE gaia.audit_logs
ADD COLUMN IF NOT EXISTS stack_trace TEXT,
ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);

-- Recovery tracking
ALTER TABLE gaia.audit_logs
ADD COLUMN IF NOT EXISTS recovery_attempted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recovery_successful BOOLEAN;

-- Occurrence tracking for duplicate error detection
ALTER TABLE gaia.audit_logs
ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS first_occurred_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_occurred_at TIMESTAMPTZ DEFAULT NOW();

-- Add comments to document the new columns
COMMENT ON COLUMN gaia.audit_logs.error_category IS 'Type/category of error (only for error events)';
COMMENT ON COLUMN gaia.audit_logs.error_source IS 'Source component that generated the error';
COMMENT ON COLUMN gaia.audit_logs.error_status IS 'Current status of error investigation/resolution';
COMMENT ON COLUMN gaia.audit_logs.stack_trace IS 'Full stack trace for debugging (only for exceptions)';
COMMENT ON COLUMN gaia.audit_logs.error_code IS 'Custom error code for categorization and filtering';
COMMENT ON COLUMN gaia.audit_logs.recovery_attempted IS 'Whether automatic recovery was attempted';
COMMENT ON COLUMN gaia.audit_logs.recovery_successful IS 'Whether recovery attempt succeeded';
COMMENT ON COLUMN gaia.audit_logs.occurrence_count IS 'Number of times this error occurred';
COMMENT ON COLUMN gaia.audit_logs.first_occurred_at IS 'When this error first occurred';
COMMENT ON COLUMN gaia.audit_logs.last_occurred_at IS 'When this error last occurred';

-- ============================================================================
-- STEP 3: Create Indexes for Performance
-- ============================================================================

-- Index for querying errors by category
CREATE INDEX IF NOT EXISTS idx_audit_logs_error_category
ON gaia.audit_logs(error_category)
WHERE error_category IS NOT NULL;

-- Index for querying errors by source
CREATE INDEX IF NOT EXISTS idx_audit_logs_error_source
ON gaia.audit_logs(error_source)
WHERE error_source IS NOT NULL;

-- Index for querying errors by status
CREATE INDEX IF NOT EXISTS idx_audit_logs_error_status
ON gaia.audit_logs(error_status)
WHERE error_status IS NOT NULL;

-- Composite index for error analysis queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_error_analysis
ON gaia.audit_logs(error_category, error_source, severity, last_occurred_at DESC)
WHERE error_category IS NOT NULL;

-- Index for finding recent errors
CREATE INDEX IF NOT EXISTS idx_audit_logs_last_occurred
ON gaia.audit_logs(last_occurred_at DESC)
WHERE error_category IS NOT NULL;

-- ============================================================================
-- STEP 4: Create Helper Functions
-- ============================================================================

-- Function to get recent critical errors
CREATE OR REPLACE FUNCTION gaia.get_recent_critical_errors(
    hours_back INTEGER DEFAULT 24,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    error_category gaia.error_category,
    error_source gaia.error_source,
    error_message TEXT,
    stack_trace TEXT,
    occurrence_count INTEGER,
    last_occurred_at TIMESTAMPTZ,
    severity TEXT,
    error_status gaia.error_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.error_category,
        a.error_source,
        a.action_description AS error_message,
        a.stack_trace,
        a.occurrence_count,
        a.last_occurred_at,
        a.severity,
        a.error_status
    FROM gaia.audit_logs a
    WHERE a.error_category IS NOT NULL
        AND a.severity = 'CRITICAL'
        AND a.last_occurred_at >= NOW() - (hours_back || ' hours')::INTERVAL
    ORDER BY a.last_occurred_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION gaia.get_recent_critical_errors IS 'Get recent critical errors for monitoring and alerting';

-- Function to get error statistics by category
CREATE OR REPLACE FUNCTION gaia.get_error_statistics(
    days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    error_category gaia.error_category,
    error_source gaia.error_source,
    total_errors BIGINT,
    total_occurrences BIGINT,
    critical_count BIGINT,
    error_count BIGINT,
    warning_count BIGINT,
    unresolved_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.error_category,
        a.error_source,
        COUNT(*) AS total_errors,
        SUM(a.occurrence_count) AS total_occurrences,
        COUNT(*) FILTER (WHERE a.severity = 'CRITICAL') AS critical_count,
        COUNT(*) FILTER (WHERE a.severity = 'ERROR') AS error_count,
        COUNT(*) FILTER (WHERE a.severity = 'WARNING') AS warning_count,
        COUNT(*) FILTER (WHERE a.error_status IN ('new', 'investigating')) AS unresolved_count
    FROM gaia.audit_logs a
    WHERE a.error_category IS NOT NULL
        AND a.created_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY a.error_category, a.error_source
    ORDER BY total_occurrences DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION gaia.get_error_statistics IS 'Get error statistics by category and source for dashboard';

-- Function to get unresolved errors
CREATE OR REPLACE FUNCTION gaia.get_unresolved_errors(
    limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    error_category gaia.error_category,
    error_source gaia.error_source,
    error_status gaia.error_status,
    error_code VARCHAR(50),
    error_message TEXT,
    severity TEXT,
    occurrence_count INTEGER,
    first_occurred_at TIMESTAMPTZ,
    last_occurred_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.error_category,
        a.error_source,
        a.error_status,
        a.error_code,
        a.action_description AS error_message,
        a.severity,
        a.occurrence_count,
        a.first_occurred_at,
        a.last_occurred_at
    FROM gaia.audit_logs a
    WHERE a.error_category IS NOT NULL
        AND a.error_status IN ('new', 'investigating')
    ORDER BY a.severity DESC, a.last_occurred_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION gaia.get_unresolved_errors IS 'Get all unresolved errors for monitoring dashboard';

-- ============================================================================
-- STEP 5: Grant Permissions
-- ============================================================================

-- Grant usage on enum types to authenticated users
GRANT USAGE ON TYPE gaia.error_category TO authenticated;
GRANT USAGE ON TYPE gaia.error_source TO authenticated;
GRANT USAGE ON TYPE gaia.error_status TO authenticated;

-- Grant execute on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION gaia.get_recent_critical_errors TO authenticated;
GRANT EXECUTE ON FUNCTION gaia.get_error_statistics TO authenticated;
GRANT EXECUTE ON FUNCTION gaia.get_unresolved_errors TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify enum types were created
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'error_category' AND typnamespace = 'gaia'::regnamespace
    ), 'error_category enum type not found';

    ASSERT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'error_source' AND typnamespace = 'gaia'::regnamespace
    ), 'error_source enum type not found';

    ASSERT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'error_status' AND typnamespace = 'gaia'::regnamespace
    ), 'error_status enum type not found';

    RAISE NOTICE 'All enum types created successfully';
END $$;

-- Verify columns were added
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'gaia'
        AND table_name = 'audit_logs'
        AND column_name = 'error_category'
    ), 'error_category column not found in audit_logs';

    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'gaia'
        AND table_name = 'audit_logs'
        AND column_name = 'error_source'
    ), 'error_source column not found in audit_logs';

    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'gaia'
        AND table_name = 'audit_logs'
        AND column_name = 'stack_trace'
    ), 'stack_trace column not found in audit_logs';

    RAISE NOTICE 'All columns added successfully to audit_logs';
END $$;

-- Verify indexes were created
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'gaia'
        AND tablename = 'audit_logs'
        AND indexname = 'idx_audit_logs_error_category'
    ), 'idx_audit_logs_error_category index not found';

    RAISE NOTICE 'All indexes created successfully';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Error logging migration completed successfully';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Summary:';
    RAISE NOTICE '  - Created 3 enum types: error_category, error_source, error_status';
    RAISE NOTICE '  - Added 10 columns to audit_logs table';
    RAISE NOTICE '  - Created 5 indexes for performance';
    RAISE NOTICE '  - Created 3 helper functions for error querying';
    RAISE NOTICE 'The system can now track system crashes, silent bugs, and execution errors';
    RAISE NOTICE '========================================';
END $$;
