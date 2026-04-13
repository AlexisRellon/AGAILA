/* @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import AnalyticsView from './AnalyticsView';

vi.mock('../../hooks/useAnalytics', () => ({
  useHazardStats: () => ({ data: { total_hazards: 1, active_hazards: 1, resolved_hazards: 0, unverified_reports: 0, avg_confidence: 0.9, avg_time_to_action: 10 }, isLoading: false, error: null }),
  useHazardTrends: () => ({ data: [], isLoading: false, error: null }),
  useRegionStats: () => ({ data: [], isLoading: false, error: null }),
  useHazardDistribution: () => ({ data: [], isLoading: false, error: null }),
  useSourceBreakdown: () => ({ data: [{ source_type: 'rss', count: 1, percentage: 100 }], isLoading: false, error: null }),
  useRecentAlerts: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('./OptimizedCharts', () => ({
  OptimizedTrendsChart: () => <div>trends-chart</div>,
  OptimizedPieChart: () => <div>pie-chart</div>,
  OptimizedDistributionBarChart: () => <div>bar-chart</div>,
  OptimizedRegionChart: () => <div>region-chart</div>,
}));

vi.mock('../StatsCard', () => ({
  StatsCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('AnalyticsView', () => {
  it('renders and shows Source tab content', async () => {
    const user = userEvent.setup();
    render(<AnalyticsView />);

    await user.click(screen.getByRole('tab', { name: /sources/i }));
    expect(screen.getByText('pie-chart')).toBeTruthy();
    expect(screen.getByText('bar-chart')).toBeTruthy();
  });
});