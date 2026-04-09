# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AGAILA (A Framework Integrating Zero-Shot Classification and Geo-NER for Natural Hazard Detection)** is a real-time environmental hazard detection and visualization system for the Philippines. It uses Zero-Shot Classification (DeBERTa-MNLI, ClimateNLI) and Geospatial Named Entity Recognition (Geo-NER) to automatically detect, classify, and map environmental hazards from RSS feeds and citizen reports.

**Target Time-to-Action**: Less than 5 minutes from article publication to hazard visualization on the map.

### Key Constraints
- **Geographic Scope**: ONLY process events within Philippine administrative boundaries
- **Confidence Display**: Always show confidence scores alongside predictions
- **Human-in-the-Loop**: Manual validation required for low-confidence reports (<0.7)
- **Container-First**: All services MUST run in Docker containers
- **Data Privacy**: Comply with RA 10173 (Philippine Data Protection Act)

## Critical Development Context

**ALL DEVELOPMENT OCCURS IN DOCKER CONTAINERS**. This is non-negotiable and affects every aspect of development:

- **Service Architecture**: Backend (FastAPI), Frontend (React), Redis, Celery Worker, Celery Beat
- **Networking**: Services communicate via Docker network using service names (e.g., `http://backend:8000`, NOT `localhost:8000`)
- **Environment Variables**: Configured via `.env` files and `docker-compose.yml`
- **Code Changes**: Automatically reflected via volume mounts (hot reload enabled)
- **Testing**: Always run tests inside containers
- **Dependencies**: Add to `requirements.txt` (Python) or `frontend/package.json` (JavaScript), then rebuild containers

## Common Commands

### Docker Development

```bash
# Start all services (first time or after dependency changes)
docker-compose up --build

# Start services (normal development)
docker-compose up

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f celery_worker

# Access container shell
docker-compose exec backend bash
docker-compose exec frontend sh

# Stop all services
docker-compose down

# Clean Docker cache
docker system prune -a
```

### Testing

```bash
# Backend Python tests (run inside container)
docker-compose run backend pytest tests/python/ --cov=backend/python

# Frontend tests (run inside container)
docker-compose run frontend npm test

# Frontend tests with coverage
docker-compose run frontend npm run test:coverage

# Security scanning (StackHawk)
# PowerShell:
. .\scripts\test-stackhawk.ps1
Test-Backend    # Backend API scan (5 min)
Test-Frontend   # Frontend PWA scan (10 min)
Test-Quick      # Quick backend scan (30 sec)
```

### Building

```bash
# Frontend build (for production)
cd frontend && npm run build

# Test Docker builds before deployment
docker build -f Dockerfile.backend -t gaia-backend .
docker build -f Dockerfile.frontend -t gaia-frontend .

# Frontend linting
cd frontend && npm run lint
```

### Deployment

```bash
# Railway deployment
railway login
railway init
railway up
railway logs --service backend

# View Railway environment
railway environment
```

## Architecture

### Three-Tiered Architecture

**1. Data Ingestion Layer**
- RSS feed aggregation (Celery Beat scheduler, hourly cron)
- Citizen report submission (public API with reCAPTCHA)
- Reference data (Philippine administrative boundaries from NAMRIA)

**2. Core Processing (AI Pipeline)**
```
Text Input → Preprocessing (spaCy/NLTK) → Climate-NLI (Hazard Type)
  → Geo-NER (Location) → PostGIS Validation → Database Storage
```
Output: `{Hazard Type, Latitude, Longitude, Confidence Score}`

- Only events within Philippine boundaries are processed
- Low-confidence predictions (<0.7) flagged for manual triage
- Background processing via Celery workers maintains API responsiveness

**3. Presentation Layer (PWA)**
- React 18 + TypeScript + TailwindCSS + ShadCN UI
- Leaflet for interactive maps with marker clustering
- React Query for data fetching and caching
- Zustand for lightweight state management
- Supabase Realtime for live updates

### Service Architecture (Docker Compose)

```
Frontend (React PWA) ──▶ Backend (FastAPI) ──▶ Supabase (PostGIS)
    :3000                    :8000                  (Cloud)
                               │
                               ▼
                        Redis (:6379)
                               │
                   ┌───────────┴───────────┐
                   ▼                       ▼
            Celery Worker          Celery Beat
          (RSS Processing)      (Scheduled Tasks)
```

### Tech Stack

**Frontend** (`frontend/`)
- React 18, TypeScript 4.9.5
- TailwindCSS 3.3.6, ShadCN UI (11 components), Radix UI primitives
- Leaflet 1.9.4, react-leaflet 5.0.0, react-leaflet-cluster 4.0.0
- React Query 5.90.6 (data fetching), Zustand 5.0.9 (state)
- React Hook Form 7.67.0 + Zod 4.1.12 (form validation)

**Backend** (`backend/python/`)
- Python 3.9+, FastAPI, Uvicorn
- Transformers (Climate-NLI model), spaCy (Geo-NER)
- Celery + Redis (background tasks)
- Supabase Python SDK

**Database**
- Supabase (managed PostgreSQL 14+ with PostGIS extension)
- Tables: `hazards`, `philippine_boundaries`, `citizen_reports`, `rss_feeds`, `rss_processing_logs`, `activity_logs`, `audit_logs`, `system_config`
- Row Level Security (RLS) policies enforced
- Realtime subscriptions enabled

**Deployment**
- Docker + Docker Compose (local dev)
- Railway or Vercel + Railway (production)
- GitHub Actions (CI/CD)

## Key File Locations

### Backend Structure

```
backend/
├── python/
│   ├── main.py                    # FastAPI application entry point
│   ├── admin_api.py               # Admin endpoints (user mgmt, triage, config)
│   ├── analytics_api.py           # Analytics and reporting endpoints
│   ├── boundaries_api.py          # Philippine boundaries API
│   ├── citizen_reports.py         # Citizen report submission
│   ├── celery_worker.py           # Celery background tasks
│   ├── rss_processor_enhanced.py  # RSS feed processing (700 lines)
│   ├── rss_admin_api.py           # RSS admin endpoints (500 lines)
│   ├── api/
│   │   ├── auth.py                # Authentication endpoints
│   │   ├── hazards.py             # Hazard CRUD operations
│   │   └── realtime.py            # Realtime notification handlers
│   ├── lib/
│   │   └── supabase_client.py     # Supabase client singleton
│   └── middleware/
│       ├── rbac.py                # Role-based access control
│       ├── rate_limiter.py        # Rate limiting (SlowAPI)
│       ├── security_headers.py    # Security headers (CSP, HSTS, etc.)
│       ├── activity_logger.py     # Activity logging
│       └── error_logger.py        # Error logging with context
├── .env.example                   # Environment variable template
└── requirements.txt               # Python dependencies
```

### Frontend Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── LandingPage.tsx        # Public landing page
│   │   ├── Login.tsx              # Login page (AUTH-01)
│   │   ├── Register.tsx           # Registration page (AUTH-02)
│   │   ├── UnifiedDashboard.tsx   # Main post-auth shell (ShadCN Sidebar + RBAC)
│   │   ├── PublicMap.tsx          # Public hazard map (GV-02)
│   │   ├── CitizenReportForm.tsx  # Citizen reporting (CR-01, ~500 lines)
│   │   └── ReportTracking.tsx     # Report status tracking
│   ├── components/
│   │   ├── admin/                 # Admin components
│   │   │   ├── UserManagement.tsx
│   │   │   ├── SystemConfig.tsx
│   │   │   ├── ReportTriage.tsx
│   │   │   ├── ActivityMonitor.tsx
│   │   │   └── rss/               # RSS admin UI (~2,290 lines)
│   │   │       ├── RSSFeedManager.tsx
│   │   │       ├── RSSProcessingLogs.tsx
│   │   │       └── RSSStatistics.tsx
│   │   ├── dashboard/             # Dashboard components
│   │   ├── filters/               # Filter components (FP-01 to FP-04)
│   │   │   ├── HazardTypeFilter.tsx
│   │   │   ├── TimeWindowFilter.tsx
│   │   │   └── SourceTypeFilter.tsx
│   │   ├── map/                   # Map components
│   │   │   ├── HeatmapLayer.tsx   # Heatmap visualization (GV-04)
│   │   │   ├── MarkerCluster.tsx  # Marker clustering (GV-03)
│   │   │   └── LocationPicker.tsx # Location selection (CR-05)
│   │   ├── reports/               # Report components
│   │   │   └── ReportGenerator.tsx # PDF report generation (RG-02)
│   │   ├── landing/               # Landing page sections
│   │   └── ui/                    # ShadCN UI components
│   ├── hooks/
│   │   ├── useMapScreenshot.ts    # Map screenshot export (RG-01)
│   │   ├── useRealtimeNotifications.ts # Realtime subscriptions (306 lines)
│   │   └── useRSS.ts              # RSS hooks with React Query
│   ├── contexts/
│   │   └── RSSAutoProcessProvider.tsx # RSS auto-processing context
│   ├── stores/                    # Zustand state stores
│   ├── services/                  # API client services
│   ├── constants/
│   │   └── landingAssets.ts       # Asset registry for landing page
│   └── index.css                  # Global styles with design tokens
├── public/
│   ├── assets/img/
│   │   ├── GAIA.svg               # Colored logo
│   │   └── GAIA-white.svg         # White logo (dark backgrounds)
│   └── data/                      # GeoJSON boundary files
├── package.json                   # JavaScript dependencies
├── tailwind.config.js             # Tailwind configuration
└── tsconfig.json                  # TypeScript configuration
```

### Configuration Files

```
.
├── docker-compose.yml             # Development orchestration
├── docker-compose.prod.yml        # Production configuration
├── Dockerfile.backend             # Backend container
├── Dockerfile.frontend            # Frontend multi-stage build + Nginx
├── heroku.yml                     # Heroku Container Registry config
├── MODULE_CHECKLIST.md            # Implementation status tracker
├── AGENTS.md                      # AI agent navigation guide
├── openspec/                      # Spec-driven development
│   ├── AGENTS.md                  # OpenSpec workflow instructions
│   ├── project.md                 # Project conventions
│   ├── specs/                     # Current specifications
│   └── changes/                   # Change proposals
└── docs/                          # Documentation
    ├── README.md                  # Documentation index
    ├── setup/                     # Setup guides
    ├── guides/                    # Deployment and usage guides
    ├── security/                  # Security documentation
    └── implementation/            # Implementation logs
```

## Module Codes (Branching & Commits)

Use these prefixes for branches and commits:

| Code | Module | Examples |
|------|--------|----------|
| `AUTH-0x` | Authentication/Registration | `AUTH-01` (Login), `AUTH-02` (Register) |
| `CD-01` | Dashboard/Command Interface | Main dashboard shell |
| `GV-0x` | Geospatial Visualization | `GV-02` (Markers), `GV-03` (Clustering), `GV-04` (Heatmap) |
| `FP-0x` | Filtering Panel | `FP-01` (Hazard Type), `FP-03` (Time Window), `FP-04` (Source Type) |
| `RG-0x` | Report Generation | `RG-01` (Export), `RG-02` (PDF Reports) |
| `AC-0x` | Admin Console | `AC-01` (Audit Logs), `AC-02` (System Config), `AC-04` (Triage) |
| `CR-0x` | Citizen Report | `CR-01` to `CR-07` (complete reporting flow) |
| `UM-0x` | User Management | `UM-01` (User CRUD), `UM-02` (Role Assignment) |
| `RSS-0x` | RSS Feed Integration | `RSS-08` (Backend), `RSS-09` (Admin UI), `RSS-10` (Testing) |
| `AAM-0x` | Advanced Analytics | Performance metrics and trend analysis |
| `EDI-0x` | External Data Integration | Weather APIs, social media feeds |

### Git Conventions

```bash
# Branch naming
feature/GV-04-heatmap-density
fix/CR-03-captcha-timeout

# Commit messages
feat(GV-02): add dynamic marker refresh
fix(CR-03): handle CAPTCHA timeout gracefully
docs(README): update deployment instructions
chore(RSS-10): remove obsolete documentation
```

## OpenSpec Workflow

AGAILA uses **spec-driven development** via OpenSpec. Before implementing new features:

1. **Check existing work**: Run `openspec list` and `openspec list --specs`
2. **Review project context**: Read `openspec/project.md` for conventions
3. **Create change proposal**: Scaffold under `openspec/changes/[change-id]/`
   - `proposal.md` - Why, what, impact
   - `tasks.md` - Implementation checklist
   - `design.md` - Technical decisions (if cross-cutting or complex)
   - `specs/[capability]/spec.md` - Delta specifications (ADDED/MODIFIED/REMOVED)
4. **Validate**: Run `openspec validate [change-id] --strict`
5. **Get approval**: Do NOT start implementation until proposal is reviewed
6. **Implement**: Follow `tasks.md` sequentially
7. **Archive**: After deployment, move to `changes/archive/YYYY-MM-DD-[name]/`

**When to create proposals**:
- New features or capabilities
- Breaking changes (API, schema, architecture)
- Security or performance optimizations
- Multi-file changes affecting multiple components

**Skip proposals for**:
- Bug fixes (restore intended behavior)
- Typos, formatting, comments
- Non-breaking dependency updates
- Configuration changes

See `openspec/AGENTS.md` for detailed workflow instructions.

## Development Patterns

### RBAC Roles

Three user roles enforced via middleware:
- **`master_admin`**: Full system access (user mgmt, system config, all admin features)
- **`validator`**: Report triage, validation, analytics
- **`lgu_responder`**: View hazards, generate reports, limited admin access

Role enforcement: `backend/python/middleware/rbac.py` with `@require_role` decorator.

### Database Migrations

Migrations are SQL files applied manually to Supabase:
- Location: `backend/supabase/migrations/` — all migration files must be stored in this directory as `*.sql` files
- Schema prefix: `gaia.` (e.g., `gaia.hazards`, `gaia.rss_feeds`) — maintained for backward compatibility
- Always use fully qualified table names in migrations and queries
- Apply via Supabase SQL Editor or `psql` command

### Realtime Subscriptions

Using Supabase Realtime for live updates:
- Frontend: `useRealtimeNotifications.ts` hook
- Events: `postgres_changes` on `INSERT/UPDATE/DELETE`
- **Critical**: Avoid server-side boolean filters in channel subscriptions (causes "mismatch between server and client bindings" error)
- Use client-side filtering instead for stability

### Component Patterns

**ShadCN UI Integration**:
- Copy-paste components from `frontend/src/components/ui/`
- Use `cn()` utility for className merging (`tailwind-merge` + `clsx`)
- Extend with custom variants via `class-variance-authority`
- All components are WCAG 2.1 Level AA accessible

**Form Validation**:
- React Hook Form + Zod for schema validation
- Example: `CitizenReportForm.tsx`, `SystemConfig.tsx`

**Data Fetching**:
- React Query for server state (caching, pagination, optimistic updates)
- Use `placeholderData` to prevent loading flashes
- Use `select` to transform data in queries

### Error Handling

Backend middleware logs errors with full context:
- `backend/python/middleware/error_logger.py` - Logs to `gaia.audit_logs` (system errors and exceptions)
- Activity logging: `backend/python/middleware/activity_logger.py` - Logs user actions to `gaia.activity_logs` (always use schema-qualified names)
- Audit logging: Database triggers for sensitive operations (insert goes to `gaia.audit_logs`)

Frontend error handling:
- ErrorBoundary components wrap major sections
- Toast notifications via `sonner` for user feedback
- Graceful degradation for missing features

## Brand Design System

### Colors (defined in `tailwind.config.js` + `frontend/src/index.css`)
- **Primary (navy)**: `#0A2A4D` — buttons, headings, brand
- **Secondary (steel blue)**: `#005A9C` — links, supporting elements
- **Accent (orange)**: `#FF7A00` — CTAs, highlights
- **Background**: `#F0F4F8` — all page backgrounds (light blue-grey)
- **Text base**: `#334155`

### Typography
- **Sans/primary**: Lato (`font-lato`)
- **Secondary**: Inter (`font-inter`)

### Design Tokens (CSS classes)
- `.bg-auth` — branded page background (F0F4F8 + subtle dot grid)
- `.auth-brand-panel` — navy left panel for auth split layout
- `.animate-fade-in`, `.animate-bounce-slow`, `.status-pulse` — animations
- `.gaia-container`, `.section-py` — layout utilities

### Logo Assets
- Colored: `/assets/img/GAIA.svg` (light backgrounds)
- White: `/assets/img/GAIA-white.svg` (dark backgrounds like `.auth-brand-panel`)

## Testing Strategy

### Unit Tests
- Backend: `pytest tests/python/ --cov=backend/python`
- Frontend: `npm test` (Jest + React Testing Library)
- AI Models: Test ZSC and Geo-NER accuracy against annotated datasets

### Integration Tests
- End-to-End: RSS feed → AI processing → Database → Map visualization
- Citizen Report Flow: Form submission → CAPTCHA → Flagging → Manual triage
- Location: `tests/python/` (backend), `frontend/src/__tests__/` (frontend)

### Security Testing
- StackHawk DAST scanning (via `scripts/test-stackhawk.ps1`)
- All 5 StackHawk security issues fixed (CWE-264, CWE-693, CWE-1021, CWE-200)
- Security headers enforced: CSP, X-Frame-Options, HSTS, X-Content-Type-Options

### Performance Testing
- Time-to-Action (TtA): Measure elapsed time from article publication to map marker
- RSS Processing: ~1 article/sec, >85% classification accuracy, >95% location extraction
- Duplicate Detection: 85-95% accuracy with triple-strategy (URL + content hash + spatial)

## Important Notes

### Frontend Routing

```
/ → LandingPage
/login → Login (AUTH-01)
/register → Register (AUTH-02)
/reset-password → ResetPassword
/update-password → UpdatePassword
/dashboard → UnifiedDashboard (main post-auth shell with ShadCN Sidebar)
/map → PublicMap
/report → CitizenReportForm
/track → ReportTracking
/status → StatusPage
/report-confirmation/:trackingId → ReportConfirmation
```

**Legacy Components** (superseded by UnifiedDashboard):
- `AdminDashboard.tsx` - Deprecated, do NOT use
- `Dashboard.tsx` - Deprecated standalone, do NOT use

### Environment Variables

**Required for Backend** (`backend/.env`):
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `DATABASE_URL` - PostgreSQL connection string
- `RECAPTCHA_SECRET_KEY` - Google reCAPTCHA secret
- `CELERY_BROKER_URL` - Redis URL for Celery (e.g., `redis://redis:6379/0`)
- `CORS_ORIGINS` - Comma-separated allowed origins

**Required for Frontend** (`frontend/.env`):
- `REACT_APP_SUPABASE_URL` - Supabase project URL
- `REACT_APP_SUPABASE_ANON_KEY` - Supabase anon key
- `REACT_APP_API_URL` - Backend API URL (use service name in Docker: `http://backend:8000`)
- `REACT_APP_RECAPTCHA_SITE_KEY` - Google reCAPTCHA site key
- `REACT_APP_MAPBOX_TOKEN` - Mapbox access token (optional)

### Common Pitfalls

1. **Schema Prefixes**: Always use `gaia.` prefix for table names in SQL and queries
2. **Service Names**: In Docker, use container names (`http://backend:8000`), NOT `localhost`
3. **Realtime Filters**: Use client-side filtering, NOT server-side boolean filters in subscriptions
4. **Logo Assets**: Use white logo (`GAIA-white.svg`) on dark backgrounds, colored logo otherwise
5. **Auth Pattern**: All auth pages use split-panel layout (desktop) with `.auth-brand-panel`
6. **Form Validation**: Always use React Hook Form + Zod, never raw form state
7. **Confidence Scores**: ALWAYS display confidence scores alongside AI predictions
8. **Philippine Boundaries**: Only process/display events within Philippine administrative boundaries

### Documentation Requirements

**NEVER create documentation in project root**. Always place docs in appropriate `docs/` subdirectories:
- Setup/config → `docs/setup/`
- Security → `docs/security/`
- Completion logs → `docs/implementation/archive/`
- Analysis → `docs/research/`
- Guides → `docs/guides/`

**Always update** `docs/README.md` when adding new documentation.

## Deployment

### Railway (Production)

```bash
# One-time setup
npm i -g @railway/cli
railway login
railway init

# Deploy
railway up

# View logs
railway logs --service backend
railway logs --service frontend

# View environment
railway environment
```

**Cost Estimate**: ~$65-105/month (Railway: $40-80 + Supabase Pro: $25)

### Vercel + Railway (Recommended)

**Frontend**: Vercel (Global CDN)
**Backend**: Railway (AI/ML workloads)
**Database**: Supabase (managed PostgreSQL + PostGIS)

```bash
# Deploy frontend to Vercel
cd frontend
vercel --prod

# Deploy backend to Railway
railway login
railway init
railway up
```

**Cost Estimate**: ~$25-65/month (Vercel: Free + Railway: $25-65 + Supabase Pro: $25)

See `docs/guides/RAILWAY_DEPLOYMENT.md` for complete deployment instructions.

## Related Documentation

- **[AGENTS.md](AGENTS.md)** - Main AI agent navigation guide for AGAILA
- **[openspec/AGENTS.md](openspec/AGENTS.md)** - OpenSpec workflow instructions
- **[openspec/project.md](openspec/project.md)** - Complete tech stack and conventions
- **[backend/AGENTS.md](backend/AGENTS.md)** - Backend-specific MCP tools and setup
- **[frontend/AGENTS.md](frontend/AGENTS.md)** - Frontend-specific development guide
- **[MODULE_CHECKLIST.md](MODULE_CHECKLIST.md)** - Implementation status tracker
- **[docs/README.md](docs/README.md)** - Complete documentation index
- **[docs/AGAILA_Project-Thesis_Paper.md](docs/AGAILA_Project-Thesis_Paper.md)** - Thesis paper with full methodology and evaluation
- **[docs/guides/RAILWAY_DEPLOYMENT.md](docs/guides/RAILWAY_DEPLOYMENT.md)** - Production deployment guide
- **[docs/guides/DOCKER_GUIDE.md](docs/guides/DOCKER_GUIDE.md)** - Local development setup
- **[docs/security/STACKHAWK_TESTING_GUIDE.md](docs/security/STACKHAWK_TESTING_GUIDE.md)** - Security scanning guide
