# Frontend Agent Instructions

## Context
You are working in the **frontend** directory of the GAIA project. This is a React + TypeScript PWA for Philippine hazard visualization.

## Quick Navigation

### 🎯 Primary Instructions
**Start here**: `./frontend/COPILOT_INSTRUCTIONS.md` - Complete frontend MCP tools guide

### 📚 Additional Resources
- **Project Overview**: `../.github/copilot-instructions.md` - Full GAIA architecture and conventions
- **Full-Stack Workflows**: `../.github/copilot-mcp-workflows.md` - Cross-stack integration patterns
- **MCP Tools Reference**: `../.github/copilot-mcp-tools.md` - All available MCP tools
- **OpenSpec Workflow**: `../openspec/AGENTS.md` - For major architectural changes

## Frontend Tech Stack

### Core Technologies
- **Framework**: React 18 + TypeScript
- **Styling**: TailwindCSS + ShadCN UI components
- **Mapping**: Leaflet/Mapbox for geospatial visualization
- **Real-time**: Supabase Client for live updates
- **State Management**: React hooks + Context API
- **Forms**: React Hook Form + Zod validation
- **Testing**: Jest + React Testing Library
- **Build**: Create React App (Docker containerized)

### Environment
- **Development**: Docker Compose (`docker-compose up frontend`)
- **Port**: 3000
- **Hot Reload**: Enabled via volume mounts
- **Service Name**: `frontend` (use in API calls, not localhost)

## Primary MCP Tools for Frontend

### 1. 🎨 Figma MCP
**Use for**: Design-to-code conversion, extracting design tokens

**Quick Commands**:
```bash
@figma get-design-context nodeId="123:456"
@figma get-variable-defs nodeId="123:456"
@figma get-screenshot nodeId="123:456"
```

**When to use**:
- Implementing UI from Figma designs (GV-0x, FP-0x, CR-0x modules)
- Creating map markers, dialogs, forms
- Building dashboard layouts

### 2. 🧩 ShadCN MCP
**Use for**: Discovering and installing UI components

**Quick Commands**:
```bash
@shadcn search query="form input table" registries=['@shadcn']
@shadcn get-examples query="form-demo" registries=['@shadcn']
@shadcn get-add-command items=['@shadcn/form', '@shadcn/input']
```

**When to use**:
- Building forms, tables, dialogs
- Before creating custom components (check if exists first)
- Implementing consistent UI patterns

### 3. 📖 Context7 MCP
**Use for**: Up-to-date library documentation

**Quick Commands**:
```bash
@context7 resolve-library-id libraryName="leaflet"
@context7 get-library-docs context7CompatibleLibraryID="/leaflet/leaflet" topic="markers clustering"
```

**When to use**:
- Learning Leaflet/Mapbox APIs
- Understanding React hooks patterns
- Implementing TailwindCSS utilities
- Supabase Client integration

### 4. 🔒 StackHawk MCP
**Use for**: Frontend security testing

**Quick Commands**:
```bash
@stackhawk setup app_name="GAIA-Frontend"
@stackhawk get-scan-instructions config_path="frontend/stackhawk.yml"
@stackhawk get-app-findings config_path="frontend/stackhawk.yml"
```

**When to use**:
- Before deploying citizen forms
- Testing authentication flows
- Validating XSS prevention
- Checking CSP headers

## Module Focus Areas

### GV-0x: Geospatial Visualization
- Interactive Leaflet maps
- Marker clustering (react-leaflet-cluster)
- Custom hazard markers with popups
- Map layers and controls
- Real-time marker updates

**Key Files**:
- `src/components/map/`
- `src/pages/Dashboard.tsx`

### FP-0x: Filtering Panel
- Hazard type selectors (checkboxes)
- Region/province dropdowns
- Time range pickers
- Source filters (RSS/Citizen)
- Filter state management

**Key Files**:
- `src/components/filter/`
- `src/hooks/useFilters.ts`

### CR-0x: Citizen Report
- Submission form with validation
- reCAPTCHA v3 integration
- Image upload (Supabase Storage)
- Real-time submission status
- Error handling

**Key Files**:
- `src/components/citizen-report/`
- `src/services/supabase.ts`

### CD-01: Dashboard/Command Interface
- Main layout with map + filters
- Real-time hazard feed
- Statistics cards
- Quick actions panel

**Key Files**:
- `src/pages/Dashboard.tsx`
- `src/components/dashboard/`

### AUTH-0x: Authentication
- Login/Register forms
- Password reset flow
- Role-based UI (show/hide based on user role)
- Session management

**Key Files**:
- `src/components/auth/`
- `src/hooks/useAuth.ts`

### RG-0x: Report Generation
- CSV/GeoJSON export
- PDF report generation
- Data table with sorting/filtering
- Export UI components

**Key Files**:
- `src/components/reports/`
- `src/utils/export.ts`

## Common Frontend Workflows

### Workflow 1: Implement UI from Figma
```bash
# 1. Extract design
@figma get-design-context nodeId="[node-id]"

# 2. Search for components
@shadcn search query="[component-type]" registries=['@shadcn']

# 3. Install components
docker-compose run frontend npx shadcn@latest add [component]

# 4. Implement + test in ComponentShowcase
docker-compose up frontend

# 5. Security scan
@stackhawk get-app-findings
```

### Workflow 2: Add Real-time Feature
```bash
# 1. Get Supabase docs
@context7 get-library-docs context7CompatibleLibraryID="/supabase/supabase" topic="realtime subscriptions"

# 2. Implement subscription in component
# 3. Test real-time updates
# 4. Handle connection errors
```

### Workflow 3: Integrate Map Feature
```bash
# 1. Get Leaflet docs
@context7 get-library-docs context7CompatibleLibraryID="/leaflet/leaflet" topic="[feature]"

# 2. Implement in src/components/map/
# 3. Test with sample data
# 4. Optimize performance (clustering, lazy loading)
```

## Development Commands

```bash
# Start development server
docker-compose up frontend

# Install npm packages
docker-compose run frontend npm install [package]

# Install ShadCN components
docker-compose run frontend npx shadcn@latest add [component]

# Run tests
docker-compose run frontend npm test

# Run tests with coverage
docker-compose run frontend npm test -- --coverage

# Build for production
docker-compose run frontend npm run build

# Lint code
docker-compose run frontend npm run lint

# Format code
docker-compose run frontend npm run format
```

## Testing Checklist

Before committing frontend code:

- [ ] **Component Tests**: `npm test` passes
- [ ] **Visual Testing**: Added to `ComponentShowcase.tsx`
- [ ] **Responsive**: Tested mobile (375px), tablet (768px), desktop (1440px)
- [ ] **Accessibility**: ARIA labels, keyboard navigation, color contrast
- [ ] **Security Scan**: `@stackhawk get-app-findings`
- [ ] **Performance**: Lighthouse PWA score > 90
- [ ] **Real-time**: Verified live updates work
- [ ] **Error Handling**: Loading states, error boundaries, user feedback

## File Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/              # ShadCN components
│   │   ├── map/             # GV-0x: Map components
│   │   ├── filter/          # FP-0x: Filter components
│   │   ├── citizen-report/  # CR-0x: Report form
│   │   ├── dashboard/       # CD-01: Dashboard components
│   │   ├── auth/            # AUTH-0x: Auth components
│   │   └── reports/         # RG-0x: Report generation
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ComponentShowcase.tsx
│   │   └── ...
│   ├── services/
│   │   └── supabase.ts      # Supabase client
│   ├── hooks/               # Custom React hooks
│   ├── lib/
│   │   └── utils.ts         # Utility functions
│   └── ...
├── public/
│   ├── index.html
│   └── manifest.json        # PWA manifest
├── components.json          # ShadCN config
├── tailwind.config.js       # TailwindCSS config
└── package.json
```

## Environment Variables

```bash
# frontend/.env
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_PUBLIC=
REACT_APP_API_URL=http://backend:8000  # Use service name in Docker
REACT_APP_MAPBOX_TOKEN=
REACT_APP_RECAPTCHA_SITE_KEY=
```

## Common Pitfalls

1. ❌ **Don't use localhost in API calls**
   - Use `process.env.REACT_APP_API_URL` or service name `backend`

2. ❌ **Don't skip input sanitization**
   - Use DOMPurify for user-generated content

3. ❌ **Don't hardcode colors**
   - Use TailwindCSS classes or Figma design tokens

4. ❌ **Don't forget loading/error states**
   - Use Suspense and Error Boundaries

5. ❌ **Don't skip accessibility**
   - Add ARIA labels, keyboard navigation, focus management

## Quick Links

- **Current Directory**: `/frontend`
- **Backend Guide**: `../backend/AGENTS.md`
- **Root Navigation**: `../AGENTS.md`
- **Main Instructions**: `COPILOT_INSTRUCTIONS.md` ⭐

---

**When in doubt**: Open `COPILOT_INSTRUCTIONS.md` for detailed MCP tool workflows and examples specific to frontend development.
