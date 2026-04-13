/**
 * Analytics Hooks using React Query
 * 
 * Provides React Query-powered hooks for analytics data:
 * - useHazardStats: Cached hazard statistics
 * - useHazardTrends: Cached trend data with configurable time range
 * - useRegionStats: Cached region statistics
 * - useHazardDistribution: Cached hazard type distribution
 * - useRecentAlerts: Cached recent alerts with configurable limit
 * 
 * Benefits:
 * - 5-minute cache for all analytics data
 * - Automatic request deduplication
 * - Background refetch on stale data
 * - Built-in loading/error states
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { analyticsApi } from '../lib/analyticsApi';
import type {
  HazardStats,
  HazardTrend,
  RegionStats,
  HazardTypeDistribution,
  SourceBreakdown,
  RecentAlert,
} from '../lib/analyticsApi';

/**
 * Fetch hazard statistics (total, active, resolved, unverified, avg confidence)
 * Cached for 5 minutes, automatically refetches when stale
 */
export function useHazardStats() {
  return useQuery<HazardStats, Error>({
    queryKey: queryKeys.analytics.stats(),
    queryFn: () => analyticsApi.getStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes - stats don't change frequently
    gcTime: 30 * 60 * 1000, // 30 minutes cache
    retry: 2, // Retry twice on failure
  });
}

/**
 * Fetch hazard trends over time (last N days)
 * 
 * @param days - Number of days to retrieve (7-90), default 30
 */
export function useHazardTrends(days: number = 30) {
  return useQuery<HazardTrend[], Error>({
    queryKey: queryKeys.analytics.trends(days),
    queryFn: () => analyticsApi.getTrends(days),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Fetch hazard statistics by administrative region
 * Includes hazard count, active count, and average severity per region
 */
export function useRegionStats() {
  return useQuery<RegionStats[], Error>({
    queryKey: queryKeys.analytics.regions(),
    queryFn: () => analyticsApi.getRegionStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Fetch hazard type distribution (count and percentage per type)
 * Useful for pie charts and distribution visualizations
 */
export function useHazardDistribution() {
  return useQuery<HazardTypeDistribution[], Error>({
    queryKey: queryKeys.analytics.distribution(),
    queryFn: () => analyticsApi.getDistribution(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

export function useSourceBreakdown() {
  return useQuery<SourceBreakdown[], Error>({
    queryKey: queryKeys.analytics.sourceBreakdown(),
    queryFn: () => analyticsApi.getSourceBreakdown(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Fetch recent hazard alerts
 * 
 * @param limit - Number of alerts to retrieve (default 10)
 */
export function useRecentAlerts(limit: number = 10) {
  return useQuery<RecentAlert[], Error>({
    queryKey: queryKeys.analytics.recentAlerts(limit),
    queryFn: () => analyticsApi.getRecentAlerts(limit),
    staleTime: 2 * 60 * 1000, // 2 minutes - alerts are more time-sensitive
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    retry: 2,
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes for real-time updates
  });
}

/**
 * Invalidate all analytics queries
 * Useful after manual data refresh or real-time updates
 */
export function useInvalidateAnalytics() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
  };
}