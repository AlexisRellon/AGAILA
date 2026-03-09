/**
 * API Client Configuration
 * 
 * Centralized API client with authentication headers and base URL configuration.
 * All backend API calls should use this client for consistent error handling.
 */

import { supabase } from './supabase';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Makes an authenticated API request to the backend
 * Automatically includes JWT token from Supabase session
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Get current session token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('No active session. Please log in.');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `API Error: ${response.status}`);
  }

  return response.json();
}

/**
 * Admin API Client - all admin dashboard endpoints
 */
export const adminApi = {
  // User Management
  users: {
    list: (params?: {
      role?: string;
      status?: string;
      organization?: string;
      limit?: number;
      offset?: number;
    }) => {
      const queryParams = new URLSearchParams();
      if (params?.role) queryParams.append('role', params.role);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.organization) queryParams.append('organization', params.organization);
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      
      const queryString = queryParams.toString();
      return apiRequest(`/api/v1/admin/users${queryString ? `?${queryString}` : ''}`);
    },

    create: (userData: {
      email: string;
      password: string;
      full_name: string;
      role: string;
      organization?: string;
      department?: string;
      position?: string;
    }) => apiRequest('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

    updateRole: (userId: string, role: string) => apiRequest(`/api/v1/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

    deactivate: (userId: string, reason?: string) => apiRequest(`/api/v1/admin/users/${userId}/deactivate`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

    reactivate: (userId: string, reason?: string) => apiRequest(`/api/v1/admin/users/${userId}/reactivate`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

    resetPassword: (userId: string, newPassword: string) => apiRequest(`/api/v1/admin/users/${userId}/reset-password`, {
      method: 'PATCH',
      body: JSON.stringify({ new_password: newPassword }),
    }),
  },

  // Audit Logs
  auditLogs: {
    list: (params?: {
      user_email?: string;
      action?: string;
      resource_type?: string;
      start_date?: string;
      end_date?: string;
      success?: boolean;
      limit?: number;
      offset?: number;
    }) => {
      const queryParams = new URLSearchParams();
      if (params?.user_email) queryParams.append('user_email', params.user_email);
      if (params?.action) queryParams.append('action', params.action);
      if (params?.resource_type) queryParams.append('resource_type', params.resource_type);
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);
      if (params?.success !== undefined) queryParams.append('success', params.success.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      
      const queryString = queryParams.toString();
      return apiRequest(`/api/v1/admin/audit-logs${queryString ? `?${queryString}` : ''}`);
    },
  },

  // System Configuration
  config: {
    list: () => apiRequest('/api/v1/admin/system-config'),
    
    update: (key: string, value: string) => apiRequest(`/api/v1/admin/system-config/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    }),
  },

  // Report Triage
  reports: {
    triage: (params?: {
      status_filter?: string;
      hazard_type?: string;
      min_confidence?: number;
      max_confidence?: number;
      limit?: number;
      offset?: number;
    }) => {
      const queryParams = new URLSearchParams();
      if (params?.status_filter) queryParams.append('status_filter', params.status_filter);
      if (params?.hazard_type) queryParams.append('hazard_type', params.hazard_type);
      if (params?.min_confidence) queryParams.append('min_confidence', params.min_confidence.toString());
      if (params?.max_confidence) queryParams.append('max_confidence', params.max_confidence.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      
      const queryString = queryParams.toString();
      return apiRequest(`/api/v1/admin/reports/triage${queryString ? `?${queryString}` : ''}`);
    },

    validate: (
      trackingId: string,
      payload?: { notes?: string | null; latitude?: number; longitude?: number }
    ) => {
      const body: Record<string, unknown> = {};
      if (payload?.notes !== undefined) body.notes = payload.notes;
      if (payload?.latitude !== undefined) body.latitude = payload.latitude;
      if (payload?.longitude !== undefined) body.longitude = payload.longitude;

      return apiRequest(`/api/v1/admin/reports/${trackingId}/validate`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    reject: (trackingId: string, payload: { reason: string; notes?: string | null }) => {
      const body: Record<string, unknown> = { reason: payload.reason };
      if (payload.notes !== undefined) {
        body.notes = payload.notes;
      }

      return apiRequest(`/api/v1/admin/reports/${trackingId}/reject`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },
};
