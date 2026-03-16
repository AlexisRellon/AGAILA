import { useState, useEffect } from 'react';
import { storageCache, TTL } from '../lib/storageCache';

/**
 * useBoundaryData Hook
 *
 * Fetches Philippine administrative boundary GeoJSON data for a specific location.
 * Uses backend API to get only the relevant boundary instead of loading all data.
 *
 * Responses are cached in localStorage for 1 hour so repeated popups / map
 * interactions for the same location do not trigger redundant network requests.
 *
 * @param locationName - Name of city/municipality to highlight (e.g., "Imus", "Manila")
 * @param enabled - Whether to fetch the data (lazy loading)
 * @returns GeoJSON data, loading state, and error
 */

interface BoundaryDataResult {
  data: GeoJSON.FeatureCollection | null;
  loading: boolean;
  error: string | null;
  metadata?: {
    location: string;
    province: string;
    region: string;
    region_name: string;
    boundary_level: string;  // 'municipality' | 'province' | 'region'
  };
}

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const useBoundaryData = (locationName: string | null, enabled: boolean = false): BoundaryDataResult => {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<BoundaryDataResult['metadata']>();

  useEffect(() => {
    if (!enabled || !locationName) {
      setData(null);
      setMetadata(undefined);
      setError(null);
      return;
    }

    interface CacheBoundaryData extends GeoJSON.FeatureCollection {
      metadata?: BoundaryDataResult['metadata'];
    }

    const cacheKey = `boundary:${locationName.toLowerCase()}`;

    const fetchBoundaryData = async () => {
      // Return cached GeoJSON immediately — avoids network round-trip on repeat visits
      const cached = storageCache.get<CacheBoundaryData>(cacheKey);
      if (cached) {
        setData(cached);
        setMetadata(cached.metadata);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const endpoint = `${API_BASE_URL}/api/boundaries/${encodeURIComponent(locationName)}`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Location "${locationName}" not found in Philippine administrative mapping`);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        // Validate GeoJSON structure
        if (result.type !== 'FeatureCollection' || !Array.isArray(result.features)) {
          throw new Error('Invalid GeoJSON format from API');
        }

        // Cache for 1 hour — boundary data changes very infrequently
        storageCache.set(cacheKey, result, TTL.MEDIUM);

        setData(result);
        setMetadata(result.metadata);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[useBoundaryData] Error loading boundary for ${locationName}:`, errorMessage);
        setError(errorMessage);
        setData(null);
        setMetadata(undefined);
      } finally {
        setLoading(false);
      }
    };

    fetchBoundaryData();
  }, [locationName, enabled]);

  return {
    data,
    loading,
    error,
    metadata,
  };
};


