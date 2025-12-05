/**
 * Hazards API Service
 * 
 * PATCH-1.4: Frontend API Client Migration
 * 
 * Replaces direct Supabase client access with calls to our secure backend proxy.
 * This removes the need to expose Supabase credentials in the frontend.
 * 
 * Security Benefits:
 * - No Supabase anon key in browser
 * - All requests go through authenticated backend
 * - Rate limiting enforced server-side
 * - Request logging for audit trail
 * 
 * Modules: GV-02 (Geospatial Visualization), FP-01 to FP-04 (Filtering)
 */

import type { Hazard } from '@/types/hazard';

// API Configuration
const API_URL = process.env.REACT_APP_API_URL || '';
const HAZARDS_API_BASE = `${API_URL}/api/v1/hazards`;

// ============================================================================
// Types
// ============================================================================

export interface HazardResponse {
  id: string;
  hazard_type: string;
  location_name: string;
  latitude: number;
  longitude: number;
  severity: string | null;
  confidence_score: number;
  validated: boolean;
  source_type: string;
  source_url: string | null;
  source_title: string | null;
  source_content: string | null;
  created_at: string;
  validated_at: string | null;
  validated_by: string | null;
}

export interface HazardStatsResponse {
  total_hazards: number;
  validated_hazards: number;
  unvalidated_hazards: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  by_source: Record<string, number>;
  last_24h: number;
  last_7d: number;
  last_30d: number;
}

export interface HazardsQueryParams {
  hazard_types?: string[];
  source_types?: string[];
  validated?: boolean;
  min_confidence?: number;
  severity?: string[];
  time_window_hours?: number;
  region?: string;
  province?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Build query string from params object
 */
function buildQueryString(params: HazardsQueryParams): string {
  const searchParams = new URLSearchParams();
  
  if (params.hazard_types?.length) {
    searchParams.append('hazard_types', params.hazard_types.join(','));
  }
  if (params.source_types?.length) {
    searchParams.append('source_types', params.source_types.join(','));
  }
  if (params.validated !== undefined) {
    searchParams.append('validated', String(params.validated));
  }
  if (params.min_confidence !== undefined) {
    searchParams.append('min_confidence', String(params.min_confidence));
  }
  if (params.severity?.length) {
    searchParams.append('severity', params.severity.join(','));
  }
  if (params.time_window_hours !== undefined) {
    searchParams.append('time_window_hours', String(params.time_window_hours));
  }
  if (params.region) {
    searchParams.append('region', params.region);
  }
  if (params.province) {
    searchParams.append('province', params.province);
  }
  if (params.limit !== undefined) {
    searchParams.append('limit', String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.append('offset', String(params.offset));
  }
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Fetch hazards from backend proxy API
 * 
 * Replaces: supabase.from('hazards').select('*')...
 */
export async function fetchHazards(
  params: HazardsQueryParams = {}
): Promise<HazardResponse[]> {
  const queryString = buildQueryString(params);
  
  const response = await fetch(`${HAZARDS_API_BASE}/${queryString}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include auth cookies if present
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(errorData.detail || 'Failed to fetch hazards');
  }
  
  return response.json();
}

/**
 * Fetch validated hazards for public map display
 * 
 * Replaces: supabase.from('hazards').select('*').eq('validated', true)...
 */
export async function fetchValidatedHazards(
  options: {
    limit?: number;
    timeWindowHours?: number;
    hazardTypes?: string[];
  } = {}
): Promise<HazardResponse[]> {
  const params: HazardsQueryParams = {
    validated: true,
    limit: options.limit || 1000, // Default to max limit to show all hazards
  };
  
  // Only include time_window_hours if explicitly provided
  if (options.timeWindowHours !== undefined) {
    params.time_window_hours = options.timeWindowHours;
  }
  
  // Only include hazard_types if provided
  if (options.hazardTypes && options.hazardTypes.length > 0) {
    params.hazard_types = options.hazardTypes;
  }
  
  return fetchHazards(params);
}

/**
 * Fetch a single hazard by ID
 * 
 * Replaces: supabase.from('hazards').select('*').eq('id', id).single()
 */
export async function fetchHazardById(id: string): Promise<HazardResponse> {
  const response = await fetch(`${HAZARDS_API_BASE}/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Hazard not found: ${id}`);
    }
    const errorData = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(errorData.detail || 'Failed to fetch hazard');
  }
  
  return response.json();
}

/**
 * Fetch hazard statistics
 * 
 * Replaces: Multiple supabase queries for counts
 */
export async function fetchHazardStats(): Promise<HazardStatsResponse> {
  const response = await fetch(`${HAZARDS_API_BASE}/stats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(errorData.detail || 'Failed to fetch hazard stats');
  }
  
  return response.json();
}

/**
 * Fetch nearby hazards using geospatial query
 * 
 * Replaces: supabase.rpc('get_nearby_hazards', {...})
 */
export async function fetchNearbyHazards(
  latitude: number,
  longitude: number,
  options: {
    radiusKm?: number;
    limit?: number;
  } = {}
): Promise<HazardResponse[]> {
  const params = new URLSearchParams();
  if (options.radiusKm) {
    params.append('radius_km', String(options.radiusKm));
  }
  if (options.limit) {
    params.append('limit', String(options.limit));
  }
  
  const queryString = params.toString();
  const url = `${HAZARDS_API_BASE}/nearby/${latitude}/${longitude}${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(errorData.detail || 'Failed to fetch nearby hazards');
  }
  
  return response.json();
}

// ============================================================================
// React Query Hooks (optional - for components using TanStack Query)
// ============================================================================

/**
 * Query keys for React Query cache management
 */
export const hazardsQueryKeys = {
  all: ['hazards'] as const,
  lists: () => [...hazardsQueryKeys.all, 'list'] as const,
  list: (params: HazardsQueryParams) => [...hazardsQueryKeys.lists(), params] as const,
  details: () => [...hazardsQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...hazardsQueryKeys.details(), id] as const,
  stats: () => [...hazardsQueryKeys.all, 'stats'] as const,
  nearby: (lat: number, lon: number, radius?: number) => 
    [...hazardsQueryKeys.all, 'nearby', lat, lon, radius] as const,
};

// ============================================================================
// Compatibility Layer (for gradual migration)
// ============================================================================

/**
 * Convert API response to match existing Hazard type
 * Use this during migration to maintain compatibility with existing components
 */
export function mapApiResponseToHazard(response: HazardResponse): Hazard {
  return {
    id: response.id,
    hazard_type: response.hazard_type,
    location_name: response.location_name,
    latitude: response.latitude,
    longitude: response.longitude,
    severity: response.severity || 'unknown',
    confidence_score: response.confidence_score,
    validated: response.validated,
    source_type: response.source_type as 'rss' | 'citizen_report',
    source_url: response.source_url || undefined,
    source_title: response.source_title || undefined,
    source_content: response.source_content || undefined,
    created_at: response.created_at,
    validated_at: response.validated_at || undefined,
    validated_by: response.validated_by || undefined,
  };
}

/**
 * Fetch validated hazards with compatibility mapping
 * Drop-in replacement for existing supabase queries in components
 */
export async function fetchValidatedHazardsCompat(
  options: {
    limit?: number;
    timeWindowHours?: number;
    hazardTypes?: string[];
  } = {}
): Promise<Hazard[]> {
  const responses = await fetchValidatedHazards(options);
  return responses.map(mapApiResponseToHazard);
}
