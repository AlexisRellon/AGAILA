/**
 * SourceTypeFilter Component
 *
 * Production-grade source type filter with unified checkbox pattern.
 * Filters hazards by source type (RSS feeds, verified and unverified citizen reports).
 * Hides "Citizen Report - Unverified" option from unauthenticated users.
 *
 * Module: FP-04
 * Change: unified-filter-pattern
 *
 * Design System: AGAILA brand (navy primary, steel blue secondary, orange accent)
 * Typography: Lato (primary), Inter (secondary)
 * Animation: Smooth transitions (200ms), staggered reveals, respects prefers-reduced-motion
 *
 * Features:
 * - Custom checkbox styling with animated state transitions
 * - Grid layout with consistent spacing and hover effects
 * - "Select All" / "Deselect All" toggle with icon feedback
 * - Source count badges with dynamic styling
 * - Icon visualization for each source type
 * - Authentication-aware: unverified option only for authenticated users
 * - Staggered animation on reveal
 * - WCAG 2.1 AA accessibility
 */

import React, { useState, useEffect } from 'react';
import { Newspaper, UserCheck, ShieldAlert } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { supabase } from '../../lib/supabase';
import type { SourceType } from '../../hooks/useHazardFilters';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SourceTypeFilterProps {
  selectedSources: SourceType[];
  onSourcesChange: (sources: SourceType[]) => void;
  sourceCounts?: Record<SourceType, number>;
  disabled?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_OPTIONS = [
  {
    value: 'rss_feed' as SourceType,
    label: 'News Feed',
    icon: Newspaper,
    color: '#005A9C', // Steel blue
    requiresAuth: false,
  },
  {
    value: 'citizen_verified' as SourceType,
    label: 'Citizen - Verified',
    icon: UserCheck,
    color: '#10b981', // Green
    requiresAuth: false,
  },
  {
    value: 'citizen_unverified' as SourceType,
    label: 'Citizen - Unverified',
    icon: ShieldAlert,
    color: '#f59e0b', // Amber
    requiresAuth: true,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function SourceTypeFilter({
  selectedSources,
  onSourcesChange,
  sourceCounts = {} as Record<SourceType, number>,
  disabled = false,
}: SourceTypeFilterProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Check user authentication status on mount and listen for auth changes
   */
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error('Auth check error:', error);
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(!!user);
        }
      } catch (err) {
        console.error('Failed to check auth status:', err);
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();

    // Listen for auth state changes (e.g., login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ============================================================================
  // STATE DERIVATIONS
  // ============================================================================

  // Available sources depend on authentication status
  const availableSources = SOURCE_OPTIONS.filter(
    opt => !opt.requiresAuth || isAuthenticated
  ).map(opt => opt.value);
  
  const allSelected = availableSources.every(source => selectedSources.includes(source));
  const noneSelected = selectedSources.length === 0;
  const totalCount = Object.values(sourceCounts).reduce((sum, count) => sum + count, 0);

  // ============================================================================
  // HELPER: Determine visual state of a source type item
  // ============================================================================

  /**
   * Returns the visual state of a source type checkbox based on:
   * - Whether this source is selected
   * - Whether any sources are selected (neutral state when none selected)
   *
   * States:
   * - 'selected': This source is actively checked
   * - 'neutral': No sources selected (show all are visible)
   * - 'deselected': Some sources selected but not this one
   */
  const getItemState = (sourceIsSelected: boolean) => {
    if (sourceIsSelected) return 'selected';
    if (noneSelected) return 'neutral';
    return 'deselected';
  };

  // ============================================================================
  // HELPER: Get background class for item container based on state
  // ============================================================================

  const getItemBackgroundClass = (state: 'selected' | 'neutral' | 'deselected') => {
    switch (state) {
      case 'selected':
        // Highlight selected source with steel blue accent
        return 'border-secondary-400 bg-gradient-to-br from-secondary-50 to-secondary-50/30 shadow-sm';
      case 'neutral':
        // When no selection made, show subtle neutral state
        return 'border-secondary-200 bg-secondary-50 hover:border-secondary-300';
      case 'deselected':
        // When some sources selected but not this one
        return 'border-gray-200 bg-white hover:border-gray-300';
    }
  };

  // ============================================================================
  // HELPER: Get checkbox background class based on state
  // ============================================================================

  const getCheckboxClass = (state: 'selected' | 'neutral' | 'deselected') => {
    switch (state) {
      case 'selected':
        // Navy primary when checked
        return 'bg-primary-600 border-primary-600';
      case 'neutral':
        // Steel blue when neutral (no selection)
        return 'bg-secondary-200 border-secondary-300';
      case 'deselected':
        // Subtle gray when deselected with hover effect
        return 'border-gray-300 bg-white group-hover:border-secondary-400';
    }
  };

  // ============================================================================
  // HELPER: Get icon container styles based on state
  // ============================================================================

  const getIconStyles = (state: 'selected' | 'neutral' | 'deselected', color: string) => {
    const baseScale = state === 'selected' ? 'scale-110' : 'scale-100';
    const hoverScale = state === 'deselected' ? 'group-hover:scale-105' : '';
    
    let backgroundColor: string;
    let iconColor: string;

    if (state === 'neutral') {
      // Steel blue background for neutral state
      backgroundColor = '#c0dff3';
      iconColor = '#005A9C';
    } else if (state === 'selected') {
      // Color-coded for selected state
      backgroundColor = `${color}30`;
      iconColor = color;
    } else {
      // Subtle gray for deselected
      backgroundColor = `${color}15`;
      iconColor = '#9ca3af';
    }

    return {
      scaleClass: `${baseScale} ${hoverScale}`,
      backgroundColor,
      iconColor,
    };
  };

  // ============================================================================
  // HELPER: Get label text class based on state
  // ============================================================================

  const getLabelClass = (state: 'selected' | 'neutral' | 'deselected') => {
    switch (state) {
      case 'selected':
        return 'text-slate-900 font-semibold font-lato';
      case 'neutral':
        return 'text-slate-700 font-lato';
      case 'deselected':
        return 'text-slate-700 group-hover:text-slate-900 font-lato';
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Toggle all available source types
   */
  const handleToggleAll = () => {
    if (allSelected) {
      // Deselect all when all are selected
      onSourcesChange([]);
    } else {
      // Select all available (respects auth)
      onSourcesChange(availableSources);
    }
  };

  /**
   * Toggle individual source type
   */
  const handleToggleSource = (source: SourceType) => {
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter(s => s !== source));
    } else {
      onSourcesChange([...selectedSources, source]);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Card className="p-5 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <style>{`
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .source-item {
          animation: slideInDown 0.25s ease-out forwards;
        }

        .source-item:nth-child(1) { animation-delay: 0ms; }
        .source-item:nth-child(2) { animation-delay: 40ms; }
        .source-item:nth-child(3) { animation-delay: 80ms; }

        @media (prefers-reduced-motion: reduce) {
          .source-item {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      <div className="space-y-4">
        {/* Header with Select All */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-primary-600 font-lato">Source Type</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-inter">Filter by information source</p>
          </div>
          {!isCheckingAuth && (
            <button
              onClick={handleToggleAll}
              disabled={disabled}
              className="
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                rounded-md transition-all duration-200
                text-slate-700 hover:bg-slate-100 hover:text-slate-900
                disabled:text-slate-400 disabled:bg-transparent disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              "
              aria-label={allSelected ? 'Deselect all source types' : 'Select all source types'}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                {allSelected ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                )}
              </svg>
              <span>{allSelected ? 'Clear' : 'All'}</span>
            </button>
          )}
        </div>

        {/* Summary Badge - Shows selection count when not all are visible */}
        {!noneSelected && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-secondary-50 to-secondary-50/50 rounded-lg border border-secondary-100">
            <Badge variant="secondary" className="font-semibold text-secondary-900 bg-secondary-200">
              {selectedSources.length} / {availableSources.length}
            </Badge>
            {totalCount > 0 && (
              <span className="text-xs font-medium text-slate-600 font-inter">
                {totalCount} hazard{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Source Type Grid - Aligned with HazardTypeFilter pattern */}
        <div className="grid grid-cols-1 sm:grid-cols-1 gap-2.5">
          {SOURCE_OPTIONS.map((option) => {
            // Hide unverified option from unauthenticated users
            if (option.requiresAuth && !isAuthenticated) {
              return null;
            }

            const Icon = option.icon;
            const count = sourceCounts[option.value] || 0;
            const sourceIsSelected = selectedSources.includes(option.value);
            const state = getItemState(sourceIsSelected);
            const itemBgClass = getItemBackgroundClass(state);
            const checkboxClass = getCheckboxClass(state);
            const iconStyles = getIconStyles(state, option.color);
            const labelClass = getLabelClass(state);
            
            return (
              <label
                key={option.value}
                className="source-item"
              >
                <div
                  className={`
                    group relative flex items-start gap-3 p-3.5 rounded-lg
                    border-2 transition-all duration-200 cursor-pointer
                    ${itemBgClass}
                    ${disabled || isCheckingAuth ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:shadow-sm'}
                    focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2
                  `}
                >
                  {/* Hidden Checkbox Input */}
                  <input
                    type="checkbox"
                    checked={sourceIsSelected}
                    onChange={() => handleToggleSource(option.value)}
                    disabled={disabled || isCheckingAuth}
                    className="sr-only"
                  />
                  
                  {/* Custom Checkbox Visual */}
                  <div className="flex-shrink-0 pt-1">
                    <div
                      className={`
                        w-5 h-5 rounded-md border-2 flex items-center justify-center
                        transition-all duration-200
                        ${checkboxClass}
                      `}
                    >
                      {sourceIsSelected && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {state === 'neutral' && !sourceIsSelected && (
                        <svg
                          className="w-3 h-3 text-slate-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Icon and Label Row */}
                    <div className="flex items-center gap-3 mb-1">
                      {/* Icon with Dynamic Background */}
                      <div 
                        className={`
                          flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0
                          transition-all duration-200
                          ${iconStyles.scaleClass}
                        `}
                        style={{ 
                          backgroundColor: iconStyles.backgroundColor,
                          color: iconStyles.iconColor,
                        }}
                      >
                        <Icon size={18} strokeWidth={2.5} />
                      </div>
                      
                      {/* Label and Count */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-sm font-medium transition-colors duration-200 ${labelClass}`}>
                          {option.label}
                        </span>
                        
                        {/* Count Badge - Dynamic styling */}
                        <Badge
                          variant={count > 0 ? 'secondary' : 'outline'}
                          className={`text-xs flex-shrink-0 transition-all duration-200 ${
                            count > 0
                              ? 'font-bold text-accent-900 bg-accent-200 shadow-sm'
                              : 'font-normal text-slate-500'
                          }`}
                        >
                          {count}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Loading State - Show while checking authentication */}
        {isCheckingAuth && (
          <div className="text-center py-3 px-3 bg-gradient-to-r from-slate-50 to-slate-50/50 rounded-lg border border-slate-200 animate-pulse">
            <p className="text-xs text-slate-600 font-medium font-inter">
              Checking authentication status...
            </p>
          </div>
        )}

        {/* Authentication Info - Show when user is not authenticated */}
        {!isCheckingAuth && !isAuthenticated && (
          <div className="
            text-xs bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-3.5 
            border border-amber-200 flex items-start gap-3 shadow-sm
          ">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 flex-none" />
            <div>
              <p className="font-semibold text-amber-900 mb-1">Limited Access</p>
              <p className="text-amber-700 leading-relaxed">
                Sign in to view unverified citizen reports.
              </p>
            </div>
          </div>
        )}

        {/* No Selection Message - Show when all sources are deselected */}
        {noneSelected && !isCheckingAuth && (
          <div className="text-center py-4 px-3 bg-gradient-to-r from-slate-50 to-slate-50/50 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-900">All source types are visible</p>
            <p className="text-xs text-slate-500 mt-1.5 font-inter">
              Select specific sources to filter the map
            </p>
          </div>
        )}

        {/* Info Note - About source types */}
        <div className="text-xs bg-gradient-to-br from-slate-50 to-secondary-50/30 rounded-lg p-3 border border-slate-200 space-y-1.5">
          <p className="font-semibold text-slate-900">About Source Types</p>
          <p className="text-slate-600 leading-relaxed">
            Unverified citizen reports require manual validation by authorities. Verified sources include official news feeds and confirmed citizen reports.
          </p>
        </div>
      </div>
    </Card>
  );
}