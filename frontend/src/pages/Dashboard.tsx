/**
 * Dashboard Page (CD-01 Implementation)
 * 
 * Comprehensive analytics dashboard with real-time hazard monitoring,
 * interactive charts, and admin controls for privileged users.
 * 
 * Features:
 * - Real-time hazard statistics and KPIs
 * - Interactive charts (trends, distribution, regional stats)
 * - Recent alerts monitoring
 * - Admin CRUD controls for master admins
 * - Professional UI/UX with TailwindCSS + ShadCN
 * - Security: RBAC, input validation, confirmation dialogs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard } from '../components/StatsCard';
import { landingAssets } from '../constants/landingAssets';
import { 
  analyticsApi, 
  HazardStats, 
  HazardTrend, 
  RegionStats, 
  HazardTypeDistribution, 
  RecentAlert 
} from '../lib/analyticsApi';
import {
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  MapPin,
  Clock,
  Shield,
  Users,
  Settings,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

// Chart data types (extends for recharts compatibility)
type ChartData = Record<string, string | number | undefined>;

// Color palette for charts
const COLORS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#a855f7',
  pink: '#ec4899',
};

const HAZARD_COLORS: Record<string, string> = {
  volcanic_eruption: COLORS.danger,
  earthquake: COLORS.warning,
  flood: COLORS.info,
  landslide: COLORS.purple,
  fire: COLORS.danger,
  storm_surge: COLORS.primary,
};

export default function Dashboard() {
  const { user, userProfile, loading: authLoading, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  // State management
  const [stats, setStats] = useState<HazardStats | null>(null);
  const [trends, setTrends] = useState<HazardTrend[]>([]);
  const [regionStats, setRegionStats] = useState<RegionStats[]>([]);
  const [distribution, setDistribution] = useState<HazardTypeDistribution[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState(30);

  // Fetch all analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, trendsData, regionsData, distData, alertsData] = await Promise.all([
        analyticsApi.getStats(),
        analyticsApi.getTrends(trendDays),
        analyticsApi.getRegionStats(),
        analyticsApi.getDistribution(),
        analyticsApi.getRecentAlerts(10),
      ]);

      setStats(statsData);
      setTrends(trendsData);
      setRegionStats(regionsData);
      setDistribution(distData);
      setRecentAlerts(alertsData);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [trendDays]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchAnalytics();
    }
  }, [authLoading, user, fetchAnalytics]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Loading skeleton
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Skeleton className="h-10 w-32" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-32 hidden sm:block" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img 
              src={landingAssets.logo.gaia} 
              alt="GAIA Logo" 
              className="h-10 w-auto"
            />
            <span className="font-semibold text-lg hidden sm:inline">GAIA Dashboard</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{userProfile?.full_name || user?.email}</span>
              <Badge variant={userProfile?.role === 'master_admin' ? 'default' : 'secondary'}>
                {userProfile?.role?.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {isAdmin() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/admin')}
                  className="hidden sm:flex"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Admin
                </Button>
              )}
              <Button onClick={handleLogout} variant="outline" size="sm">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPI Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
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
            value={`${((stats?.avg_confidence || 0) * 100).toFixed(1)}%`}
            description={`TtA: ${stats?.avg_time_to_action?.toFixed(1) || 'N/A'} min`}
            icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
            loading={loading}
          />
        </div>

        {/* Charts Section */}
        <Tabs defaultValue="trends" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="regions">Regions</TabsTrigger>
            <TabsTrigger value="alerts">Recent Alerts</TabsTrigger>
          </TabsList>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Hazard Trends</CardTitle>
                    <CardDescription>Historical hazard detection over time</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={trendDays === 7 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTrendDays(7)}
                    >
                      7D
                    </Button>
                    <Button
                      variant={trendDays === 30 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTrendDays(30)}
                    >
                      30D
                    </Button>
                    <Button
                      variant={trendDays === 90 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTrendDays(90)}
                    >
                      90D
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : trends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={trends as unknown as ChartData[]}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8} />
                          <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value: string) => format(new Date(value), 'MMM dd')}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke={COLORS.primary}
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                        name="Total Hazards"
                      />
                      <Line type="monotone" dataKey="volcanic_eruption" stroke={HAZARD_COLORS.volcanic_eruption} name="Volcanic" strokeWidth={2} />
                      <Line type="monotone" dataKey="earthquake" stroke={HAZARD_COLORS.earthquake} name="Earthquake" strokeWidth={2} />
                      <Line type="monotone" dataKey="flood" stroke={HAZARD_COLORS.flood} name="Flood" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Distribution Tab */}
          <TabsContent value="distribution" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Hazard Type Distribution</CardTitle>
                  <CardDescription>Breakdown by hazard category</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : distribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={distribution as unknown as ChartData[]}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => {
                            const item = entry as unknown as HazardTypeDistribution;
                            return `${item.hazard_type}: ${item.percentage}%`;
                          }}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {distribution.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={HAZARD_COLORS[entry.hazard_type] || COLORS.primary} 
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No distribution data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Count by Type</CardTitle>
                  <CardDescription>Number of hazards per category</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : distribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={distribution as unknown as ChartData[]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hazard_type" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill={COLORS.primary}>
                          {distribution.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={HAZARD_COLORS[entry.hazard_type] || COLORS.primary} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No distribution data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Regions Tab */}
          <TabsContent value="regions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Regional Statistics</CardTitle>
                <CardDescription>Hazard concentration by administrative region</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : regionStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={regionStats as unknown as ChartData[]} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="region" type="category" width={150} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="hazard_count" fill={COLORS.primary} name="Total Hazards" />
                      <Bar dataKey="active_count" fill={COLORS.warning} name="Active" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    No regional data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>Latest hazard detections from all sources</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : recentAlerts.length > 0 ? (
                  <div className="space-y-4">
                    {recentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className={`p-2 rounded-lg ${
                          alert.severity === 'high' ? 'bg-red-100 dark:bg-red-900' :
                          alert.severity === 'moderate' ? 'bg-orange-100 dark:bg-orange-900' :
                          'bg-yellow-100 dark:bg-yellow-900'
                        }`}>
                          <AlertTriangle className={`h-5 w-5 ${
                            alert.severity === 'high' ? 'text-red-600 dark:text-red-400' :
                            alert.severity === 'moderate' ? 'text-orange-600 dark:text-orange-400' :
                            'text-yellow-600 dark:text-yellow-400'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-semibold text-sm">
                                {alert.hazard_type.replace('_', ' ').toUpperCase()}
                              </h4>
                              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                <MapPin className="h-3 w-3" />
                                {alert.location_name}, {alert.admin_division}
                              </p>
                            </div>
                            <Badge variant={alert.status === 'active' ? 'destructive' : 'secondary'}>
                              {alert.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(alert.detected_at), 'MMM dd, yyyy HH:mm')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              Confidence: {(alert.confidence_score * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                    <p>No recent alerts available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Admin Quick Actions */}
        {isAdmin() && (
          <Card className="mt-8 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                Admin Controls
              </CardTitle>
              <CardDescription>Quick access to administrative functions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate('/admin')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  User Management
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate('/admin')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Audit Logs
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate('/admin')}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  System Config
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate('/admin')}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Report Triage
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
