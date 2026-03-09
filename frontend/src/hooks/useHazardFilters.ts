/**
 * useHazardFilters Hook
 * 
 * Custom React hook for managing hazard filter state with:
 * - URL query parameter synchronization
 * - localStorage persistence
 * - Client-side filter application logic
 * 
 * Module: FP-01, FP-03, FP-04
 * Change: add-advanced-map-features
 * 
 * Usage:
 * ```tsx
 * const { filters, updateFilters, resetFilters, applyFilters } = useHazardFilters();
 * const filteredHazards = applyFilters(allHazards);
 * ```
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TimeWindow = 'all' | '24h' | '7d' | '30d' | 'custom';
export type SourceType = 'rss_feed' | 'citizen_verified' | 'citizen_unverified';

export interface CustomDateRange {
  start: Date;
  end: Date;
}

export interface FilterState {
  hazardTypes: string[];
  timeWindow: TimeWindow;
  customDateRange?: CustomDateRange;
  sourceTypes: SourceType[];
  severities: string[];
}

export interface Hazard {
  id: string;
  hazard_type: string;
  severity: string;
  location_name: string;
  latitude: number;
  longitude: number;
  confidence_score: number;
  source_type: string;
  validated: boolean;
  created_at: string;
  source_content?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'gaia_hazard_filters';

const DEFAULT_FILTERS: FilterState = {
  hazardTypes: [],
  timeWindow: 'all',
  customDateRange: undefined,
  sourceTypes: ['rss_feed', 'citizen_verified'],
  severities: [],
};

// All available hazard types
export const ALL_HAZARD_TYPES = [
  'flood',
  'typhoon',
  'landslide',
  'earthquake',
  'volcanic_eruption',
  'storm_surge',
  'tsunami',
  'fire',
  'drought',
  'heat_wave',
  'heavy_rain',
  'other',
];

// All available severities
export const ALL_SEVERITIES = ['critical', 'severe', 'moderate', 'minor'];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate date range based on time window
 */
function getDateRange(timeWindow: TimeWindow, customRange?: CustomDateRange): { start: Date; end: Date } | null {
  const now = new Date();
  
  switch (timeWindow) {
    case '24h':
      return {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        end: now,
      };
    case '7d':
      return {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: now,
      };
    case '30d':
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: now,
      };
    case 'custom':
      return customRange || null;
    case 'all':
    default:
      return null;
  }
}

/**
 * Map source to source type category
 */
function mapSourceToType(source: string, validated: boolean): SourceType {
  const src = (source || '').toLowerCase();

  if (['gma_news', 'abs_cbn', 'inquirer', 'rappler', 'philstar'].includes(src)) {
    return 'rss_feed';
  }

  if (src.includes('citizen')) {
    return validated ? 'citizen_verified' : 'citizen_unverified';
  }

  return 'rss_feed';
}

/**
 * Parse filters from URL query parameters
 */
function parseFiltersFromURL(searchParams: URLSearchParams): Partial<FilterState> {
  const filters: Partial<FilterState> = {};
  
  // Parse hazard types
  const types = searchParams.get('types');
  if (types) {
    filters.hazardTypes = types.split(',').filter(t => ALL_HAZARD_TYPES.includes(t));
  }
  
  // Parse time window
  const time = searchParams.get('time');
  if (time && ['all', '24h', '7d', '30d', 'custom'].includes(time)) {
    filters.timeWindow = time as TimeWindow;
  }
  
  // Parse custom date range
  if (time === 'custom') {
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (start && end) {
      filters.customDateRange = {
        start: new Date(start),
        end: new Date(end),
      };
    }
  }
  
  // Parse source types
  const sources = searchParams.get('source');
  if (sources) {
    filters.sourceTypes = sources.split(',').filter(s => 
      ['rss_feed', 'citizen_verified', 'citizen_unverified'].includes(s)
    ) as SourceType[];
  }
  
  // Parse severities
  const severities = searchParams.get('severity');
  if (severities) {
    filters.severities = severities.split(',').filter(s => ALL_SEVERITIES.includes(s));
  }
  
  return filters;
}

/**
 * Serialize filters to URL query parameters
 */
function serializeFiltersToURL(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  
  // Add hazard types
  if (filters.hazardTypes.length > 0) {
    params.set('types', filters.hazardTypes.join(','));
  }
  
  // Add time window
  if (filters.timeWindow !== 'all') {
    params.set('time', filters.timeWindow);
  }
  
  // Add custom date range
  if (filters.timeWindow === 'custom' && filters.customDateRange) {
    // Use local date formatting to avoid timezone conversion issues
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    params.set('start', formatLocalDate(filters.customDateRange.start));
    params.set('end', formatLocalDate(filters.customDateRange.end));
  }
  
  // Add source types
  if (filters.sourceTypes.length > 0 && filters.sourceTypes.length < 3) {
    params.set('source', filters.sourceTypes.join(','));
  }
  
  // Add severities
  if (filters.severities.length > 0 && filters.severities.length < ALL_SEVERITIES.length) {
    params.set('severity', filters.severities.join(','));
  }
  
  return params;
}

/**
 * Load filters from localStorage
 */
function loadFiltersFromStorage(): Partial<FilterState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      
      // Reconstruct Date objects for custom range
      if (parsed.customDateRange) {
        parsed.customDateRange = {
          start: new Date(parsed.customDateRange.start),
          end: new Date(parsed.customDateRange.end),
        };
      }
      
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load filters from localStorage:', err);
  }
  
  return {};
}

/**
 * Save filters to localStorage
 */
function saveFiltersToStorage(filters: FilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (err) {
    console.error('Failed to save filters to localStorage:', err);
  }
}

/**
 * Clear filters from localStorage
 */
function clearFiltersFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear filters from localStorage:', err);
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useHazardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isInitializedRef = useRef(false);

  // Initialize state from URL params or localStorage on first render
  const [filters, setFilters] = useState<FilterState>(() => {
    const urlFilters = parseFiltersFromURL(searchParams);
    const hasUrlFilters = searchParams.toString().length > 0;

    if (hasUrlFilters) {
      return { ...DEFAULT_FILTERS, ...urlFilters };
    }

    const storedFilters = loadFiltersFromStorage();
    return { ...DEFAULT_FILTERS, ...storedFilters };
  });

  // Mark as initialized after first render
  useEffect(() => {
    isInitializedRef.current = true;
  }, []);

  // Sync URL → state when search params change externally (e.g. back/forward nav)
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const urlFilters = parseFiltersFromURL(searchParams);
    const hasUrlFilters = searchParams.toString().length > 0;

    if (hasUrlFilters) {
      setFilters(prev => {
        const next = { ...DEFAULT_FILTERS, ...urlFilters };
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    }
  }, [searchParams]);

  // Sync state → URL and localStorage whenever filters change
  useEffect(() => {
    if (!isInitializedRef.current) return;

    saveFiltersToStorage(filters);

    const newParams = serializeFiltersToURL(filters);
    const currentParamsStr = searchParams.toString();
    const newParamsStr = newParams.toString();

    if (currentParamsStr !== newParamsStr) {
      setSearchParams(newParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  /**
   * Update filters (partial update)
   * Uses setState directly — no navigation cycle triggered synchronously
   */
  const updateFilters = useCallback((updates: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Reset filters to defaults
   */
  const resetFilters = useCallback(() => {
    clearFiltersFromStorage();
    setFilters({ ...DEFAULT_FILTERS });
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  /**
   * Apply filters to hazard array (client-side filtering)
   */
  const applyFilters = useCallback((hazards: Hazard[]): Hazard[] => {
    return hazards.filter(hazard => {
      // Filter by hazard type
      if (filters.hazardTypes.length > 0 && !filters.hazardTypes.includes(hazard.hazard_type)) {
        return false;
      }
      
      // Filter by severity
      if (filters.severities.length > 0 && !filters.severities.includes(hazard.severity)) {
        return false;
      }
      
      // Filter by time window
      const dateRange = getDateRange(filters.timeWindow, filters.customDateRange);
      if (dateRange) {
        const hazardDate = new Date(hazard.created_at);
        if (hazardDate < dateRange.start || hazardDate > dateRange.end) {
          return false;
        }
      }
      
      // Filter by source type
      if (filters.sourceTypes.length > 0) {
        const hazardSourceType = mapSourceToType(hazard.source_type, hazard.validated);
        if (!filters.sourceTypes.includes(hazardSourceType)) {
          return false;
        }
      }
      
      return true;
    });
  }, [filters]);

  /**
   * Count active filters
   */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    
    if (filters.hazardTypes.length > 0) count++;
    if (filters.severities.length > 0) count++;
    if (filters.timeWindow !== 'all') count++;
    if (filters.sourceTypes.length > 0 && filters.sourceTypes.length < 3) count++;
    
    return count;
  }, [filters]);

  /**
   * Check if filters are at default state
   */
  const isDefault = useMemo(() => {
    return (
      filters.hazardTypes.length === 0 &&
      filters.severities.length === 0 &&
      filters.timeWindow === 'all' &&
      filters.sourceTypes.length === DEFAULT_FILTERS.sourceTypes.length
    );
  }, [filters]);

  return {
    filters,
    updateFilters,
    resetFilters,
    applyFilters,
    activeFilterCount,
    isDefault,
  };
}
