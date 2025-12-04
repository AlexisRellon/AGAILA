# GAIA Frontend Development - MCP Tools Guide

## Documentation Guidelines

**CRITICAL**: When creating documentation for frontend work:

- **Component guides** → `docs/guides/FRONTEND_*.md`
- **Setup documentation** → `docs/setup/FRONTEND_*.md`
- **Security findings** → `docs/security/FRONTEND_SECURITY_*.md`
- **Completion reports** → `docs/implementation/archive/*_COMPLETE.md`
- **UI/UX analysis** → `docs/research/*_ANALYSIS.md`

**NEVER** create `.md` files in:
- Project root (except MODULE_CHECKLIST.md, README.md, AGENTS.md)
- `frontend/` directory (except this file and frontend/AGENTS.md)

Always update `docs/README.md` when adding new documentation.

## Frontend-Specific Context
You are working in the **frontend** folder of the GAIA project, a React + TypeScript PWA for Philippine hazard visualization.

**Tech Stack**:
- React 18 + TypeScript
- TailwindCSS + ShadCN UI components
- Leaflet/Mapbox for mapping
- Supabase Client for real-time data
- Docker containerized development

**Module Focus**:
- `GV-0x`: Geospatial Visualization (maps, markers, layers)
- `FP-0x`: Filtering Panel (hazard/region/time/source)
- `CR-0x`: Citizen Report (submission forms)
- `CD-01`: Dashboard/Command Interface
- `AUTH-0x`: Authentication/Registration
- `RG-0x`: Report Generation (export features)

## Primary MCP Tools for Frontend

### 1. Figma MCP - Design-to-Code Workflow

#### When to Use
- Implementing new UI components from design mockups
- Creating map marker designs (GV-02)
- Building filter panels (FP-01, FP-02)
- Designing citizen report forms (CR-01)
- Dashboard layouts (CD-01)

#### Step-by-Step Workflow

**Step 1: Extract Design from Figma**
```bash
# Get node ID from Figma URL
# URL format: https://figma.com/design/:fileKey/:fileName?node-id=123-456
# Extract nodeId as "123:456"

@figma get-design-context nodeId="123:456" clientFrameworks="react" clientLanguages="typescript"
```

**Step 2: Get Design Tokens**
```bash
# Extract colors, spacing, typography
@figma get-variable-defs nodeId="123:456"
```

**Step 3: Generate Screenshot for Reference**
```bash
@figma get-screenshot nodeId="123:456"
```

**Step 4: Check Code Connect Mappings**
```bash
# See if component already exists in codebase
@figma get-code-connect-map nodeId="123:456"
```

#### Example: Implementing Map Marker Component (GV-02)
```typescript
// 1. Extract design
@figma get-design-context nodeId="789:101" clientFrameworks="react" clientLanguages="typescript"

// 2. Create component file
// src/components/map/HazardMarker.tsx

import React from 'react';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface HazardMarkerProps {
  hazardType: string;
  confidence: number;
  location: [number, number];
  timestamp: string;
}

export const HazardMarker: React.FC<HazardMarkerProps> = ({
  hazardType,
  confidence,
  location,
  timestamp
}) => {
  // Apply Figma design tokens
  const markerColor = getHazardColor(hazardType); // From Figma variables
  
  return (
    <Marker position={location}>
      <Popup>
        <Card className="p-4">
          <Badge variant={getVariant(confidence)}>{hazardType}</Badge>
          <p className="text-sm text-muted-foreground">
            Confidence: {(confidence * 100).toFixed(1)}%
          </p>
          <time className="text-xs">{timestamp}</time>
        </Card>
      </Popup>
    </Marker>
  );
};

// 3. Test in ComponentShowcase.tsx
// 4. Integrate with Leaflet map in Dashboard
```

### 2. ShadCN MCP - Component Discovery & Integration

#### When to Use
- Building forms (input, textarea, select)
- Creating data tables (hazard list, admin console)
- Implementing dialogs and modals
- Adding navigation tabs
- Building alert/notification systems

#### Step-by-Step Workflow

**Step 1: Search for Components**
```bash
@shadcn search query="form input select" registries=['@shadcn'] limit=10
```

**Step 2: View Usage Examples**
```bash
@shadcn get-examples query="form-demo" registries=['@shadcn']
```

**Step 3: Get Install Command**
```bash
@shadcn get-add-command items=['@shadcn/form', '@shadcn/input', '@shadcn/select']
```

**Step 4: Install in Docker Container**
```bash
# Run in Docker frontend container
docker-compose run frontend npx shadcn@latest add form input select
```

**Step 5: Import and Use**
```typescript
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
```

#### Example: Citizen Report Form (CR-01)
```typescript
// 1. Search for form components
@shadcn search query="form validation" registries=['@shadcn']

// 2. Get examples
@shadcn get-examples query="form-demo" registries=['@shadcn']

// 3. Install components
// docker-compose run frontend npx shadcn@latest add form input textarea select button

// 4. Create form component
// src/components/citizen-report/ReportForm.tsx

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const reportSchema = z.object({
  hazardType: z.string().min(1, 'Hazard type is required'),
  location: z.string().min(3, 'Location must be specific'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  contactInfo: z.string().email().optional(),
});

export const CitizenReportForm: React.FC = () => {
  const form = useForm({
    resolver: zodResolver(reportSchema),
  });

  const onSubmit = async (data: z.infer<typeof reportSchema>) => {
    // Submit to Supabase Edge Function
    // Include reCAPTCHA v3 token
    // Flag as "Unverified" (30% confidence)
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="hazardType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hazard Type</FormLabel>
              <Select {...field}>
                {/* Dynamic hazard types from Supabase */}
              </Select>
            </FormItem>
          )}
        />
        {/* More fields... */}
        <Button type="submit">Submit Report</Button>
      </form>
    </Form>
  );
};
```

### 3. Context7 MCP - Documentation & Best Practices

#### When to Use
- Learning Leaflet/Mapbox APIs
- Understanding React hooks patterns
- Implementing TailwindCSS utilities
- Working with Supabase Client
- Integrating third-party libraries

#### Step-by-Step Workflow

**Step 1: Resolve Library ID**
```bash
@context7 resolve-library-id libraryName="leaflet"
@context7 resolve-library-id libraryName="react-leaflet"
@context7 resolve-library-id libraryName="tailwindcss"
```

**Step 2: Get Documentation**
```bash
@context7 get-library-docs context7CompatibleLibraryID="/leaflet/leaflet" topic="interactive markers clustering"
```

**Step 3: Apply to Implementation**
```typescript
// Use documentation to implement feature
```

#### Example: Implementing Marker Clustering (GV-03)
```bash
# 1. Get documentation
@context7 resolve-library-id libraryName="react-leaflet-cluster"
@context7 get-library-docs context7CompatibleLibraryID="/react-leaflet/react-leaflet" topic="marker clustering performance"

# 2. Install in Docker
docker-compose run frontend npm install react-leaflet-cluster

# 3. Implement
# src/components/map/ClusteredHazardMap.tsx
```

```typescript
import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { HazardMarker } from './HazardMarker';

interface ClusteredHazardMapProps {
  hazards: Hazard[];
}

export const ClusteredHazardMap: React.FC<ClusteredHazardMapProps> = ({ hazards }) => {
  return (
    <MapContainer
      center={[12.8797, 121.774]} // Philippines center
      zoom={6}
      className="h-screen w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <MarkerClusterGroup>
        {hazards.map((hazard) => (
          <HazardMarker key={hazard.id} {...hazard} />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
};
```

### 4. StackHawk MCP - Frontend Security Testing

#### When to Use
- Before deploying citizen submission forms
- Testing authentication flows
- Validating API endpoint security
- Checking for XSS vulnerabilities
- Ensuring HTTPS/CSP headers

#### Step-by-Step Workflow

**Step 1: Set Up StackHawk**
```bash
@stackhawk setup app_name="GAIA-Frontend" org_id="your-org-id"
```

**Step 2: Configure stackhawk.yml**
```yaml
# frontend/stackhawk.yml
app:
  applicationId: ${STACKHAWK_APP_ID}
  env: Development
  host: http://localhost:3000

hawk:
  spider:
    base: true
  ajax:
    spider: true

# Test authenticated routes
authentication:
  usernamePassword:
    type: form
    loginPath: /auth/login
    usernameField: email
    passwordField: password
```

**Step 3: Run Security Scan**
```bash
@stackhawk get-scan-instructions config_path="frontend/stackhawk.yml"

# Run in Docker
docker-compose run frontend hawk scan frontend/stackhawk.yml
```

**Step 4: Review Findings**
```bash
@stackhawk get-app-findings config_path="frontend/stackhawk.yml"
```

**Step 5: Fix Vulnerabilities**
- XSS: Sanitize user inputs
- CSRF: Add CSRF tokens
- CSP: Configure Content Security Policy headers

#### Example: Securing Citizen Report Form (CR-01)
```typescript
// 1. Run security scan
@stackhawk get-scan-instructions config_path="frontend/stackhawk.yml"

// 2. Review findings
@stackhawk get-app-findings config_path="frontend/stackhawk.yml"

// 3. Fix XSS vulnerabilities
import DOMPurify from 'dompurify';

const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
};

// In form submission
const onSubmit = async (data: ReportFormData) => {
  const sanitized = {
    ...data,
    description: sanitizeInput(data.description),
    location: sanitizeInput(data.location),
  };
  
  // Add reCAPTCHA token
  const token = await executeRecaptcha('submit_report');
  
  await supabase.functions.invoke('submit-citizen-report', {
    body: { ...sanitized, recaptchaToken: token }
  });
};

// 4. Add CSP headers in index.html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self' https://www.google.com/recaptcha/; ..." />

// 5. Re-run security scan
```

## Frontend-Specific Workflows

### Workflow 1: Complete UI Feature (Figma → ShadCN → Testing)

**Example: Filter Panel (FP-01)**

```bash
# Step 1: Extract Figma Design
@figma get-design-context nodeId="[filter-panel-node]" clientFrameworks="react" clientLanguages="typescript"
@figma get-variable-defs nodeId="[filter-panel-node]"

# Step 2: Find ShadCN Components
@shadcn search query="select checkbox radio button" registries=['@shadcn']
@shadcn get-examples query="select-demo" registries=['@shadcn']

# Step 3: Install Components
@shadcn get-add-command items=['@shadcn/select', '@shadcn/checkbox', '@shadcn/button']
docker-compose run frontend npx shadcn@latest add select checkbox button

# Step 4: Implement Component
# src/components/filter/HazardFilterPanel.tsx
```

```typescript
import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FilterState {
  hazardTypes: string[];
  regions: string[];
  timeRange: string;
  sources: string[];
}

export const HazardFilterPanel: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>({
    hazardTypes: [],
    regions: [],
    timeRange: '24h',
    sources: ['RSS', 'Citizen'],
  });

  const applyFilters = () => {
    // Update map markers based on filters
    // Emit filter change event
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold mb-2">Hazard Type</h3>
        {['Flood', 'Typhoon', 'Earthquake', 'Landslide'].map((type) => (
          <div key={type} className="flex items-center space-x-2">
            <Checkbox
              checked={filters.hazardTypes.includes(type)}
              onCheckedChange={(checked) => {
                // Update filters.hazardTypes
              }}
            />
            <label>{type}</label>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-semibold mb-2">Region</h3>
        <Select value={filters.regions[0]} onValueChange={(value) => {
          // Update filters.regions
        }}>
          <SelectTrigger>
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ncr">National Capital Region</SelectItem>
            <SelectItem value="region3">Region III</SelectItem>
            {/* More regions */}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={applyFilters} className="w-full">
        Apply Filters
      </Button>
    </Card>
  );
};
```

```bash
# Step 5: Test Component
# Add to src/pages/ComponentShowcase.tsx
docker-compose up frontend
# Visit http://localhost:3000/showcase

# Step 6: Security Test
@stackhawk get-scan-instructions
docker-compose run frontend hawk scan frontend/stackhawk.yml
```

### Workflow 2: Real-time Data Integration

**Example: Live Hazard Updates (GV-01, CD-01)**

```bash
# Step 1: Get Supabase Documentation
@context7 get-library-docs context7CompatibleLibraryID="/supabase/supabase" topic="realtime subscriptions"

# Step 2: Implement Supabase Client
# src/services/supabase.ts
```

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
// Use the public/anon token name without 'KEY'
const supabaseAnonPublic = process.env.REACT_APP_SUPABASE_ANON_PUBLIC || process.env.REACT_APP_SUPABASE_ANON!;

export const supabase = createClient(supabaseUrl, supabaseAnonPublic);

// Subscribe to hazard updates
export const subscribeToHazards = (callback: (hazard: Hazard) => void) => {
  return supabase
    .channel('hazards')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'hazards',
      },
      (payload) => {
        callback(payload.new as Hazard);
      }
    )
    .subscribe();
};
```

```bash
# Step 3: Integrate in Map Component
# src/components/map/LiveHazardMap.tsx
```

```typescript
import React, { useEffect, useState } from 'react';
import { subscribeToHazards } from '@/services/supabase';
import { ClusteredHazardMap } from './ClusteredHazardMap';
import { toast } from 'sonner';

export const LiveHazardMap: React.FC = () => {
  const [hazards, setHazards] = useState<Hazard[]>([]);

  useEffect(() => {
    // Subscribe to real-time updates
    const subscription = subscribeToHazards((newHazard) => {
      setHazards((prev) => [...prev, newHazard]);
      
      // Show notification
      toast(`New ${newHazard.hazardType} detected in ${newHazard.location}`, {
        description: `Confidence: ${(newHazard.confidence * 100).toFixed(1)}%`,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <ClusteredHazardMap hazards={hazards} />;
};
```

### Workflow 3: Export & Report Generation (RG-01, RG-02)

```bash
# Step 1: Search for table component
@shadcn search query="data table export" registries=['@shadcn']
@shadcn get-examples query="table-demo" registries=['@shadcn']

# Step 2: Install components
docker-compose run frontend npx shadcn@latest add table

# Step 3: Implement export functionality
# src/components/reports/HazardExport.tsx
```

```typescript
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export const HazardExport: React.FC<{ hazards: Hazard[] }> = ({ hazards }) => {
  const exportToCSV = () => {
    const csv = [
      ['Hazard Type', 'Location', 'Coordinates', 'Confidence', 'Timestamp'].join(','),
      ...hazards.map((h) =>
        [h.hazardType, h.location, `${h.lat},${h.lng}`, h.confidence, h.timestamp].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hazards-${new Date().toISOString()}.csv`;
    a.click();
  };

  const exportToGeoJSON = () => {
    const geojson = {
      type: 'FeatureCollection',
      features: hazards.map((h) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [h.lng, h.lat],
        },
        properties: {
          hazardType: h.hazardType,
          location: h.location,
          confidence: h.confidence,
          timestamp: h.timestamp,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: 'application/geo+json',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hazards-${new Date().toISOString()}.geojson`;
    a.click();
  };

  return (
    <div className="flex gap-2">
      <Button onClick={exportToCSV} variant="outline">
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
      <Button onClick={exportToGeoJSON} variant="outline">
        <Download className="mr-2 h-4 w-4" />
        Export GeoJSON
      </Button>
    </div>
  );
};
```

## Testing Checklist

### Before Committing Frontend Code

1. **Component Tests**
   ```bash
   docker-compose run frontend npm test
   ```

2. **Visual Testing**
   - Add to ComponentShowcase.tsx
   - Test in browser: http://localhost:3000/showcase

3. **Responsive Design**
   - Test mobile (375px), tablet (768px), desktop (1440px)
   - Use Chrome DevTools device emulation

4. **Accessibility**
   - Check ARIA labels
   - Test keyboard navigation
   - Verify color contrast

5. **Security Scan**
   ```bash
   @stackhawk get-app-findings config_path="frontend/stackhawk.yml"
   ```

6. **Performance**
   - Lighthouse audit (target: >90 PWA score)
   - Check bundle size: npm run build --report

## Docker Commands Reference

```bash
# Start frontend dev server
docker-compose up frontend

# Install npm packages
docker-compose run frontend npm install [package]

# Install ShadCN components
docker-compose run frontend npx shadcn@latest add [component]

# Run tests
docker-compose run frontend npm test

# Build production
docker-compose run frontend npm run build

# Lint code
docker-compose run frontend npm run lint
```

## Common Pitfalls

1. **Don't use localhost in API calls**: Use service names or environment variables
   ```typescript
   // ❌ Wrong
   fetch('http://localhost:8000/api/hazards')
   
   // ✅ Correct
   fetch(`${process.env.REACT_APP_API_URL}/api/hazards`)
   ```

2. **Always sanitize user inputs**: Use DOMPurify for XSS prevention

3. **Don't hardcode colors**: Use TailwindCSS classes or Figma design tokens

4. **Always handle loading/error states**: Use Suspense and Error Boundaries

5. **Don't skip accessibility**: Add ARIA labels, keyboard navigation

## Quick Reference

### MCP Tools Priority for Frontend
1. **Figma MCP** - Design extraction
2. **ShadCN MCP** - Component discovery
3. **Context7 MCP** - Documentation
4. **StackHawk MCP** - Security testing

### File Locations
- Components: `src/components/[feature]/`
- Pages: `src/pages/`
- Services: `src/services/`
- Utils: `src/lib/`
- Tests: `src/components/[feature]/*.test.tsx`

### Environment Variables
```bash
# frontend/.env
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_PUBLIC=
REACT_APP_API_URL=
REACT_APP_MAPBOX_TOKEN=
REACT_APP_RECAPTCHA_SITE_KEY=
```

---

**Next Steps**: See `.github/copilot-mcp-workflows.md` for full-stack integration patterns.
