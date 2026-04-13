/**
 * Analytics API Client
 * 
 * Provides functions to fetch analytics data from backend
 */

import { API_BASE_URL } from './api';

export interface HazardStats {
  total_hazards: number;
  active_hazards: number;
  resolved_hazards: number;
  unverified_reports: number;
  avg_confidence: number;
  avg_time_to_action: number | null;
}

export interface HazardTrend {
  date: string;
  volcanic_eruption: number;
  earthquake: number;
  flood: number;
  landslide: number;
  fire: number;
  storm_surge: number;
  typhoon: number;
  tsunami: number;
  drought: number;
  tornado: number;
  coastal_erosion: number;
  other: number;
  total: number;
  [key: string]: string | number; // Allow additional dynamic hazard types
}

export interface RegionStats {
  region: string;
  total_count: number;
  active_count: number;
  resolved_count: number;
}

export interface HazardTypeDistribution {
  hazard_type: string;
  count: number;
  percentage: number;
}

export interface SourceBreakdown {
  source_type: string;
  count: number;
  percentage: number;
}

export interface RecentAlert {
  id: string;
  hazard_type: string;
  severity: string;
  location_name: string;
  admin_division: string;
  confidence_score: number;
  detected_at: string;
  status: string;
}

class AnalyticsAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1/analytics`;
  }

  async getStats(): Promise<HazardStats> {
    const response = await fetch(`${this.baseUrl}/stats`);
    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }
    return response.json();
  }

  async getTrends(days: number = 30): Promise<HazardTrend[]> {
    const response = await fetch(`${this.baseUrl}/trends?days=${days}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch trends: ${response.statusText}`);
    }
    return response.json();
  }

  async getRegionStats(): Promise<RegionStats[]> {
    const response = await fetch(`${this.baseUrl}/regions`);
    if (!response.ok) {
      throw new Error(`Failed to fetch region stats: ${response.statusText}`);
    }
    return response.json();
  }

  async getDistribution(): Promise<HazardTypeDistribution[]> {
    const response = await fetch(`${this.baseUrl}/distribution`);
    if (!response.ok) {
      throw new Error(`Failed to fetch distribution: ${response.statusText}`);
    }
    return response.json();
  }

  async getSourceBreakdown(): Promise<SourceBreakdown[]> {
    const response = await fetch(`${this.baseUrl}/source-breakdown`);
    if (!response.ok) {
      throw new Error(`Failed to fetch source breakdown: ${response.statusText}`);
    }
    return response.json();
  }

  async getRecentAlerts(limit: number = 10): Promise<RecentAlert[]> {
    const response = await fetch(`${this.baseUrl}/recent-alerts?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recent alerts: ${response.statusText}`);
    }
    return response.json();
  }
}

export const analyticsApi = new AnalyticsAPI();
