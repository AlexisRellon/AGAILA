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
import { Filter, X, ChevronDown, ChevronUp, RotateCcw, Map } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
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
  boundarySettings = {
    showRegions: false,
    showProvinces: false,
    showMunicipalities: false,
  },
  onBoundarySettingsChange,
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
    // Map source to source type
    let sourceType: SourceType = 'rss_feed';
    
    if (['gma_news', 'abs_cbn', 'inquirer', 'rappler', 'philstar'].includes(hazard.source_type.toLowerCase())) {
      sourceType = 'rss_feed';
    } else if (hazard.source_type.toLowerCase().includes('citizen')) {
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
            <Badge variant="default" className="bg-blue-600 text-white font-bold">
              {activeFilterCount} active
            </Badge>
          )}
        </div>

        {/* Reset Button */}
        {!isDefault && (
          <button
            onClick={resetFilters}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-medium text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All Filters
          </button>
        )}
      </Card>

      {/* Hazard Type Filter Section */}
      <div className="space-y-2">
        <button
          onClick={() => toggleSection('hazardTypes')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Hazard Types</h3>
            {filters.hazardTypes.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {filters.hazardTypes.length} selected
              </Badge>
            )}
          </div>
          {expandedSections.hazardTypes ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {expandedSections.hazardTypes && (
          <HazardTypeFilter
            selectedTypes={filters.hazardTypes}
            onTypesChange={(types) => updateFilters({ hazardTypes: types })}
            hazardCounts={hazardTypeCounts}
          />
        )}
      </div>

      {/* Time Window Filter Section */}
      <div className="space-y-2">
        <button
          onClick={() => toggleSection('timeWindow')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Time Range</h3>
            {filters.timeWindow !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          {expandedSections.timeWindow ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {expandedSections.timeWindow && (
          <TimeWindowFilter
            timeWindow={filters.timeWindow}
            customDateRange={filters.customDateRange}
            onTimeWindowChange={(window, customRange) =>
              updateFilters({ timeWindow: window, customDateRange: customRange })
            }
            onExpandChange={onExpandChange}
          />
        )}
      </div>

      {/* Source Type Filter Section */}
      <div className="space-y-2">
        <button
          onClick={() => toggleSection('sourceTypes')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Source Types</h3>
            {filters.sourceTypes.length > 0 && filters.sourceTypes.length < 3 && (
              <Badge variant="secondary" className="text-xs">
                {filters.sourceTypes.length} selected
              </Badge>
            )}
          </div>
          {expandedSections.sourceTypes ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {expandedSections.sourceTypes && (
          <SourceTypeFilter
            selectedSources={filters.sourceTypes}
            onSourcesChange={(sources) => updateFilters({ sourceTypes: sources })}
            sourceCounts={sourceCounts}
          />
        )}
      </div>

      {/* Administrative Boundaries Section */}
      <div className="space-y-2">
        <button
          onClick={() => toggleSection('boundaries')}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
        >
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Administrative Boundaries</h3>
            {(boundarySettings.showRegions || boundarySettings.showProvinces || boundarySettings.showMunicipalities) && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          {expandedSections.boundaries ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {expandedSections.boundaries && (
          <Card className="p-4 space-y-3">
            <p className="text-xs text-gray-600 mb-3">
              Show administrative boundaries on the map. Visibility is automatically adjusted based on zoom level.
            </p>
            
            {/* Regions Checkbox */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="boundary-regions"
                checked={boundarySettings.showRegions}
                onCheckedChange={(checked) =>
                  onBoundarySettingsChange?.({
                    ...boundarySettings,
                    showRegions: checked === true,
                  })
                }
              />
              <div className="flex-1">
                <label
                  htmlFor="boundary-regions"
                  className="text-sm font-medium text-gray-900 cursor-pointer"
                >
                  Regions (17 regions)
                </label>
                <p className="text-xs text-gray-500">Visible at zoom 5-8</p>
              </div>
            </div>

            {/* Provinces Checkbox */}
            <div className="flex items-center space-x-3 opacity-50 cursor-not-allowed" title="Coming soon">
              <Checkbox
                id="boundary-provinces"
                checked={false}
                disabled
              />
              <div className="flex-1">
                <label
                  htmlFor="boundary-provinces"
                  className="text-sm font-medium text-gray-900"
                >
                  Provinces (82 provinces)
                </label>
                <p className="text-xs text-gray-500">Coming soon - Visible at zoom 9-11</p>
              </div>
            </div>

            {/* Municipalities Checkbox */}
            <div className="flex items-center space-x-3 opacity-50 cursor-not-allowed" title="Coming soon">
              <Checkbox
                id="boundary-municipalities"
                checked={false}
                disabled
              />
              <div className="flex-1">
                <label
                  htmlFor="boundary-municipalities"
                  className="text-sm font-medium text-gray-900"
                >
                  Municipalities (1,634 cities/municipalities)
                </label>
                <p className="text-xs text-gray-500">Coming soon - Visible at zoom 12+</p>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                💡 Tip: Boundaries help identify which administrative areas are affected by hazards. Toggle them on/off as needed.
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Filter Summary */}
      {activeFilterCount > 0 && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-blue-900">Active Filters</h3>
              <button
                onClick={resetFilters}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear all
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Hazard Type Tags */}
              {filters.hazardTypes.map((type) => (
                <Badge
                  key={type}
                  variant="secondary"
                  className="bg-white border-blue-200 text-blue-700 text-xs"
                >
                  {type.replace(/_/g, ' ')}
                  <button
                    aria-label={`Remove filter for ${type.replace(/_/g, ' ')}`}
                    onClick={() =>
                      updateFilters({
                        hazardTypes: filters.hazardTypes.filter((t) => t !== type),
                      })
                    }
                    className="ml-1 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}

              {/* Time Window Tag */}
              {filters.timeWindow !== 'all' && (
                <Badge
                  variant="secondary"
                  className="bg-white border-blue-200 text-blue-700 text-xs"
                >
                  {filters.timeWindow === 'custom'
                    ? 'Custom dates'
                    : filters.timeWindow === '24h'
                    ? 'Last 24 hours'
                    : filters.timeWindow === '7d'
                    ? 'Last 7 days'
                    : 'Last 30 days'}
                  <button
                    aria-label={`Remove filter for time window ${filters.timeWindow === 'custom'
                      ? 'Custom dates'
                      : filters.timeWindow === '24h'
                      ? 'Last 24 hours'
                      : filters.timeWindow === '7d'
                      ? 'Last 7 days'
                      : 'Last 30 days'}`}
                    onClick={() => updateFilters({ timeWindow: 'all', customDateRange: undefined })}
                    className="ml-1 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
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
                    className="bg-white border-blue-200 text-blue-700 text-xs"
                  >
                    {source === 'rss_feed'
                      ? 'News Feed'
                      : source === 'citizen_verified'
                      ? 'Verified Citizen'
                      : 'Unverified Citizen'}
                    <button
                      aria-label={`Remove filter for source type ${source === 'rss_feed'
                        ? 'News Feed'
                        : source === 'citizen_verified'
                        ? 'Verified Citizen'
                        : 'Unverified Citizen'}`}
                      onClick={() =>
                        updateFilters({
                          sourceTypes: filters.sourceTypes.filter((s) => s !== source),
                        })
                      }
                      className="ml-1 hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 text-center">
        <p>Filters are automatically saved and synced with URL</p>
      </div>
    </div>
  );
}
