/* @vitest-environment jsdom */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import UpdatePassword from './UpdatePassword';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  supabaseAuthMock: {
    getSession: vi.fn(),
    setSession: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    verifyOtp: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: mocks.supabaseAuthMock,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigateMock,
    Link: ({ to, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

describe('UpdatePassword recovery link handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/update-password');

    mocks.supabaseAuthMock.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.supabaseAuthMock.setSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.supabaseAuthMock.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.supabaseAuthMock.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.supabaseAuthMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('uses hash access_token/refresh_token recovery flow', async () => {
    window.history.pushState(
      {},
      '',
      '/update-password#access_token=token-123&refresh_token=refresh-123&type=recovery'
    );

    render(<UpdatePassword />);

    await waitFor(() => {
      expect(mocks.supabaseAuthMock.setSession).toHaveBeenCalledWith({
        access_token: 'token-123',
        refresh_token: 'refresh-123',
      });
    });
  });

  it('uses query code recovery flow via exchangeCodeForSession', async () => {
    window.history.pushState({}, '', '/update-password?code=abc123');

    render(<UpdatePassword />);

    await waitFor(() => {
      expect(mocks.supabaseAuthMock.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    });
  });

  it('redirects to reset-password when no valid recovery context exists', async () => {
    mocks.supabaseAuthMock.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<UpdatePassword />);

    await waitFor(() => {
      expect(mocks.navigateMock).toHaveBeenCalledWith('/reset-password', { replace: true });
    });
  });
});
