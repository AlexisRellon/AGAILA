<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open @/openspec/AGENTS.md when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use @/openspec/AGENTS.md to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

---

# AGAILA: Geospatial AI-driven Assessment - Copilot Instructions

## Project Overview
AGAILA (A Framework Integrating Zero-Shot Classification and Geo-NER for Natural Hazard Detection) is a Philippine-focused environmental hazard detection system. It leverages Zero-Shot Classification (ZSC) via large language models (e.g., DeBERTa-MNLI, ClimateNLI) and Geospatial Named Entity Recognition (Geo-NER) to automatically detect and locate natural hazards from online information streams (RSS feeds, news articles, citizen reports) and real-time PWA map visualization.AGAILA reduces the "Time-to-Action" during crises by providing near real-time, geocoded environmental intelligence for LGUs, NDRRMC, and emergency responders.


**CRITICAL DEVELOPMENT CONTEXT**: All development is conducted within Docker containers. Every feature, proposal, and implementation must account for:
- Docker Compose orchestration of services (backend, frontend, Supabase)
- Container-based networking (use service names, not localhost)
- Volume mounts for live code reload during development
- Environment variable configuration via \docker-compose.yml\ and \.env\ files
- Containerized testing workflows (\pytest\, \
pm test\ run inside containers)
- Heroku deployment using Docker containers (Heroku Container Registry)

## Architecture
- **Data Ingestion Layer**: RSS aggregates, Citizen submissions, Reference data.
- **Core Processing Layer**: Preprocessing -> Climate-NLI (hazard type) -> Geo-NER (location) -> PostGIS Validation.
- **Presentation Layer**: React / Tailwind / Leaflet PWA with real-time UI.

## Module Codes (For branches/commits)
- \AUTH-0x\: Authentication/Registration
- \CD-01\: Dashboard/Command Interface
- \GV-0x\: Geospatial Visualization
- \FP-0x\: Filtering Panel
- \RG-0x\: Report Generation
- \AC-0x\: Admin Console
- \CR-0x\: Citizen Report
- \UM-0x\: User Management
- \AAM-0x\: Advanced Analytics
- \EDI-0x\: External Data Integration

## OpenSpec Workflow
When starting new features: check [MODULE_CHECKLIST.md](MODULE_CHECKLIST.md) and [openspec/project.md](openspec/project.md). Create change proposals under [openspec/changes/](openspec/changes/).

## Documentation Guidelines
Create docs in [docs/](docs/) ([docs/setup/](docs/setup/), [docs/security/](docs/security/), [docs/implementation/archive/](docs/implementation/archive/), [docs/research/](docs/research/), [docs/guides/](docs/guides/)). Update [docs/README.md](docs/README.md). No new files in root (except MODULE_CHECKLIST.md, README.md, and AGENTS.md).

## MCP Tools Integration
- **Upstash Context7 MCP**: Up-to-date SDK docs (Supabase, Leaflet, PostGIS, Transformers, FastAPI).
- **Supabase MCP**: Deploy edge functions, manage migrations, execute SQL, generate TypeScript types.
- **Hugging Face MCP**: Model discovery & docs (DeBERTa-v3, Climate-NLI, spaCy-NER for Geo-NER).
- **StackHawk MCP**: Security scanning for API endpoints (DAST scans).
- **GitHub MCP**: Issue/PR management, commit automation, branch operations.
- **Figma MCP** (optional): Connect designs to React components.

## Testing & Build Commands
### Docker Environment
```bash
# Run Python tests in container
docker-compose run backend pytest tests/python/ --cov=backend/python

# Run frontend tests in container
docker-compose run frontend npm test --coverage

# Test Docker builds before deployment
docker build -f Dockerfile.backend -t gaia-backend .
docker build -f Dockerfile.frontend -t gaia-frontend .
```

See [backend/AGENTS.md](backend/AGENTS.md) and [frontend/AGENTS.md](frontend/AGENTS.md) for detailed domain instructions.
