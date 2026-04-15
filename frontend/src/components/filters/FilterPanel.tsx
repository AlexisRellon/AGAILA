/**
 * FilterPanel Component
 * 
 * Simplified, data-dense filter panel optimized for speed and consistency.
 * Integrates all hazard filter components in a single compact row/grid layout.
 * 
 * Module: FP-01, FP-03, FP-04
 * Change: filter-panel-simplification
 * 
 * Design System: Data-Dense Dashboard (Lato/Inter, navy/blue/orange)
 * Layout: All filters always visible in horizontal grid
 * 
 * Features:
 * - Integrated HazardTypeFilter, TimeWindowFilter, SourceTypeFilter
 * - Compact, always-visible filter layout (no collapsing)
 * - Simplified header with title + badge + reset button
 * - Active filter summary with inline tags
 * - Minimal animations (only essential interactions)
 * - Full WCAG 2.1 AA accessibility
 * - Respects prefers-reduced-motion
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { Badge } from '../ui/badge';
import { HazardTypeFilter } from './HazardTypeFilter';
import { TimeWindowFilter } from './TimeWindowFilter';
import { SourceTypeFilter } from './SourceTypeFilter';
import { useHazardFilters, type Hazard, type SourceType } from '../../hooks/useHazardFilters';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BoundarySettings {
  showRegions: boolean;
  showProvinces: boolean;
  showMunicipalities: boolean;
}

export interface FilterPanelProps {
  hazards: Hazard[];
  className?: string;
  boundarySettings?: BoundarySettings;
  onBoundarySettingsChange?: (settings: BoundarySettings) => void;
  onExpandChange?: (expanded: boolean) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FilterPanel({ 
  hazards, 
  className = '',
  onExpandChange,
}: FilterPanelProps) {
  const {
    filters,
    updateFilters,
    resetFilters,
    applyFilters,
    activeFilterCount,
    isDefault,
  } = useHazardFilters();

  /**
   * Calculate hazard counts per filter category
   */
  const filteredHazards = applyFilters(hazards);
  
  const hazardTypeCounts = hazards.reduce((acc: Record<string, number>, hazard) => {
    acc[hazard.hazard_type] = (acc[hazard.hazard_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sourceCounts = hazards.reduce((acc: Record<SourceType, number>, hazard) => {
    let sourceType: SourceType = 'rss_feed';
    const src = (hazard.source_type || '').toLowerCase();

    if (['gma_news', 'abs_cbn', 'inquirer', 'rappler', 'philstar'].includes(src)) {
      sourceType = 'rss_feed';
    } else if (src.includes('citizen')) {
      sourceType = hazard.validated ? 'citizen_verified' : 'citizen_unverified';
    }

    acc[sourceType] = (acc[sourceType] || 0) + 1;
    return acc;
  }, {} as Record<SourceType, number>);

  return (
    <div className={`space-y-3 ${className}`}>
      <style>{`
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .filter-container {
          animation: slideInDown 0.3s ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .filter-container {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      {/* Simplified Header: Title + Badge + Reset */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 font-lato">Filters</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {filteredHazards.length} of {hazards.length} hazards
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Badge 
              className="bg-blue-600 text-white text-xs font-semibold"
              aria-label={`${activeFilterCount} active filter${activeFilterCount !== 1 ? 's' : ''}`}
            >
              {activeFilterCount}
            </Badge>
          )}
          
          {!isDefault && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Clear filters"
            >
              <FontAwesomeIcon icon={faRotateLeft} className="text-xs" aria-hidden="true" />
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Filter Controls: Single Column, Always Visible, Compact */}
      <div className="filter-container space-y-3">
        {/* Hazard Type Filter - Component has its own header */}
        <HazardTypeFilter
          selectedTypes={filters.hazardTypes}
          onTypesChange={(types) => updateFilters({ hazardTypes: types })}
          hazardCounts={hazardTypeCounts}
        />

        {/* Time Window Filter - Component has its own header */}
        <TimeWindowFilter
          timeWindow={filters.timeWindow}
          customDateRange={filters.customDateRange}
          onTimeWindowChange={(window, customRange) =>
            updateFilters({ timeWindow: window, customDateRange: customRange })
          }
          onExpandChange={onExpandChange}
        />

        {/* Source Type Filter - Component has its own header */}
        <SourceTypeFilter
          selectedSources={filters.sourceTypes}
          onSourcesChange={(sources) => updateFilters({ sourceTypes: sources })}
          sourceCounts={sourceCounts}
        />
      </div>

      {/* Active Filter Tags: Inline Summary */}
      {activeFilterCount > 0 && (
        <ul className="flex flex-wrap gap-2 px-1 py-2" aria-label="Active filter summary">
          {/* Hazard Type Tags */}
          {filters.hazardTypes.map((type) => (
            <li key={type}>
              <Badge
                className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                <button
                  aria-label={`Remove ${type.replace(/_/g, ' ')} filter`}
                  onClick={() =>
                    updateFilters({
                      hazardTypes: filters.hazardTypes.filter((t) => t !== type),
                    })
                  }
                  className="ml-1.5 inline-flex hover:bg-blue-200 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xs" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}

          {/* Time Window Tag */}
          {filters.timeWindow !== 'all' && (
            <li>
              <Badge
                className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                {filters.timeWindow === 'custom'
                  ? 'Custom dates'
                  : filters.timeWindow === '24h'
                  ? 'Last 24h'
                  : filters.timeWindow === '7d'
                  ? 'Last 7d'
                  : 'Last 30d'}
                <button
                  aria-label="Remove time filter"
                  onClick={() => updateFilters({ timeWindow: 'all', customDateRange: undefined })}
                  className="ml-1.5 inline-flex hover:bg-blue-200 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xs" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          )}

          {/* Source Type Tags */}
          {filters.sourceTypes.map((source) => (
            <li key={source}>
              <Badge
                className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                {source === 'rss_feed'
                  ? 'News Feed'
                  : source === 'citizen_verified'
                  ? 'Verified'
                  : 'Unverified'}
              <button
                aria-label={`Remove ${source === 'rss_feed'
                  ? 'News Feed'
                  : source === 'citizen_verified'
                  ? 'Verified'
                  : 'Unverified'} filter`}
                onClick={() =>
                  updateFilters({
                    sourceTypes: filters.sourceTypes.filter((s) => s !== source),
                  })
                }
                className="ml-1.5 inline-flex hover:bg-blue-200 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <FontAwesomeIcon icon={faTimes} className="text-xs" aria-hidden="true" />
              </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}