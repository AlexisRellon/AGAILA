/**
 * RSS Statistics Dashboard Component (RSS-09)
 * 
 * Real-time statistics and analytics for RSS feed processing
 * 
 * Features:
 * - 4 KPI cards (Total Feeds, Hazards Found, Last 24h Hazards, Success Rate)
 * - Processing Time chart (Recharts line chart, last 24h by hour)
 * - Feed Performance chart (Recharts bar chart, hazards per feed)
 * - Manual "Process Now" button with confirmation
 * - Auto-refresh toggle (30s interval)
 * - Mobile-responsive grid layout
 * 
 * API: GET /api/v1/admin/rss/statistics
 * Rate Limit: 30/min
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Play,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../ui/alert-dialog';
import { toast } from 'sonner';
import {
  useRSSStatistics,
  // useRSSFeeds,
  useProcessRSSFeeds,
  useCurrentProcessingJob,
  useFeedPerformance,
} from '../../../hooks/useRSS';

// ============================================================================
// CHART COLORS
// ============================================================================

const CHART_COLORS = {
  primary: '#0A2A4D',
  secondary: '#005A9C',
  accent: '#FF7A00',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

// Success rate threshold for consistent UX across KPI card and system health indicator
const SUCCESS_RATE_THRESHOLD = 0.8;

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KPICardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
}

function KPICard({
  title,
  value,
  change,
  icon,
  trend,
  description,
}: KPICardProps) {
  const getTrendColor = () => {
    if (!trend) return 'text-muted-foreground';
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <p className={`text-xs ${getTrendColor()} flex items-center mt-1`}>
            {trend === 'up' && <TrendingUp className="mr-1 h-3 w-3" />}
            {change}
          </p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
/**
 * Render the RSS Statistics dashboard with KPIs, charts, and controls for managing RSS feed processing.
 *
 * Displays real-time metrics (total feeds, hazards, success rate, avg processing time), a bar chart of top feeds by hazards,
 * a pie chart of feed status distribution, duplicate detection performance, and system health indicators.
 * Provides an auto-refresh toggle and a guarded "Process Now" action that triggers immediate feed processing.
 *
 * @returns A React element representing the RSS statistics dashboard UI.
 */

export function RSSStatistics() {
  // State
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Queries
  const { data: stats, isLoading, error, isFetching } = useRSSStatistics();
  // const { data: feeds = [] } = useRSSFeeds();
  const { data: feedPerformance = [] } = useFeedPerformance();
  const { data: currentJob } = useCurrentProcessingJob();
  const processMutation = useProcessRSSFeeds();
  
  // Determine if processing is in progress
  const isProcessing = currentJob?.has_running_job || processMutation.isPending;

  // ============================================================================
  // PROCESS FEEDS HANDLER
  // ============================================================================

  const handleProcessFeeds = async () => {
    toast.info('Starting RSS feed processing...');
    try {
      await processMutation.mutateAsync({});
    } catch (error) {
      console.error('Process feeds error:', error);
    }
  };

  // ============================================================================
  // CHART DATA PREPARATION
  // ============================================================================

  // Feed Performance Data (Bar Chart) - Uses actual hazard counts from hazards table
  const feedPerformanceData = feedPerformance
    .slice(0, 10) // Top 10 feeds
    .map((fp) => ({
      name: fp.name,
      hazards: fp.hazards,
    }))
    .sort((a, b) => b.hazards - a.hazards);

  // Status Distribution Data (Pie Chart)
  const statusData = [
    {
      name: 'Success',
      value: stats
        ? Math.round((stats.last_24h_success_rate ?? 0) * (stats.active_feeds ?? 0))
        : 0,
      color: CHART_COLORS.success,
    },
    {
      name: 'Errors',
      value: stats?.feeds_with_errors || 0,
      color: CHART_COLORS.error,
    },
    {
      name: 'Idle',
      value: stats
        ? (stats.active_feeds ?? 0) -
          Math.round((stats.last_24h_success_rate ?? 0) * (stats.active_feeds ?? 0)) -
          (stats.feeds_with_errors || 0)
        : 0,
      color: CHART_COLORS.warning,
    },
  ];

  // ============================================================================
  // RENDER
  // ============================================================================

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-destructive">Error loading statistics</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">
            Loading statistics...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm">
              Auto-refresh (30s)
            </Label>
          </div>
          {isFetching && (
            <Badge variant="secondary">
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              Updating...
            </Badge>
          )}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {currentJob?.has_running_job 
                    ? `Processing... (${currentJob.progress?.processed || 0}/${currentJob.progress?.total || 0})`
                    : 'Starting...'}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Process Now
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Process RSS Feeds</AlertDialogTitle>
              <AlertDialogDescription>
                This will trigger immediate processing of all active RSS feeds.
                The AI pipeline will classify and geocode new articles. This
                operation may take 1-5 minutes depending on feed size.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleProcessFeeds}>
                Start Processing
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Feeds"
          value={stats.total_feeds}
          icon={<Activity className="h-4 w-4" />}
          description={`${stats.active_feeds} active`}
        />
        <KPICard
          title="Hazards Found"
          value={stats.total_hazards_found.toLocaleString()}
          icon={<BarChart3 className="h-4 w-4" />}
          change={`${stats.last_24h_hazards} in last 24h`}
          trend="up"
        />
        <KPICard
          title="Success Rate"
          value={`${((stats.last_24h_success_rate ?? 0) * 100).toFixed(1)}%`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend={(stats.last_24h_success_rate ?? 0) >= SUCCESS_RATE_THRESHOLD ? 'up' : 'down'}
          description="Last 24 hours"
        />
        <KPICard
          title="Avg Processing Time"
          value={`${(stats.last_24h_processing_time_avg ?? 0).toFixed(1)}s`}
          icon={<Activity className="h-4 w-4" />}
          description="Per feed fetch"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Feed Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Top Performing Feeds (Total Hazards)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {feedPerformanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={feedPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="hazards"
                    fill={CHART_COLORS.primary}
                    name="Hazards Found"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-muted-foreground">
                  No feed performance data available
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feed Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Feed Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label={(props: any) => {
                      const value = props.value || 0;
                      const name = props.name || '';
                      return value > 0 ? `${name}: ${value}` : null;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-muted-foreground">
                  No status data available
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Detection Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Duplicate Detection Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Detection Rate</span>
                <span className="text-sm font-bold">
                  {((stats.duplicate_detection_rate ?? 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-secondary/20 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{
                    width: `${(stats.duplicate_detection_rate ?? 0) * 100}%`,
                  }}
                />
              </div>
            </div>
            {stats.feeds_with_errors > 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">
                    {stats.feeds_with_errors} Feeds with Errors
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Check processing logs
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Health Indicators */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  stats.active_feeds > 0 ? 'bg-green-500' : 'bg-red-500'
                } animate-pulse`}
              />
              <div>
                <p className="text-sm font-medium">RSS Feed Processing</p>
                <p className="text-xs text-muted-foreground">
                  {stats.active_feeds > 0 ? 'Operational' : 'Inactive'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  (stats.last_24h_success_rate ?? 0) >= SUCCESS_RATE_THRESHOLD
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                } animate-pulse`}
              />
              <div>
                <p className="text-sm font-medium">AI Classification</p>
                <p className="text-xs text-muted-foreground">
                  {(stats.last_24h_success_rate ?? 0) >= SUCCESS_RATE_THRESHOLD
                    ? 'Healthy'
                    : 'Degraded'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  (stats.duplicate_detection_rate ?? 0) >= 0.85
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                } animate-pulse`}
              />
              <div>
                <p className="text-sm font-medium">Duplicate Detection</p>
                <p className="text-xs text-muted-foreground">
                  {(stats.duplicate_detection_rate ?? 0) >= 0.85
                    ? 'Optimal'
                    : 'Training'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}