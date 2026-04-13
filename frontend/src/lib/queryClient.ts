/**
 * React Query Client Configuration
 * 
 * Centralized QueryClient setup with optimized caching strategies:
 * - 5-minute stale time for analytics data
 * - 30-minute garbage collection time
 * - Disabled refetch on window focus (reduces unnecessary API calls)
 * - Built-in request deduplication (prevents React Strict Mode double-fetch)
 * - Retry logic for failed requests
 * 
 * Security: All queries require authentication via AuthContext
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000, // 5 minutes

      // Cache persists for 30 minutes after last use
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)

      // Disable automatic refetch on window focus (reduces API spam)
      refetchOnWindowFocus: false,

      // Refetch on mount only if data is stale
      refetchOnMount: true,

      // Refetch on reconnect only if data is stale
      refetchOnReconnect: true,

      // Retry failed requests up to 3 times with exponential backoff
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx errors (client errors)
        const errorWithStatus = error as { status?: number };
        if (errorWithStatus?.status && errorWithStatus.status >= 400 && errorWithStatus.status < 500) {
          return false;
        }
        // Retry up to 3 times for 5xx errors (server errors)
        return failureCount < 3;
      },

      // Exponential backoff: 1s, 2s, 4s
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      
      // Retry delay for mutations: 1 second
      retryDelay: 1000,
    },
  },
});

// Export query key factories for type-safe key management
export const queryKeys = {
  // Auth queries
  auth: {
    all: ['auth'] as const,
    currentUser: () => ['auth', 'user'] as const,
    user: () => ['auth', 'user'] as const,
    profile: (userId: string | undefined) => ['auth', 'profile', userId] as const,
  },
  
  // Analytics queries
  analytics: {
    all: () => ['analytics'] as const,
    stats: () => ['analytics', 'stats'] as const,
    trends: (days: number) => ['analytics', 'trends', days] as const,
    regions: () => ['analytics', 'regions'] as const,
    distribution: () => ['analytics', 'distribution'] as const,
    sourceBreakdown: () => ['analytics', 'source-breakdown'] as const,
    recentAlerts: (limit: number) => ['analytics', 'recent-alerts', limit] as const,
  },
  
  // Admin queries
  admin: {
    users: (limit?: number) => ['admin', 'users', limit] as const,
    auditLogs: (limit?: number) => ['admin', 'audit-logs', limit] as const,
    systemConfig: () => ['admin', 'system-config'] as const,
    triageQueue: (limit?: number) => ['admin', 'triage', limit] as const,
  },
  
  // Hazard queries
  hazards: {
    all: () => ['hazards'] as const,
    list: (filters?: Record<string, unknown>) => ['hazards', 'list', filters] as const,
    detail: (id: string) => ['hazards', 'detail', id] as const,
    byRegion: (region: string) => ['hazards', 'region', region] as const,
  },
  
  // RSS queries
  rss: {
    all: () => ['rss'] as const,
    feeds: () => ['rss', 'feeds'] as const,
    feed: (id: string) => ['rss', 'feeds', id] as const,
    logs: (filters?: { feed_url?: string; status?: string; limit?: number }) =>
      ['rss', 'logs', filters] as const,
    statistics: () => ['rss', 'statistics'] as const,
  },
} as const;