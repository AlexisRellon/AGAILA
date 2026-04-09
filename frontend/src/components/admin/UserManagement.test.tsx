/**
 * UserManagement Component Tests
 * 
 * Comprehensive test suite for user management CRUD operations,
 * interactions, and state management.
 */

import React from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { vi } from 'vitest';

import UserManagement from './UserManagement';
import { AuthProvider, type UserProfile, type UserRole } from '../../contexts/AuthContext';
import { adminApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';

// Test Fixtures: This password is used only for testing UI form interactions
// NOT a real system password - used to verify form validation and API calls only
const TEST_PASSWORD_FOR_FORM_INPUT = 'SecurePass123';

// Mock dependencies
vi.mock('../../lib/api');
vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock user data
const mockUsers = [
  {
    id: '1',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'master_admin',
    status: 'active',
    organization: 'NDRRMC',
    department: 'IT',
    position: 'Manager',
    last_login: '2024-01-15T10:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    email: 'validator@example.com',
    full_name: 'Validator User',
    role: 'validator',
    status: 'active',
    organization: 'LGU Manila',
    department: 'DRRM',
    position: 'Officer',
    last_login: '2024-01-14T15:30:00Z',
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    email: 'responder@example.com',
    full_name: 'Responder User',
    role: 'lgu_responder',
    status: 'active',
    organization: 'LGU Quezon City',
    department: null,
    position: null,
    last_login: null,
    created_at: '2024-01-03T00:00:00Z',
  },
  {
    id: '4',
    email: 'inactive@example.com',
    full_name: 'Inactive User',
    role: 'lgu_responder',
    status: 'inactive',
    organization: null,
    department: null,
    position: null,
    last_login: null,
    created_at: '2024-01-04T00:00:00Z',
  },
];

// Test wrapper with providers
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

interface MockAuthContextType {
  user: { id: string; email: string } | null;
  userProfile: Omit<UserProfile, 'updated_at'> | null;
  hasRole: (requiredRole: string) => boolean;
  isAdmin: () => boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signUp: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const renderWithProviders = (
  ui: React.ReactElement,
  {
    role = 'master_admin',
    queryClient = createTestQueryClient(),
  }: { role?: string; queryClient?: QueryClient } = {}
) => {
  const mockAuthContext: MockAuthContextType = {
    user: { id: 'test-user', email: 'test@example.com' },
    userProfile: {
      id: 'test-user',
      email: 'test@example.com',
      full_name: 'Test User',
      role: role as UserRole,
      status: 'active',
      organization: 'Test Org',
      department: null,
      position: null,
      last_login: null,
      onboarding_completed: true,
    },
    hasRole: vi.fn((requiredRole: string) => role === requiredRole || role === 'master_admin'),
    isAdmin: vi.fn(() => role === 'master_admin'),
    loading: false,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => {}),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      {/* @ts-expect-error Test mock - using mock auth context */}
      <AuthProvider value={mockAuthContext}>
        {ui}
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('UserManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Supabase realtime subscription
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    (supabase.channel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockChannel);

    // Mock adminApi.users.list
    const listFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(mockUsers);
    adminApi.users.list = listFn as never;
  });

  describe('Rendering and Initial State', () => {
    it('renders without crashing', async () => {
      const { container } = renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(container.innerHTML.length).toBeGreaterThan(0);
      });
    });

    it('displays user management title and description', async () => {
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText(/user management/i)).toBeInTheDocument();
      });
    });

    it('shows loading skeleton while fetching users', () => {
      const listFn: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      adminApi.users.list = listFn as never;

      renderWithProviders(<UserManagement />);
      
      // Should show loading state (TableSkeleton or similar)
      expect(screen.queryByText(/admin@example.com/i)).not.toBeInTheDocument();
    });

    it('renders user table with data after loading', async () => {
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
        expect(screen.getByText('validator@example.com')).toBeInTheDocument();
        expect(screen.getByText('responder@example.com')).toBeInTheDocument();
      });
    });

    it('displays create user button for master admin', async () => {
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create user/i });
        expect(createButton).toBeInTheDocument();
      });
    });

    it('hides create user button for validators', async () => {
      renderWithProviders(<UserManagement />, { role: 'validator' });
      
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Search and Filtering', () => {
    it('filters users by email search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by email/i);
      await user.type(searchInput, 'validator');

      await waitFor(() => {
        expect(screen.getByText('validator@example.com')).toBeInTheDocument();
        expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();
      });
    });

    it('filters users by role', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // Find and click role filter
      const roleFilter = screen.getByRole('combobox', { name: /filter by role/i });
      await user.click(roleFilter);
      
      const validatorOption = screen.getByRole('option', { name: /validator/i });
      await user.click(validatorOption);

      await waitFor(() => {
        expect(adminApi.users.list).toHaveBeenCalledWith(
          expect.objectContaining({ role: 'validator' })
        );
      });
    });

    it('filters users by status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const statusFilter = screen.getByRole('combobox', { name: /filter by status/i });
      await user.click(statusFilter);
      
      const inactiveOption = screen.getByRole('option', { name: /inactive/i });
      await user.click(inactiveOption);

      await waitFor(() => {
        expect(adminApi.users.list).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'inactive' })
        );
      });
    });

    it('combines search and filters', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // Apply role filter
      const roleFilter = screen.getByRole('combobox', { name: /filter by role/i });
      await user.click(roleFilter);
      await user.click(screen.getByRole('option', { name: /lgu_responder/i }));

      // Then search
      const searchInput = screen.getByPlaceholderText(/search by email/i);
      await user.type(searchInput, 'responder');

      await waitFor(() => {
        expect(screen.getByText('responder@example.com')).toBeInTheDocument();
        expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();
      });
    });
  });

  describe('Table Sorting', () => {
    it('sorts users by email column', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const emailHeader = screen.getByRole('columnheader', { name: /email/i });
      await user.click(emailHeader);

      // Verify sorting was triggered (ascending)
      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        // First data row should contain sorted email
        expect(rows[1]).toHaveTextContent(/admin@example.com/i);
      });

      // Click again for descending
      await user.click(emailHeader);

      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        expect(rows[1]).not.toHaveTextContent(/admin@example.com/i);
      });
    });

    it('sorts users by role column', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const roleHeader = screen.getByRole('columnheader', { name: /role/i });
      await user.click(roleHeader);

      await waitFor(() => {
        // Verify table rerendered with sorting
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('displays pagination controls', async () => {
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('navigates to next page', async () => {
      const user = userEvent.setup();
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        ...mockUsers[0],
        id: `user-${i}`,
        email: `user${i}@example.com`,
      }));
      const listFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(manyUsers);
      adminApi.users.list = listFn as never;

      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('user0@example.com')).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(adminApi.users.list).toHaveBeenCalledWith(
          expect.objectContaining({ offset: 10 })
        );
      });
    });

    it('changes page size', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const pageSizeSelect = screen.getByRole('combobox', { name: /rows per page/i });
      await user.click(pageSizeSelect);
      await user.click(screen.getByRole('option', { name: /20/i }));

      await waitFor(() => {
        expect(adminApi.users.list).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 20 })
        );
      });
    });
  });

  describe('Create User Flow', () => {
    it('opens create user dialog when button clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: /create user/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });
    });

    it('validates create user form inputs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: /create user/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Try to submit with invalid data
      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });
    });

    it('creates new user successfully', async () => {
      const user = userEvent.setup();
      const mockCreateUser: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: '5', email: 'new@example.com' });
      adminApi.users.create = mockCreateUser as never;

      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: /create user/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Fill in form
      await user.type(screen.getByLabelText(/email/i), 'new@example.com');
      await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD_FOR_FORM_INPUT);
      await user.type(screen.getByLabelText(/full name/i), 'New User');
      
      const roleSelect = screen.getByRole('combobox', { name: /role/i });
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: /validator/i }));

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'new@example.com',
            password: TEST_PASSWORD_FOR_FORM_INPUT,
            full_name: 'New User',
            role: 'validator',
          })
        );
      });
    });

    it('handles create user API error', async () => {
      const user = userEvent.setup();
      const mockCreateUser: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(new Error('Email already exists'));
      adminApi.users.create = mockCreateUser as never;

      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: /create user/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), 'existing@example.com');
      await user.type(screen.getByLabelText(/password/i), 'SecurePass123');
      await user.type(screen.getByLabelText(/full name/i), 'Existing User');

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email already exists/i)).toBeInTheDocument();
      });
    });
  });

  describe('Update User Role Flow', () => {
    it('opens update role dialog from actions menu', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // Find first row's actions button
      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      await user.click(actionsButtons[0]);

      await waitFor(() => {
        const updateRoleOption = screen.getByRole('menuitem', { name: /update role/i });
        expect(updateRoleOption).toBeInTheDocument();
      });

      await user.click(screen.getByRole('menuitem', { name: /update role/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/update user role/i)).toBeInTheDocument();
      });
    });

    it('updates user role successfully', async () => {
      const user = userEvent.setup();
      const mockUpdateRole: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ success: true });
      adminApi.users.updateRole = mockUpdateRole as never;

      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('validator@example.com')).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      await user.click(actionsButtons[1]); // Second user (validator)

      await user.click(screen.getByRole('menuitem', { name: /update role/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const roleSelect = screen.getByRole('combobox', { name: /new role/i });
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: /lgu_responder/i }));

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateRole).toHaveBeenCalledWith('2', expect.any(Object));
      });
    });
  });

  describe('Deactivate User Flow', () => {
    it('opens deactivate dialog with reason field', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('responder@example.com')).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      await user.click(actionsButtons[2]);

      await user.click(screen.getByRole('menuitem', { name: /deactivate/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
      });
    });

    it('deactivates user successfully', async () => {
      const user = userEvent.setup();
      const mockDeactivate: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ success: true });
      adminApi.users.deactivate = mockDeactivate as never;

      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('responder@example.com')).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      await user.click(actionsButtons[2]);

      await user.click(screen.getByRole('menuitem', { name: /deactivate/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/reason/i), 'User requested account closure');

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /deactivate/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockDeactivate).toHaveBeenCalledWith('3', 'User requested account closure');
      });
    });
  });

  describe('Reactivate User Flow', () => {
    it('shows reactivate option for inactive users', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('inactive@example.com')).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      await user.click(actionsButtons[3]); // Inactive user

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /reactivate/i })).toBeInTheDocument();
      });
    });

    it('reactivates user successfully', async () => {
      const user = userEvent.setup();
      const mockReactivate: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ success: true });
      adminApi.users.reactivate = mockReactivate as never;

      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('inactive@example.com')).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      await user.click(actionsButtons[3]);

      await user.click(screen.getByRole('menuitem', { name: /reactivate/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = within(screen.getByRole('dialog')).getByRole('button', { name: /reactivate/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockReactivate).toHaveBeenCalledWith('4');
      });
    });
  });

  describe('Error States', () => {
    it('displays error message when user fetch fails', async () => {
      const mockError = new Error('Failed to fetch users');
      const listFn: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(mockError);
      adminApi.users.list = listFn as never;

      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to fetch users/i)).toBeInTheDocument();
      });
    });

    it('handles network errors gracefully', async () => {
      const networkError = new Error('Network error');
      const listFn: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(networkError);
      adminApi.users.list = listFn as never;

      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('displays empty state when no users exist', async () => {
      const listFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]);
      adminApi.users.list = listFn as never;

      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText(/no users found/i)).toBeInTheDocument();
      });
    });

    it('displays empty state when filters return no results', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by email/i);
      await user.type(searchInput, 'nonexistent@example.com');

      await waitFor(() => {
        expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();
        expect(screen.getByText(/no users found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Realtime Updates', () => {
    it('subscribes to user_profiles changes on mount', () => {
      renderWithProviders(<UserManagement />);
      
      expect(supabase.channel).toHaveBeenCalledWith('user_profiles_changes');
    });

    it('refetches data when realtime update occurs', async () => {
      const mockChannel: any = {
        on: vi.fn().mockImplementation((event: string, filter: unknown, callback: () => void) => {
          // Immediately trigger callback to simulate realtime event
          setTimeout(() => callback(), 100);
          return mockChannel;
        }),
        subscribe: vi.fn().mockReturnThis(),
      };
      (supabase.channel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockChannel);

      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // Wait for realtime callback to trigger refetch
      await waitFor(() => {
        expect(adminApi.users.list).toHaveBeenCalledTimes(2); // Initial + refetch
      }, { timeout: 500 });
    });

    it('unsubscribes from channel on unmount', () => {
      const mockChannel: any = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      };
      (supabase.channel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockChannel);

      const { unmount } = renderWithProviders(<UserManagement />);
      
      unmount();

      expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
    });
  });

  describe('Responsive Behavior', () => {
    it('renders table on desktop viewport', async () => {
      global.innerWidth = 1024;
      global.dispatchEvent(new Event('resize'));

      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    it('maintains functionality on mobile viewport', async () => {
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      const user = userEvent.setup();
      renderWithProviders(<UserManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // Verify search still works on mobile
      const searchInput = screen.getByPlaceholderText(/search by email/i);
      await user.type(searchInput, 'validator');

      await waitFor(() => {
        expect(screen.getByText('validator@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Permission-Based Rendering', () => {
    it('master_admin sees all action buttons', async () => {
      renderWithProviders(<UserManagement />, { role: 'master_admin' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole('button', { name: /actions/i });
      expect(actionsButtons.length).toBeGreaterThan(0);
    });

    it('validator sees read-only view', async () => {
      renderWithProviders(<UserManagement />, { role: 'validator' });
      
      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // Create button should not exist
      expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      
      // Actions buttons should be disabled or hidden
      const actionsButtons = screen.queryAllByRole('button', { name: /actions/i });
      expect(actionsButtons.length).toBe(0);
    });
  });
});
