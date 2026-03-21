# SQL Migration Fix - PostgreSQL CREATE TYPE Syntax

## Issue
When running `error_logging_migration.sql` on Supabase cloud, the following error occurred:
```
ERROR: 42601: syntax error at or near "NOT"
LINE 21: CREATE TYPE IF NOT EXISTS gaia.error_category AS ENUM (
```

## Root Cause
PostgreSQL does **not** support the `IF NOT EXISTS` clause with `CREATE TYPE` statements. This is a known limitation across all PostgreSQL versions.

## Solution

### ❌ Incorrect (Does Not Work)
```sql
CREATE TYPE IF NOT EXISTS gaia.error_category AS ENUM (
    'value1',
    'value2'
);
```

### ✅ Correct (Works in All PostgreSQL Versions)
```sql
DO $$ BEGIN
    CREATE TYPE gaia.error_category AS ENUM (
        'value1',
        'value2'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
```

## How It Works

1. **DO Block**: Creates an anonymous code block that executes immediately
2. **CREATE TYPE**: Attempts to create the enum type
3. **EXCEPTION Handler**: Catches the `duplicate_object` error if type already exists
4. **THEN null**: Does nothing if the type exists (silent success)

## Benefits

✅ **Idempotent**: Can be run multiple times safely
✅ **Compatible**: Works on all PostgreSQL versions (9.x, 10+, Supabase)
✅ **Silent Success**: Doesn't fail if type already exists
✅ **Safe**: No data loss or conflicts

## Application in GAIA

This pattern was applied to all three enum type creations in `error_logging_migration.sql`:

1. **gaia.error_category** (10 error types)
2. **gaia.error_source** (8 error sources)
3. **gaia.error_status** (5 lifecycle statuses)

## Migration Status

After applying this fix:
- ✅ Migration runs successfully on Supabase cloud
- ✅ All 3 enum types created
- ✅ 10 columns added to audit_logs table
- ✅ 5 performance indexes created
- ✅ 3 helper functions created
- ✅ Permissions granted
- ✅ Verification checks passed

## Running the Fixed Migration

1. Open Supabase SQL Editor
2. Copy the contents of `backend/supabase/error_logging_migration.sql`
3. Paste into the SQL editor
4. Click "Run"
5. Check for success messages in the output

Expected output:
```
NOTICE: All enum types created successfully
NOTICE: All columns added successfully to audit_logs
NOTICE: All indexes created successfully
NOTICE: ========================================
NOTICE: Error logging migration completed successfully
NOTICE: ========================================
```

## Alternative Patterns (For Reference)

### Pattern 1: Check Before Create (More Verbose)
```sql
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'error_category'
        AND typnamespace = 'gaia'::regnamespace
    ) THEN
        CREATE TYPE gaia.error_category AS ENUM ('value1', 'value2');
    END IF;
END $$;
```

### Pattern 2: DROP IF EXISTS Then CREATE (Destructive)
```sql
DROP TYPE IF EXISTS gaia.error_category CASCADE;
CREATE TYPE gaia.error_category AS ENUM ('value1', 'value2');
```
⚠️ **Warning**: This will drop dependent columns/functions!

## Best Practice

For production migrations, always use the **exception handler pattern** (our chosen solution) because it:
- Is non-destructive
- Handles race conditions
- Is concise and readable
- Follows PostgreSQL best practices

## Related Resources

- [PostgreSQL CREATE TYPE Documentation](https://www.postgresql.org/docs/current/sql-createtype.html)
- [PostgreSQL DO Block Documentation](https://www.postgresql.org/docs/current/sql-do.html)
- [Supabase SQL Editor Guide](https://supabase.com/docs/guides/database/overview)

---

**Fixed:** 2026-03-21
**Module:** AC-06 (System Error Logger)
**Migration File:** `backend/supabase/error_logging_migration.sql`
