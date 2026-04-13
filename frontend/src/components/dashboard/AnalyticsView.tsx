/**
 * Analytics View Component (React Query Optimized)
 * 
 * Displays real-time analytics, charts, and hazard statistics.
 * Uses React Query for automatic caching and request deduplication.
 * 
 * Performance Optimizations:
 * - React.memo() on chart components to prevent unnecessary re-renders
 * - useMemo() for expensive data transformations
 * - Custom comparison functions for optimal memoization
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { StatsCard } from '../StatsCard';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import {
  OptimizedTrendsChart,
  OptimizedPieChart,
  OptimizedDistributionBarChart,
  OptimizedRegionChart,
} from './OptimizedCharts';
import {
  useHazardStats,
  useHazardTrends,
  useRegionStats,
  useHazardDistribution,
  useSourceBreakdown,
  useRecentAlerts,
} from '../../hooks/useAnalytics';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  MapPin,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

// Color palette
const COLORS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#a855f7',
};

const HAZARD_COLORS: Record<string, string> = {
  volcanic_eruption: COLORS.danger,
  earthquake: COLORS.warning,
  flood: COLORS.info,
  landslide: COLORS.purple,
  fire: COLORS.danger,
  storm_surge: COLORS.primary,
};

/**
 * Render the AnalyticsView component that displays hazard KPIs, interactive charts, and recent alerts.
 *
 * Shows four KPI cards, a tabbed "Hazard Analytics" card with Trends, Distribution, Regions, and Recent Alerts,
 * and an alert banner when a data-fetch error occurs. Uses React Query hooks to fetch stats, trends,
 * region stats, distribution, and recent alerts; displays a full skeleton while all sources are loading and
 * updates the trends chart window via internal `trendDays` state and the visible view via `activeTab` state.
 *
 * @returns The AnalyticsView React element containing KPI cards, the tabbed analytics charts (trends, distribution, regions),
 * and a list of recent alerts (or a placeholder when none exist).
 */
export default function AnalyticsView() {
  const [trendDays, setTrendDays] = useState(30);
  const [activeTab, setActiveTab] = useState('trends');

  // React Query hooks - automatic caching and deduplication
  const { data: stats, isLoading: statsLoading, error: statsError } = useHazardStats();
  const { data: trends, isLoading: trendsLoading, error: trendsError } = useHazardTrends(trendDays);
  const { data: regionStats, isLoading: regionsLoading, error: regionsError } = useRegionStats();
  const { data: distribution, isLoading: distLoading, error: distError } = useHazardDistribution();
  const { data: sourceBreakdown, isLoading: sourceLoading, error: sourceError } = useSourceBreakdown();
  const { data: recentAlerts, isLoading: alertsLoading, error: alertsError } = useRecentAlerts(10);

  // Combined loading state
  const loading = statsLoading || trendsLoading || regionsLoading || distLoading || sourceLoading || alertsLoading;
  
  // Combined error state
  const error = statsError || trendsError || regionsError || distError || sourceError || alertsError;
  const errorMessage = error instanceof Error ? error.message : null;

  // Memoize hazard legend for trends chart (prevents recalculation on every render)
  const hazardLegend = useMemo(() => {
    if (!trends || trends.length === 0) return [];
    
    const hazardTypes = new Set<string>();
    trends.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (key !== 'date') hazardTypes.add(key);
      });
    });

    return Array.from(hazardTypes).map((hazard_type) => ({
      hazard_type,
      color: HAZARD_COLORS[hazard_type] || '#6b7280',
    }));
  }, [trends]);

  // Show full skeleton on initial load (when all data is loading)
  if (statsLoading && trendsLoading && regionsLoading && distLoading && sourceLoading && alertsLoading) {
    return <AnalyticsSkeleton />;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'moderate': return 'default';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Hazards"
          value={stats?.total_hazards.toLocaleString() || '0'}
          description="All time reports"
          icon={<Activity className="h-4 w-4" />}
          loading={loading}
        />
        <StatsCard
          title="Active Hazards"
          value={stats?.active_hazards.toLocaleString() || '0'}
          description="Requires attention"
          icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
          loading={loading}
        />
        <StatsCard
          title="Resolved"
          value={stats?.resolved_hazards.toLocaleString() || '0'}
          description="Successfully handled"
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          loading={loading}
        />
        <StatsCard
          title="Avg Confidence"
          value={stats ? `${(stats.avg_confidence * 100).toFixed(1)}%` : '0%'}
          description="AI model accuracy"
          icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
          loading={loading}
        />
      </div>

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Hazard Analytics</CardTitle>
          <CardDescription>Comprehensive view of environmental hazards</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 !h-auto">
              <TabsTrigger value="trends" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Trends
              </TabsTrigger>
              <TabsTrigger value="distribution" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Distribution
              </TabsTrigger>
              <TabsTrigger value="regions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Regions
              </TabsTrigger>
              <TabsTrigger value="sources" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Sources
              </TabsTrigger>
              <TabsTrigger value="recent" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Recent Alerts
              </TabsTrigger>
            </TabsList>

            {/* Trends Tab */}
            <TabsContent value="trends" className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={trendDays === 7 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTrendDays(7)}
                >
                  7 Days
                </Button>
                <Button
                  variant={trendDays === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTrendDays(30)}
                >
                  30 Days
                </Button>
                <Button
                  variant={trendDays === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTrendDays(90)}
                >
                  90 Days
                </Button>
              </div>
              
              <OptimizedTrendsChart data={trends || []} hazardTypes={hazardLegend} />
            </TabsContent>

            {/* Distribution Tab */}
            <TabsContent value="distribution" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <OptimizedPieChart data={distribution || []} />
                <OptimizedDistributionBarChart data={distribution || []} />
              </div>
            </TabsContent>

            {/* Regions Tab */}
            <TabsContent value="regions">
              <OptimizedRegionChart data={regionStats || []} />
            </TabsContent>

            {/* Source Breakdown Tab */}
            <TabsContent value="sources" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <OptimizedPieChart
                  data={(sourceBreakdown || []).map((item) => ({
                    hazard_type: item.source_type,
                    count: item.count,
                    percentage: item.percentage,
                  }))}
                />
                <OptimizedDistributionBarChart
                  data={(sourceBreakdown || []).map((item) => ({
                    hazard_type: item.source_type,
                    count: item.count,
                    percentage: item.percentage,
                  }))}
                />
              </div>
            </TabsContent>

            {/* Recent Alerts Tab */}
            <TabsContent value="recent" className="space-y-3">
              {!recentAlerts || recentAlerts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No recent alerts</p>
              ) : (
                recentAlerts.map((alert) => (
                  <Card key={alert.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={getSeverityColor(alert.severity) as "default" | "destructive" | "secondary" | "outline"}>
                              {alert.severity}
                            </Badge>
                            <Badge variant="outline">{alert.hazard_type}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{alert.location_name}</span>
                            <Clock className="h-3 w-3 ml-2" />
                            <span>{format(new Date(alert.detected_at), 'MMM d, yyyy HH:mm')}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Confidence</div>
                          <div className="text-sm font-medium">{(alert.confidence_score * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}