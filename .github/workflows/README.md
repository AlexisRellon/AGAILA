# GitHub Actions Workflows

## Overview

This directory contains GitHub Actions workflows for automated CI/CD and security testing.

## Workflows

### CodeQL Advanced (`codeql.yml`)

**Purpose**: Automated security vulnerability scanning and code quality analysis

**Triggers**:
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop`
- Weekly schedule (Sundays at 22:26 UTC)
- Manual dispatch (`workflow_dispatch`)

**Languages Analyzed**:
- Python (backend)
- JavaScript/TypeScript (frontend)
- GitHub Actions workflows

**Key Features**:
- **Python syntax pre-validation**: Validates all Python files using `python -m py_compile` before CodeQL analysis
- **YAML validation**: Ensures all workflow files are syntactically correct
- **Fail-fast approach**: Stops analysis if syntax errors are detected

**Recent Fix (March 26, 2026)**:
- Added Python syntax validation to prevent CodeQL parse errors
- Fixed syntax error in `backend/python/utils/generate_psgc_sql.py` (f-string escaped quotes)
- Replaced emoji characters with plain text markers for better encoding compatibility

**Common Python Syntax Issues**:

❌ **WRONG** - Escaped quotes in f-strings:
```python
values += f", {f\"'{region_code}'\" if region_code else 'NULL'}"
# SyntaxError: unexpected character after line continuation character
```

✅ **CORRECT** - Nested f-strings without escaping:
```python
values += f", {f'{region_code!r}' if region_code else 'NULL'}"
```

**Results**:
- View security alerts: **Security** → **Code scanning**
- View workflow runs: **Actions** → **CodeQL Advanced**

---

### StackHawk Security Scan (`stackhawk.yml`)

**Purpose**: Automated security scanning for OWASP Top 10 vulnerabilities

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Weekly schedule (Mondays at 2 AM UTC)
- Manual trigger via GitHub Actions UI

**Jobs**:
1. **scan-backend**: Scans FastAPI backend API
   - Starts backend in Docker
   - Verifies health endpoint
   - Runs StackHawk scan with OpenAPI spec
   - Uploads scan results as artifacts

2. **scan-frontend**: Scans React PWA frontend
   - Builds frontend production bundle
   - Serves static files
   - Runs StackHawk scan with AJAX spider
   - Uploads scan results as artifacts

3. **scan-summary**: Generates combined scan report
   - Downloads both scan results
   - Creates GitHub step summary
   - Links to StackHawk dashboard

**Required Secrets**:
- `HAWK_API_KEY`: StackHawk API key
- `HAWK_BACKEND_APP_ID`: Backend application ID
- `HAWK_FRONTEND_APP_ID`: Frontend application ID
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

**Setup**:
1. Go to: Repository Settings → Secrets and variables → Actions
2. Add all required secrets
3. Workflow runs automatically on push/PR

**Manual Trigger**:
1. Go to: Actions → StackHawk Security Scan
2. Click "Run workflow"
3. Select branch
4. Click "Run workflow" button

**Results**:
- View in GitHub: Actions tab → workflow run → Artifacts
- View in StackHawk: https://app.stackhawk.com/

## Adding More Workflows

To add a new workflow:

1. Create `<workflow-name>.yml` in this directory
2. Define triggers, jobs, and steps
3. Add required secrets to repository settings
4. Commit and push to trigger workflow

## Troubleshooting

### CodeQL Parse Errors

**Symptom**: "A parse error occurred while processing [file]"

**Solution**:
1. Validate Python syntax locally:
   ```bash
   python -m py_compile backend/python/path/to/file.py
   ```
2. Fix syntax errors (common issues: f-string escaping, indentation, encoding)
3. Commit fix and re-run workflow

### Workflow YAML Errors

**Symptom**: Workflow fails to parse or start

**Solution**:
1. Validate YAML locally:
   ```bash
   python -c "import yaml; yaml.safe_load(open('.github/workflows/workflow.yml'))"
   ```
2. Check for indentation errors, invalid keys, or encoding issues
3. Use plain ASCII text instead of emojis/special characters

## Resources

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [StackHawk Action](https://github.com/marketplace/actions/stackhawk-hawkscan-action)
- [GAIA Testing Guide](../../docs/security/STACKHAWK_TESTING_GUIDE.md)

---

**Last Updated**: March 26, 2026  
**DevOps Automator**: CodeQL workflow enhanced with pre-validation checks
