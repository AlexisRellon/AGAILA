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

# GAIA: Geospatial AI-driven Assessment - Copilot Instructions

## Project Overview
GAIA is a Philippine-focused environmental hazard detection system using Zero-Shot Classification (Climate-NLI) and Geo-NER to process RSS feeds and citizen reports, visualizing hazards on a real-time PWA map.

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
When starting new features: check \MODULE_CHECKLIST.md\ and check \openspec/project.md\. Create change proposals under \openspec/changes/[id]\.

## Documentation Guidelines
Create docs in \docs/\ (\docs/setup/\, \docs/security/\, \docs/implementation/archive/\, \docs/research/\, \docs/guides/\). Update \docs/README.md\. No new files in root.

## MCP Tools Integration
- **Figma MCP**: Connect designs in React components.
- **Hugging Face MCP**: Model discovery & docs (Climate-NLI/NER).
- **StackHawk MCP**: Security scanning for API endpoints.
- **Supabase MCP**: Deploy edge functions & perform DB ops.
- **Upstash Context7 MCP**: Use for up-to-date SDK docs (Supabase, Leaflet, PostGIS).

## Testing & Build Commands
### Docker Environment
\\\ash
# Run Python tests in container
docker-compose run backend pytest tests/python/ --cov=backend/python

# Run frontend tests in container
docker-compose run frontend npm test --coverage

# Test Docker builds before deployment
docker build -f Dockerfile.backend -t gaia-backend .
docker build -f Dockerfile.frontend -t gaia-frontend .
\\\

See \ackend/AGENTS.md\ and \rontend/AGENTS.md\ for detailed domain instructions.
