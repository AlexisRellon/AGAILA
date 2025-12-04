# GAIA Frontend

Progressive Web App (PWA) for the Geospatial AI-driven Assessment (GAIA) system - a Philippine-focused environmental hazard detection platform.

## Table of Contents

- [Overview](#overview)
- [Landing Page](#landing-page)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)

## Overview

The GAIA frontend is a React-based Progressive Web App that provides:
- **Public Landing Page**: Marketing and information page introducing GAIA's capabilities
- **Interactive Hazard Map**: Real-time visualization of environmental hazards (future)
- **Command Dashboard**: LGU responder interface for triage and response (future)
- **Citizen Report Form**: Public submission interface for hazard reports (future)

## Landing Page

The landing page (`/`) is the primary entry point for new users, designed based on Figma specifications (node-id: 96:984).

### Sections

1. **Header** - Navigation bar with logo, tagline, and CTA buttons
2. **Hero** - Main headline with animated background, decorative hazard pins, and CTAs
3. **Features** - Three-column showcase of core components (AI Classification, Geo-NER, Dashboard)
4. **How It Works** - Four-step workflow explanation with arrow separators
5. **Product Showcase** - Grid of AI-generated assessment previews
6. **Social Proof** - Target audience messaging for LGU responders
7. **CTA** - Final call-to-action for demo requests
8. **Footer** - Branding, navigation, contact, and institutional affiliations

### Assets

All landing page assets are stored in `/public/assets/img/`:

```
assets/img/
├── GAIA.svg              # Primary logo (color)
├── GAIA-white.svg        # White logo for dark backgrounds
├── background.png        # Hero section combined grid + heatmap
├── Pin-*.svg             # Hazard pin icons (volcano, flood, earthquake, landslide)
├── arrow-right.svg       # Workflow step separator arrow
├── lpu-c_logo.png        # Lyceum of the Philippines University - Cavite logo
└── A-stars-logo.svg      # A-STARS logo
```

Asset paths are centrally managed in `src/constants/landingAssets.ts`.

### Customization

To update landing page content:

1. **Text Content**: Edit section component files in `src/components/landing/`
   - Example: `HeroSection.tsx` for hero headline
   - Example: `FeaturesSection.tsx` for feature descriptions

2. **Images**: Replace files in `/public/assets/img/` and update `landingAssets.ts`

3. **Styling**: Modify TailwindCSS classes in component files
   - Design tokens (colors, typography) defined in `tailwind.config.js`
   - Uses Lato font family from Google Fonts (weights: 400, 700, 800, 900)

4. **Routing**: Update `src/App.tsx` for new routes

## Tech Stack

### Core Framework
- **React 18.2** - UI framework
- **TypeScript 4.9** - Type safety
- **React Router 6.20** - Client-side routing

### Styling
- **TailwindCSS 3.3** - Utility-first CSS framework
- **ShadCN UI** - Accessible component library (Radix UI primitives)
- **Lato Font** - Google Fonts (primary typeface)

### State Management
- **React Hooks** - Built-in state management
- **Supabase Client** - Backend integration (future)

### Development Tools
- **Create React App** - Build tooling
- **TypeScript ESLint** - Code linting
- **Testing Library** - Component testing

## Project Structure

```
frontend/
├── public/
│   ├── assets/
│   │   └── img/           # Landing page images and logos
│   ├── index.html         # HTML template with Lato font import
│   └── manifest.json      # PWA manifest
├── src/
│   ├── components/
│   │   ├── landing/       # Landing page section components
│   │   │   ├── Header.tsx
│   │   │   ├── HeroSection.tsx
│   │   │   ├── FeaturesSection.tsx
│   │   │   ├── HowItWorksSection.tsx
│   │   │   ├── ProductShowcaseSection.tsx
│   │   │   ├── SocialProofSection.tsx
│   │   │   ├── CTASection.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── index.ts
│   │   └── ui/            # ShadCN UI components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── badge.tsx
│   │       └── ...
│   ├── pages/
│   │   ├── LandingPage.tsx      # Landing page orchestrator
│   │   └── ComponentShowcase.tsx # UI component demo
│   ├── constants/
│   │   └── landingAssets.ts     # Asset path registry
│   ├── lib/
│   │   └── utils.ts             # Utility functions
│   ├── App.tsx                   # Root component with routing
│   ├── index.tsx                 # React entry point
│   └── index.css                 # Global styles
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── tailwind.config.js     # TailwindCSS configuration

```

## Getting Started

### Prerequisites

- **Docker Desktop** - For containerized development
- **Node.js 18+** (optional, for local development)
- **npm** (comes with Node.js)

### Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/AlexisRellon/GAIA.git
   cd TerraSentinel
   ```

2. **Install dependencies** (local development):
   ```bash
   cd frontend
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   # Copy .env.example to .env (from project root)
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

4. **Start Docker containers** (recommended):
   ```bash
   # From project root
   docker-compose up -d
   ```
   - Frontend will be available at `http://localhost:3000`
   - Hot reload enabled (changes to `src/` and `public/` auto-reload)

### Local Development (without Docker)

```bash
cd frontend
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

### Available Scripts

In the `frontend/` directory:

- `npm start` - Start development server (port 3000)
- `npm test` - Run Jest tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run build` - Create production build
- `npm run lint` - Run ESLint

### Docker Commands

From project root:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f frontend

# Restart frontend only
docker-compose restart frontend

# Rebuild after dependency changes
docker-compose up -d --build frontend

# Run tests in container
docker-compose run --rm frontend npm test -- --watchAll=false

# Stop all services
docker-compose down
```

### Adding New Components

1. **UI Components** (reusable):
   ```bash
   # Create in src/components/ui/
   # Follow ShadCN UI patterns
   ```

2. **Page Sections**:
   ```bash
   # Create in src/components/landing/
   # Export from index.ts for clean imports
   ```

3. **New Pages**:
   ```bash
   # Create in src/pages/
   # Add route in src/App.tsx
   ```

### Design System

**Colors** (defined in `tailwind.config.js`):
- Primary: `#0A2A4D` (Navy blue)
- Secondary: `#005A9C` (Deep blue)
- Accent: `#FF7A00` (Orange)
- Text: `#334155` (Slate gray)
- Background: `#F0F4F8` (Light blue-gray)

**Typography** (Lato font family):
- H1: 61px, Black (900)
- H2: 39px, ExtraBold (800)
- H3-H5: 20-24px, Bold (700)
- Body: 16px, Regular (400)
- Endnote: 13px, Regular (400)

## Testing

### Unit Tests

```bash
# Run tests (watch mode)
npm test

# Run once with coverage
npm test -- --coverage --watchAll=false

# In Docker
docker-compose run --rm frontend npm test -- --watchAll=false
```

### Test Structure

```
tests/frontend/
├── components/
│   └── App.test.tsx           # App routing tests
└── [future component tests]
```

### Writing Tests

Example component test:

```tsx
import { render, screen } from '@testing-library/react';
import { HeroSection } from '../components/landing/HeroSection';

test('renders hero headline', () => {
  render(<HeroSection />);
  const headline = screen.getByText(/Empower Your Response/i);
  expect(headline).toBeInTheDocument();
});
```

## Deployment

### Production Build

```bash
# Local build
npm run build

# Docker build
docker build -f Dockerfile.frontend --target production -t gaia-frontend:prod .
```

### Railway Deployment

The project is deployed on Railway using Docker containers. For complete deployment instructions, see [`docs/guides/RAILWAY_DEPLOYMENT.md`](../docs/guides/RAILWAY_DEPLOYMENT.md).

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway up --service frontend

# View logs
railway logs --service frontend
```

**Environment Variables** (set in Railway Dashboard or `railway.toml`):
- `REACT_APP_SUPABASE_URL` - Supabase project URL
- `REACT_APP_SUPABASE_ANON_PUBLIC` - Supabase anonymous/publishable token (public)
- `REACT_APP_API_URL` - Backend API URL (e.g., `https://backend.up.railway.app`)
- `REACT_APP_MAPBOX_TOKEN` - Mapbox access token (for maps, future)
- `REACT_APP_RECAPTCHA_SITE_KEY` - reCAPTCHA site key

### Static Hosting

The production build can be served from any static host (Vercel, Netlify, AWS S3, etc.):

```bash
npm run build
# Deploy contents of build/ directory
```

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Android)

## Accessibility

- WCAG 2.1 Level AA compliant
- Semantic HTML (header, section, nav, footer)
- Keyboard navigation support
- Alt text for all images
- Color contrast ratios ≥4.5:1

## Performance

Target metrics:
- First Contentful Paint (FCP): <2s
- Largest Contentful Paint (LCP): <2.5s
- Cumulative Layout Shift (CLS): <0.1
- Lighthouse score: >90

## Future Features

- [ ] Interactive hazard map with Leaflet/Mapbox
- [ ] Real-time hazard notifications (Supabase Realtime)
- [ ] Citizen report submission form
- [ ] LGU responder dashboard
- [ ] Admin console for triage and validation
- [ ] Offline PWA capabilities

## Troubleshooting

### Common Issues

1. **Port 3000 already in use**:
   ```bash
   # Find and kill process
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

2. **Container not updating after code changes**:
   ```bash
   # Check if volume mount is working
   docker-compose logs frontend
   # Restart container
   docker-compose restart frontend
   ```

3. **Missing dependencies in container**:
   ```bash
   # Rebuild container
   docker-compose up -d --build frontend
   ```

4. **Tests failing**:
   ```bash
   # Clear cache
   npm test -- --clearCache
   # Reinstall dependencies
   rm -rf node_modules package-lock.json
   npm install
   ```

## Contributing

1. Create a feature branch from `main`
2. Follow naming convention: `feature/MODULE-XX-description`
3. Use module codes (GV-0x, FP-0x, CR-0x, etc.) in commit messages
4. Write tests for new components
5. Update documentation for new features
6. Submit pull request for review

## License

This project is part of an undergraduate thesis at Lyceum of the Philippines University - Cavite. All rights reserved.

## Contact

For questions or support, contact the GAIA development team:
- Email: contact@gaia-assessment.com.ph
- Repository: https://github.com/AlexisRellon/GAIA

---

**GAIA** - *Geospatial AI-driven Assessment*  
*Empower Your Response. Protect Your Community.*
