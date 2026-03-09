/**
 * FilterPanel Component
 * 
 * Container panel that integrates all hazard filter components.
 * Provides collapsible sections, reset functionality, and filter summary.
 * 
 * Module: FP-01, FP-03, FP-04
 * Change: add-advanced-map-features
 * 
 * Features:
 * - Integrated HazardTypeFilter, TimeWindowFilter, SourceTypeFilter
 * - Collapsible sections for better UX
 * - "Reset All Filters" button
 * - Active filter count badge
 * - Filter summary display
 * - Responsive design
 */

import React, { useState } from 'react';
import { Filter, X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
// import { Checkbox } from '../ui/checkbox';
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
  // boundarySettings = {
  //   showRegions: false,
  //   showProvinces: false,
  //   showMunicipalities: false,
  // },
  // onBoundarySettingsChange,
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

  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    hazardTypes: true,
    timeWindow: true,
    sourceTypes: true,
    boundaries: true, // Add boundaries section
  });

  /**
   * Toggle section expansion
   */
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

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
    <div className={`space-y-4 ${className}`}>
      {/* Filter Panel Header */}
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Filter className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Filters</h2>
              <p className="text-xs text-gray-600">
                {filteredHazards.length} of {hazards.length} hazards displayed
              </p>
            </div>
          </div>

          {/* Active Filter Count */}
          {activeFilterCount > 0 && (
            <Badge 
              variant="default" 
              className="bg-blue-600 text-white font-bold"
              aria-label={`${activeFilterCount} active filter${activeFilterCount !== 1 ? 's' : ''}`}
            >
              {activeFilterCount} active
            </Badge>
          )}
        </div>

        {/* Reset Button */}
        {!isDefault && (
          <button
            onClick={resetFilters}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Reset all filters to default"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Reset All Filters
          </button>
        )}
      </Card>

      {/* Hazard Type Filter Section */}
      <div className="space-y-2" role="group" aria-labelledby="hazard-types-heading">
        <button
          onClick={() => toggleSection('hazardTypes')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-expanded={expandedSections.hazardTypes}
          aria-controls="hazard-types-content"
        >
          <div className="flex items-center gap-2">
            <h3 id="hazard-types-heading" className="text-sm font-semibold text-gray-900">Hazard Types</h3>
            {filters.hazardTypes.length > 0 && (
              <Badge variant="secondary" className="text-xs" aria-label={`${filters.hazardTypes.length} types selected`}>
                {filters.hazardTypes.length} selected
              </Badge>
            )}
          </div>
          {expandedSections.hazardTypes ? (
            <ChevronUp className="w-4 h-4 text-gray-600" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" aria-hidden="true" />
          )}
        </button>

        {expandedSections.hazardTypes && (
          <div id="hazard-types-content" role="region" aria-labelledby="hazard-types-heading">
            <HazardTypeFilter
              selectedTypes={filters.hazardTypes}
              onTypesChange={(types) => updateFilters({ hazardTypes: types })}
              hazardCounts={hazardTypeCounts}
            />
          </div>
        )}
      </div>

      {/* Time Window Filter Section */}
      <div className="space-y-2" role="group" aria-labelledby="time-range-heading">
        <button
          onClick={() => toggleSection('timeWindow')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-expanded={expandedSections.timeWindow}
          aria-controls="time-range-content"
        >
          <div className="flex items-center gap-2">
            <h3 id="time-range-heading" className="text-sm font-semibold text-gray-900">Time Window</h3>
            {filters.timeWindow !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Active
              </Badge>
            )}
          </div>
          {expandedSections.timeWindow ? (
            <ChevronUp className="w-4 h-4 text-gray-600" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" aria-hidden="true" />
          )}
        </button>

        {expandedSections.timeWindow && (
          <div id="time-range-content" role="region" aria-labelledby="time-range-heading">
            <TimeWindowFilter
              timeWindow={filters.timeWindow}
              customDateRange={filters.customDateRange}
              onTimeWindowChange={(window, customRange) =>
                updateFilters({ timeWindow: window, customDateRange: customRange })
              }
              onExpandChange={onExpandChange}
            />
          </div>
        )}
      </div>

      {/* Source Type Filter Section */}
      <div className="space-y-2" role="group" aria-labelledby="source-types-heading">
        <button
          onClick={() => toggleSection('sourceTypes')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-expanded={expandedSections.sourceTypes}
          aria-controls="source-types-content"
        >
          <div className="flex items-center gap-2">
            <h3 id="source-types-heading" className="text-sm font-semibold text-gray-900">Source Types</h3>
            {filters.sourceTypes.length > 0 && filters.sourceTypes.length < 3 && (
              <Badge variant="secondary" className="text-xs" aria-label={`${filters.sourceTypes.length} sources selected`}>
                {filters.sourceTypes.length} selected
              </Badge>
            )}
          </div>
          {expandedSections.sourceTypes ? (
            <ChevronUp className="w-4 h-4 text-gray-600" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" aria-hidden="true" />
          )}
        </button>

        {expandedSections.sourceTypes && (
          <div id="source-types-content" role="region" aria-labelledby="source-types-heading">
            <SourceTypeFilter
              selectedSources={filters.sourceTypes}
              onSourcesChange={(sources) => updateFilters({ sourceTypes: sources })}
              sourceCounts={sourceCounts}
            />
          </div>
        )}
      </div>
      
      
      {/* Filter Summary */}
      {activeFilterCount > 0 && (
        <Card 
          className="p-4 bg-blue-50 border-blue-200"
          role="region"
          aria-label="Active filter summary"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-blue-900">Active Filters</h3>
              <button
                onClick={resetFilters}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                aria-label="Clear all active filters"
              >
                Clear all
              </button>
            </div>

            <div className="flex flex-wrap gap-2" role="list" aria-label="Applied filters">
              {/* Hazard Type Tags */}
              {filters.hazardTypes.map((type) => (
                <Badge
                  key={type}
                  variant="secondary"
                  className="bg-white border-blue-200 text-blue-700 text-xs pr-1"
                  role="listitem"
                >
                  <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                  <button
                    aria-label={`Remove ${type.replace(/_/g, ' ')} filter`}
                    onClick={() =>
                      updateFilters({
                        hazardTypes: filters.hazardTypes.filter((t) => t !== type),
                      })
                    }
                    className="ml-1.5 p-0.5 hover:bg-blue-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}

              {/* Time Window Tag */}
              {filters.timeWindow !== 'all' && (
                <Badge
                  variant="secondary"
                  className="bg-white border-blue-200 text-blue-700 text-xs pr-1"
                  role="listitem"
                >
                  {filters.timeWindow === 'custom'
                    ? 'Custom dates'
                    : filters.timeWindow === '24h'
                    ? 'Last 24 hours'
                    : filters.timeWindow === '7d'
                    ? 'Last 7 days'
                    : 'Last 30 days'}
                  <button
                    aria-label={`Remove time filter: ${filters.timeWindow === 'custom'
                      ? 'Custom dates'
                      : filters.timeWindow === '24h'
                      ? 'Last 24 hours'
                      : filters.timeWindow === '7d'
                      ? 'Last 7 days'
                      : 'Last 30 days'}`}
                    onClick={() => updateFilters({ timeWindow: 'all', customDateRange: undefined })}
                    className="ml-1.5 p-0.5 hover:bg-blue-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </Badge>
              )}

              {/* Source Type Tags */}
              {filters.sourceTypes.length > 0 &&
                filters.sourceTypes.length < 3 &&
                filters.sourceTypes.map((source) => (
                  <Badge
                    key={source}
                    variant="secondary"
                    className="bg-white border-blue-200 text-blue-700 text-xs pr-1"
                    role="listitem"
                  >
                    {source === 'rss_feed'
                      ? 'News Feed'
                      : source === 'citizen_verified'
                      ? 'Verified Citizen'
                      : 'Unverified Citizen'}
                    <button
                      aria-label={`Remove source filter: ${source === 'rss_feed'
                        ? 'News Feed'
                        : source === 'citizen_verified'
                        ? 'Verified Citizen'
                        : 'Unverified Citizen'}`}
                      onClick={() =>
                        updateFilters({
                          sourceTypes: filters.sourceTypes.filter((s) => s !== source),
                        })
                      }
                      className="ml-1.5 p-0.5 hover:bg-blue-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 text-center px-2">
        <p>Filters sync with URL for easy sharing</p>
      </div>
    </div>
  );
}
