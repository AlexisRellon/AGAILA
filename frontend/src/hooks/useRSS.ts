/**
 * RSS Admin API Client and React Query Hooks
 * 
 * API Endpoints from backend/python/rss_admin_api.py:
 * - GET    /api/v1/admin/rss/feeds            - List feeds (30/min)
 * - POST   /api/v1/admin/rss/feeds            - Create feed (10/min)
 * - PATCH  /api/v1/admin/rss/feeds/{id}       - Update feed (20/min)
 * - DELETE /api/v1/admin/rss/feeds/{id}       - Delete feed (10/min)
 * - POST   /api/v1/admin/rss/process          - Process feeds (5/min)
 * - GET    /api/v1/admin/rss/logs             - Get logs (30/min)
 * - GET    /api/v1/admin/rss/statistics       - Get stats (30/min)
 * - GET    /api/v1/admin/rss/feeds/{id}/test  - Test feed (3/min)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import {
  RSSFeed,
  RSSFeedCreate,
  RSSFeedUpdate,
  ProcessingLog,
  RSSStatistics,
  ProcessFeedsRequest,
  TestFeedResult,
  RSSArticle,
  RSSArticlesFilter,
} from '../types/rss';

const API_URL = process.env.REACT_APP_API_URL || '';
const RSS_API_BASE = `${API_URL}/api/v1/admin/rss`;

// ============================================================================
// QUERY KEYS
// ============================================================================

export const rssQueryKeys = {
  all: ['rss'] as const,
  feeds: () => [...rssQueryKeys.all, 'feeds'] as const,
  feed: (id: string) => [...rssQueryKeys.feeds(), id] as const,
  logs: (filters?: { feed_url?: string; status?: string; limit?: number; page?: number }) =>
    [...rssQueryKeys.all, 'logs', filters] as const,
  statistics: () => [...rssQueryKeys.all, 'statistics'] as const,
  currentJob: () => [...rssQueryKeys.all, 'currentJob'] as const,
  feedPerformance: () => [...rssQueryKeys.all, 'feedPerformance'] as const,
  articles: (filters?: RSSArticlesFilter) => [...rssQueryKeys.all, 'articles', filters] as const,
  article: (id: string) => [...rssQueryKeys.all, 'articles', id] as const,
};

// ============================================================================
// API CLIENT FUNCTIONS
// ============================================================================

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const response = await fetch(`${RSS_API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(errorData.detail || 'API request failed');
  }

  // Handle 204 No Content responses (e.g., DELETE requests)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function listFeeds(): Promise<RSSFeed[]> {
  // API returns array directly, not wrapped in { feeds: [] }
  return fetchAPI<RSSFeed[]>('/feeds');
}

async function createFeed(feed: RSSFeedCreate): Promise<RSSFeed> {
  return fetchAPI<RSSFeed>('/feeds', {
    method: 'POST',
    body: JSON.stringify(feed),
  });
}

async function updateFeed(
  id: string,
  updates: RSSFeedUpdate
): Promise<RSSFeed> {
  return fetchAPI<RSSFeed>(`/feeds/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

async function deleteFeed(id: string): Promise<{ message: string }> {
  return fetchAPI<{ message: string }>(`/feeds/${id}`, {
    method: 'DELETE',
  });
}

interface ProcessFeedsResponse {
  status: 'processing' | 'completed' | 'queued';
  message: string;
  feeds_count: number;
  task_id?: string;
  job_id?: string;
  feeds?: Array<{ id: string; name: string }>;
  note?: string;
  results?: unknown[];
}

async function processFeeds(
  request?: ProcessFeedsRequest
): Promise<ProcessFeedsResponse> {
  return fetchAPI<ProcessFeedsResponse>('/process', {
    method: 'POST',
    body: JSON.stringify(request || {}),
  });
}

// Current Job Status Types
export interface ProcessingJob {
  id: string;
  started_by: string | null;
  started_by_email: string;
  started_at: string;
  completed_at: string | null;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
  total_feeds: number;
  processed_feeds: number;
  hazards_detected: number;
  errors_encountered: number;
  error_message: string | null;
  processing_details: Record<string, unknown>;
}

export interface CurrentJobResponse {
  has_running_job: boolean;
  job: ProcessingJob | null;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress?: {
    processed: number;
    total: number;
    hazards: number;
    errors: number;
  };
  last_completed_at?: string;
  message?: string;
}

async function getCurrentJob(): Promise<CurrentJobResponse> {
  return fetchAPI<CurrentJobResponse>('/current-job');
}

// Feed Performance Data for Charts
export interface FeedPerformance {
  id: string;
  name: string;
  feed_url: string;
  hazards: number;
  fetches: number;
}

async function getFeedPerformance(): Promise<FeedPerformance[]> {
  return fetchAPI<FeedPerformance[]>('/feed-performance');
}

async function getLogs(filters?: {
  feed_url?: string;
  status?: string;
  limit?: number;
  page?: number;
  offset?: number;
}): Promise<{ 
  logs: ProcessingLog[]; 
  total: number;
  page: number;
  pages: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}> {
  const params = new URLSearchParams();
  if (filters?.feed_url) params.append('feed_url', filters.feed_url);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());

  return fetchAPI<{ 
    logs: ProcessingLog[]; 
    total: number;
    page: number;
    pages: number;
    limit: number;
    has_next: boolean;
    has_prev: boolean;
  }>(
    `/logs${params.toString() ? `?${params.toString()}` : ''}`
  );
}

async function getStatistics(): Promise<RSSStatistics> {
  return fetchAPI<RSSStatistics>('/statistics');
}

async function testFeed(id: string): Promise<TestFeedResult> {
  return fetchAPI<TestFeedResult>(`/feeds/${id}/test`);
}

// ============================================================================
// REACT QUERY HOOKS
// ============================================================================

/**
 * Fetch all RSS feeds with statistics
 * Cache: 5 minutes stale time
 * Returns empty array as fallback to prevent undefined errors
 */
export function useRSSFeeds() {
  return useQuery({
    queryKey: rssQueryKeys.feeds(),
    queryFn: listFeeds,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    select: (data) => data ?? [], // Ensure we always return an array
    placeholderData: [], // Provide empty array while loading
  });
}

/**
 * Create new RSS feed
 * Invalidates feeds query on success
 */
export function useCreateRSSFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createFeed,
    onSuccess: (newFeed) => {
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      toast.success(`RSS feed "${newFeed.feed_name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create feed: ${error.message}`);
    },
  });
}

/**
 * Update existing RSS feed
 * Uses optimistic updates for better UX
 */
export function useUpdateRSSFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: RSSFeedUpdate }) =>
      updateFeed(id, updates),
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: rssQueryKeys.feeds() });

      // Snapshot previous value
      const previousFeeds = queryClient.getQueryData<RSSFeed[]>(
        rssQueryKeys.feeds()
      );

      // Optimistically update
      if (previousFeeds) {
        queryClient.setQueryData<RSSFeed[]>(
          rssQueryKeys.feeds(),
          previousFeeds.map((feed) =>
            feed.id === id ? { ...feed, ...updates } : feed
          )
        );
      }

      return { previousFeeds };
    },
    onSuccess: (updatedFeed) => {
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      toast.success(`Feed "${updatedFeed.feed_name}" updated`);
    },
    onError: (error: Error, _variables, context) => {
      // Rollback on error
      if (context?.previousFeeds) {
        queryClient.setQueryData(rssQueryKeys.feeds(), context.previousFeeds);
      }
      toast.error(`Update failed: ${error.message}`);
    },
  });
}

/**
 * Delete RSS feed
 * Optimistically removes from UI
 */
export function useDeleteRSSFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFeed,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: rssQueryKeys.feeds() });
      const previousFeeds = queryClient.getQueryData<RSSFeed[]>(
        rssQueryKeys.feeds()
      );

      if (previousFeeds) {
        queryClient.setQueryData<RSSFeed[]>(
          rssQueryKeys.feeds(),
          previousFeeds.filter((feed) => feed.id !== id)
        );
      }

      return { previousFeeds };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.logs() });
      toast.success('Feed deleted successfully');
    },
    onError: (error: Error, _id, context) => {
      if (context?.previousFeeds) {
        queryClient.setQueryData(rssQueryKeys.feeds(), context.previousFeeds);
      }
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

/**
 * Trigger RSS feed processing in background
 * Rate limited: 5/min (AI intensive operation)
 * 
 * Note: This returns immediately - processing happens in the background.
 * Check logs or statistics for results.
 */
export function useProcessRSSFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: processFeeds,
    onSuccess: (data) => {
      // Invalidate related queries (they'll update as background processing completes)
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.logs() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.currentJob() });
      toast.success(`Processing ${data.feeds_count} feeds in background. Check logs for results.`);
    },
    onError: (error: Error) => {
      // Check if error is a 409 conflict (job already running)
      if (error.message.includes('already in progress')) {
        toast.warning('RSS processing is already in progress. Please wait for it to complete.');
      } else {
        toast.error(`Failed to start processing: ${error.message}`);
      }
    },
  });
}

/**
 * Fetch current processing job status
 * Used to check if processing is in progress and disable the button
 */
export function useCurrentProcessingJob() {
  return useQuery({
    queryKey: rssQueryKeys.currentJob(),
    queryFn: getCurrentJob,
    staleTime: 5 * 1000, // 5 seconds - refresh frequently when checking status
    gcTime: 30 * 1000,
    refetchInterval: (query) => {
      // Refetch every 3 seconds if there's a running job, otherwise every 30 seconds
      const data = query.state.data as CurrentJobResponse | undefined;
      return data?.has_running_job ? 3000 : 30000;
    },
  });
}

/**
 * Fetch processing logs with optional filters
 * Cache: 1 minute stale time (logs are time-sensitive)
 */
export function useProcessingLogs(filters?: {
  feed_url?: string;
  status?: string;
  limit?: number;
  page?: number;
}) {
  return useQuery({
    queryKey: rssQueryKeys.logs(filters),
    queryFn: () => getLogs(filters),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
}

/**
 * Fetch RSS statistics
 * Cache: 30 seconds stale time
 */
export function useRSSStatistics() {
  return useQuery({
    queryKey: rssQueryKeys.statistics(),
    queryFn: getStatistics,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
}

/**
 * Fetch feed performance data for charts
 * Returns actual hazard counts per feed from hazards table
 */
export function useFeedPerformance() {
  return useQuery({
    queryKey: rssQueryKeys.feedPerformance(),
    queryFn: getFeedPerformance,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000, // Auto-refetch every minute
  });
}

/**
 * Test RSS feed without saving
 * Rate limited: 3/min
 */
export function useTestRSSFeed() {
  return useMutation({
    mutationFn: testFeed,
    onSuccess: (result) => {
      if (result.status === 'success') {
        toast.success(`Feed test successful: ${result.total_items} items found`);
      } else {
        toast.error(`Feed test failed: ${result.error}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });
}

// ============================================================================
// RSS ARTICLES API CLIENT FUNCTIONS
// ============================================================================

/**
 * Fetch RSS articles via backend API
 * Backend uses service role to bypass RLS
 */
async function fetchRSSArticles(filters?: RSSArticlesFilter): Promise<{
  articles: RSSArticle[];
  total: number;
}> {
  const params = new URLSearchParams();
  
  if (filters?.hazard_type) params.append('hazard_type', filters.hazard_type);
  if (filters?.validated !== undefined) params.append('validated', String(filters.validated));
  if (filters?.source) params.append('source', filters.source);
  if (filters?.limit) params.append('limit', String(filters.limit));
  if (filters?.offset) params.append('offset', String(filters.offset));

  const queryString = params.toString();
  
  // Fetch articles and count in parallel
  const [articlesResponse, countResponse] = await Promise.all([
    fetchAPI<RSSArticle[]>(`/articles${queryString ? `?${queryString}` : ''}`),
    fetchAPI<{ count: number }>(`/articles/count${queryString ? `?${queryString}` : ''}`),
  ]);

  return {
    articles: articlesResponse,
    total: countResponse.count,
  };
}

/**
 * Delete an RSS article via backend API
 */
async function deleteRSSArticle(id: string): Promise<void> {
  await fetchAPI<void>(`/articles/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Bulk delete RSS articles via backend API
 */
async function bulkDeleteRSSArticles(ids: string[]): Promise<{
  deleted_count: number;
  deleted_ids: string[];
  not_found_ids: string[];
}> {
  return fetchAPI<{
    deleted_count: number;
    deleted_ids: string[];
    not_found_ids: string[];
  }>('/articles/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

/**
 * Update an RSS article
 */
export interface ArticleUpdateData {
  status?: 'active' | 'resolved' | 'archived';
  validated?: boolean;
  validation_notes?: string;
  hazard_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

async function updateRSSArticle(
  id: string,
  data: ArticleUpdateData
): Promise<RSSArticle> {
  return fetchAPI<RSSArticle>(`/articles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Validate an RSS article (quick action)
 */
async function validateRSSArticle(
  id: string,
  notes?: string
): Promise<RSSArticle> {
  const params = notes ? `?validation_notes=${encodeURIComponent(notes)}` : '';
  return fetchAPI<RSSArticle>(`/articles/${id}/validate${params}`, {
    method: 'POST',
  });
}

/**
 * Hook to fetch RSS articles with filtering and pagination
 * Cache: 1 minute stale time (articles are time-sensitive)
 */
export function useRSSArticles(filters?: RSSArticlesFilter) {
  return useQuery({
    queryKey: rssQueryKeys.articles(filters),
    queryFn: () => fetchRSSArticles(filters),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds for real-time updates
  });
}

/**
 * Hook to delete a single RSS article
 * Uses optimistic update for immediate UI feedback
 */
export function useDeleteRSSArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRSSArticle,
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: rssQueryKeys.all });

      // Get all article query caches
      const articleQueries = queryClient.getQueriesData<{
        articles: RSSArticle[];
        total: number;
      }>({ queryKey: ['rss', 'articles'] });

      // Optimistically remove from all cached queries
      articleQueries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, {
            articles: data.articles.filter((article) => article.id !== id),
            total: data.total - 1,
          });
        }
      });

      return { articleQueries };
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.articles() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      toast.success('Article deleted successfully');
    },
    onError: (error: Error, _id, context) => {
      // Rollback on error
      if (context?.articleQueries) {
        context.articleQueries.forEach(([queryKey, data]) => {
          if (data) {
            queryClient.setQueryData(queryKey, data);
          }
        });
      }
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

/**
 * Hook to bulk delete RSS articles
 */
export function useBulkDeleteRSSArticles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkDeleteRSSArticles,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.articles() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      toast.success(`${result.deleted_count} article(s) deleted successfully`);
      if (result.not_found_ids.length > 0) {
        toast.warning(`${result.not_found_ids.length} article(s) were not found`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Bulk delete failed: ${error.message}`);
    },
  });
}

/**
 * Hook to update an RSS article
 * Uses optimistic update for immediate UI feedback
 */
export function useUpdateRSSArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ArticleUpdateData }) =>
      updateRSSArticle(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.articles() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      toast.success('Article updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });
}

/**
 * Hook to validate an RSS article (quick action)
 */
export function useValidateRSSArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      validateRSSArticle(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.articles() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      toast.success('Article validated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Validation failed: ${error.message}`);
    },
  });
}
