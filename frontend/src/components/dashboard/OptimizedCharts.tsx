/**
 * Optimized Chart Components
 * 
 * Memoized Recharts components to prevent unnecessary re-renders.
 * Uses React.memo() with custom comparison functions for optimal performance.
 * 
 * Module: P1 - Chart Optimization
 * Security: CIA Triad - Availability (optimized rendering performance)
 * 
 * Performance Benefits:
 * - Prevents chart re-renders when parent component updates
 * - Only re-renders when chart data or configuration changes
 * - Reduces CPU usage and improves dashboard responsiveness
 */

import React, { memo } from 'react';
import {
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
  Label,
  ResponsiveContainer,
} from 'recharts';

// Color palette
const HAZARD_COLORS: Record<string, string> = {
  volcanic_eruption: '#ef4444',
  earthquake: '#f59e0b',
  flood: '#06b6d4',
  landslide: '#a855f7',
  fire: '#ef4444',
  storm_surge: '#3b82f6',
};

const REGION_COLORS = {
  active: '#f59e0b',
  resolved: '#22c55e',
};

function formatHazardType(raw: string | number): string {
  const str = String(raw);
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function renderColorLegend(
  entries: { label: string; color: string }[],
) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
      {entries.map((e) => (
        <span key={e.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: e.color }}
          />
          {e.label}
        </span>
      ))}
    </div>
  );
}

// Type definitions
interface TrendData {
  date: string;
  [key: string]: string | number;
}

interface HazardTrendAPI {
  date: string;
  volcanic_eruption: number;
  earthquake: number;
  flood: number;
  landslide: number;
  fire: number;
  storm_surge: number;
  total: number;
}

interface DistributionData {
  hazard_type: string;
  count: number;
}

/**
 * Pie chart label entry with additional recharts properties
 * This interface extends the data structure with the percent field
 * that recharts adds during label rendering
 */
interface PieChartLabelEntry extends DistributionData {
  percent: number;
}

/**
 * Type guard to validate that an entry has the expected pie chart label properties
 */
function isPieChartLabelEntry(entry: unknown): entry is PieChartLabelEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'hazard_type' in entry &&
    'percent' in entry &&
    typeof (entry as PieChartLabelEntry).hazard_type === 'string' &&
    typeof (entry as PieChartLabelEntry).percent === 'number'
  );
}

interface RegionStatsAPI {
  region: string;
  total_count: number;
  active_count: number;
  resolved_count: number;
}

interface HazardLegendItem {
  hazard_type: string;
  color: string;
}

// ============================================================================
// OPTIMIZED AREA CHART (Trends)
// ============================================================================

interface OptimizedTrendsChartProps {
  data: HazardTrendAPI[];
  hazardTypes: HazardLegendItem[];
}

export const OptimizedTrendsChart = memo<OptimizedTrendsChartProps>(
  ({ data, hazardTypes }) => {
    // Transform HazardTrendAPI to TrendData with index signature
    const chartData: TrendData[] = data.map((trend) => ({
      ...trend,
    }));

    const legendEntries = hazardTypes.map((h) => ({
      label: formatHazardType(h.hazard_type),
      color: h.color,
    }));

    return (
      <div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            >
              <Label
                value="No. of Reports"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
            </YAxis>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => [value, formatHazardType(name)]}
            />
            {hazardTypes.map((item) => (
              <Area
                key={item.hazard_type}
                type="monotone"
                dataKey={item.hazard_type}
                stackId="1"
                stroke={item.color}
                fill={item.color}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        {legendEntries.length > 0 && renderColorLegend(legendEntries)}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if data or hazardTypes change
    return (
      JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data) &&
      JSON.stringify(prevProps.hazardTypes) === JSON.stringify(nextProps.hazardTypes)
    );
  }
);

OptimizedTrendsChart.displayName = 'OptimizedTrendsChart';

// ============================================================================
// OPTIMIZED PIE CHART (Distribution)
// ============================================================================

interface OptimizedPieChartProps {
  data: DistributionData[];
}

export const OptimizedPieChart = memo<OptimizedPieChartProps>(
  ({ data }) => {
    const chartData = data.map((item) => ({ ...item }));

    const legendEntries = data.map((item) => ({
      label: formatHazardType(item.hazard_type),
      color: HAZARD_COLORS[item.hazard_type] || '#6b7280',
    }));

    return (
      <div>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry) => {
                if (!isPieChartLabelEntry(entry)) {
                  return '';
                }
                return `${(entry.percent * 100).toFixed(0)}%`;
              }}
              outerRadius={80}
              fill="#8884d8"
              dataKey="count"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={HAZARD_COLORS[entry.hazard_type] || '#6b7280'}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number, _name: string, props: { payload?: { hazard_type?: string } }) => [
                value,
                formatHazardType(props.payload?.hazard_type ?? _name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {legendEntries.length > 0 && renderColorLegend(legendEntries)}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if data changes
    return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
  }
);

OptimizedPieChart.displayName = 'OptimizedPieChart';

// ============================================================================
// OPTIMIZED BAR CHART (Distribution - Alternative View)
// ============================================================================

interface OptimizedDistributionBarChartProps {
  data: DistributionData[];
}

export const OptimizedDistributionBarChart = memo<OptimizedDistributionBarChartProps>(
  ({ data }) => {
    const chartData = data.map((item) => ({ ...item }));

    const legendEntries = data.map((item) => ({
      label: formatHazardType(item.hazard_type),
      color: HAZARD_COLORS[item.hazard_type] || '#6b7280',
    }));

    return (
      <div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="hazard_type"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={formatHazardType}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            >
              <Label
                value="No. of Reports"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
            </YAxis>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [value, 'Count']}
              labelFormatter={formatHazardType}
            />
            <Bar dataKey="count">
              {data.map((entry, index) => (
                <Cell
                  key={`bar-${index}`}
                  fill={HAZARD_COLORS[entry.hazard_type] || '#6b7280'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {legendEntries.length > 0 && renderColorLegend(legendEntries)}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
  }
);

OptimizedDistributionBarChart.displayName = 'OptimizedDistributionBarChart';

// ============================================================================
// OPTIMIZED REGION BAR CHART (Horizontal)
// ============================================================================

interface OptimizedRegionChartProps {
  data: RegionStatsAPI[];
}

export const OptimizedRegionChart = memo<OptimizedRegionChartProps>(
  ({ data }) => {
    const regionLegend = [
      { label: 'Active', color: REGION_COLORS.active },
      { label: 'Resolved', color: REGION_COLORS.resolved },
    ];

    return (
      <div>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              type="number"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            >
              <Label
                value="No. of Reports"
                position="insideBottom"
                offset={-2}
                style={{ textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
            </XAxis>
            <YAxis
              dataKey="region"
              type="category"
              className="text-xs"
              width={120}
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="active_count" name="Active" stackId="region" fill={REGION_COLORS.active} />
            <Bar dataKey="resolved_count" name="Resolved" stackId="region" fill={REGION_COLORS.resolved} />
          </BarChart>
        </ResponsiveContainer>
        {renderColorLegend(regionLegend)}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
  }
);

OptimizedRegionChart.displayName = 'OptimizedRegionChart';
