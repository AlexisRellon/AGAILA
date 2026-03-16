/**
 * Service Status Page
 * Module: SHM-04
 * 
 * Publicly accessible webpage that displays the real-time operational status
 * of all core system services and external data integrations.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { AlertCircle, CheckCircle2, AlertTriangle, Wrench, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { landingAssets } from '../constants/landingAssets';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'maintenance';
  message: string;
  last_checked: string;
  response_time_ms?: number;
  details?: Record<string, unknown>;
}

interface SystemStatusResponse {
  overall_status: 'operational' | 'degraded' | 'down' | 'maintenance';
  timestamp: string;
  services: ServiceStatus[];
  uptime_seconds?: number;
}

const StatusPage: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshInterval = 30000; // 30 seconds

  // Fetch system status
  const { data, isLoading, error, refetch } = useQuery<SystemStatusResponse>({
    queryKey: ['system-status'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch system status');
      }
      return response.json();
    },
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchOnWindowFocus: true,
  });

  // Format uptime
  const formatUptime = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Get status color and icon
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'operational':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-700',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          icon: CheckCircle2,
          label: 'Operational',
        };
      case 'degraded':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          icon: AlertTriangle,
          label: 'Degraded',
        };
      case 'down':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          icon: AlertCircle,
          label: 'Down',
        };
      case 'maintenance':
        return {
          color: 'bg-blue-500',
          textColor: 'text-blue-700',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          icon: Wrench,
          label: 'Under Maintenance',
        };
      default:
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-700',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          icon: AlertCircle,
          label: 'Unknown',
        };
    }
  };

  // Format last checked time
  const formatLastChecked = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      
      if (diffSec < 60) {
        return `${diffSec} seconds ago`;
      } else if (diffSec < 3600) {
        const minutes = Math.floor(diffSec / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      } else {
        return date.toLocaleString();
      }
    } catch {
      return timestamp;
    }
  };

  const overallConfig = data ? getStatusConfig(data.overall_status) : null;

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      {/* ── Top Navigation ── */}
      <nav className="sticky top-0 z-50 bg-[#F0F4F8] border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            <img src={landingAssets.logo.gaia} alt="GAIA" className="h-8 w-auto" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#0A2A4D] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1 text-[#0A2A4D]">System Status</h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Real-time operational status of all core system services and external data integrations
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="text-xs sm:text-sm"
              >
                Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Overall Status Banner */}
          {overallConfig && (
            <Card className={`${overallConfig.bgColor} ${overallConfig.borderColor} border-2`}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <overallConfig.icon className={`h-8 w-8 ${overallConfig.textColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-base sm:text-lg">Overall System Status:</span>
                      <Badge variant="outline" className={overallConfig.textColor}>
                        {overallConfig.label}
                      </Badge>
                    </div>
                    {data && data.uptime_seconds && (
                      <p className="text-sm text-muted-foreground">
                        Uptime: {formatUptime(data.uptime_seconds)}
                      </p>
                    )}
                    {data && data.timestamp && (
                      <p className="text-xs text-muted-foreground sm:hidden mt-1">
                        Last updated: {formatLastChecked(data.timestamp)}
                      </p>
                    )}
                  </div>
                  {data && data.timestamp && (
                    <p className="hidden sm:block text-sm text-muted-foreground">
                      Last updated: {formatLastChecked(data.timestamp)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Services Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <span>Failed to load system status. Please try again later.</span>
              </div>
            </CardContent>
          </Card>
        ) : data ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.services.map((service) => {
              const config = getStatusConfig(service.status);

              return (
                <Card
                  key={service.name}
                  className={`${config.bgColor} ${config.borderColor} border`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{service.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${config.color}`} />
                        <Badge variant="outline" className={config.textColor}>
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="mt-2">
                      {service.message}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {service.response_time_ms !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Response Time:</span>
                          <span className="font-medium">{service.response_time_ms} ms</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Checked:</span>
                        <span className="font-medium">{formatLastChecked(service.last_checked)}</span>
                      </div>
                      {service.details && Object.keys(service.details).length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <details className="cursor-pointer">
                            <summary className="text-muted-foreground hover:text-foreground">
                              View Details
                            </summary>
                            <pre className="mt-2 text-xs bg-background p-2 rounded overflow-auto max-h-32">
                              {JSON.stringify(service.details, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Status page automatically refreshes every {refreshInterval / 1000} seconds.
            {' '}
            <Link to="/" className="text-[#005A9C] hover:text-[#0A2A4D] hover:underline transition-colors">Return to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default StatusPage;

