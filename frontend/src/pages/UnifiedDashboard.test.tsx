/* @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeAll, vi } from 'vitest';

import UnifiedDashboard from './UnifiedDashboard';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
    userProfile: {
      id: 'user-1',
      email: 'user@example.com',
      full_name: 'Test User',
      role: 'master_admin',
      status: 'active',
    },
    loading: false,
    signOut: vi.fn(),
    isAdmin: () => true,
    hasRole: () => true,
  }),
}));

vi.mock('../contexts/RSSAutoProcessContext', () => ({
  RSSAutoProcessProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/NotificationsDropdown', () => ({
  NotificationsDropdown: () => <div>notifications</div>,
}));

vi.mock('../components/dashboard/AnalyticsView', () => ({
  default: () => <div>analytics</div>,
}));
vi.mock('../components/admin/UserManagement', () => ({ default: () => <div>users</div> }));
vi.mock('../components/admin/AuditLogViewer', () => ({ default: () => <div>audit</div> }));
vi.mock('../components/admin/SystemConfig', () => ({ default: () => <div>config</div> }));
vi.mock('../components/admin/ReportTriage', () => ({ default: () => <div>triage</div> }));
vi.mock('../components/admin/ActivityMonitor', () => ({ default: () => <div>activity</div> }));
vi.mock('../components/admin/RSSFeedsView', () => ({ default: () => <div>rss</div> }));
vi.mock('../components/admin/AdminOnboarding', () => ({ default: () => null }));
vi.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('UnifiedDashboard', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('shows an authenticated navigation path to update-password', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <UnifiedDashboard />
      </MemoryRouter>
    );

    const changePasswordLink = screen.getByRole('link', { name: /change password/i });
    expect(changePasswordLink.getAttribute('href')).toBe('/update-password');
  });
});