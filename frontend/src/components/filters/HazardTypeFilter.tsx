/**
 * HazardTypeFilter Component
 * 
 * Production-grade hazard type filter with enhanced UI/UX.
 * Multi-select checkbox group for filtering hazards by type.
 * 
 * Module: FP-01
 * Change: filter-ui-ux-design
 * 
 * Design System: GAIA (Lato + Inter fonts, Navy + Blue + Orange brand colors)
 * Animation Strategy: Smooth transitions (200ms), staggered reveals, enhanced checkboxes
 * 
 * Features:
 * - Custom checkbox styling with animated state transitions
 * - Grid layout with improved spacing and hover effects
 * - "Select All" / "Deselect All" toggle with icon feedback
 * - Hazard count per type with dynamic badge styling
 * - Icon visualization for each hazard type (from centralized registry)
 * - Staggered animation on reveal
 * - Respects prefers-reduced-motion
 */

import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ALL_HAZARD_TYPES } from '../../hooks/useHazardFilters';
import { HAZARD_ICON_REGISTRY, HazardIcon } from '../../constants/hazard-icons';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HazardTypeFilterProps {
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
  hazardCounts?: Record<string, number>;
  disabled?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HazardTypeFilter({
  selectedTypes,
  onTypesChange,
  hazardCounts = {},
  disabled = false,
}: HazardTypeFilterProps) {
  
  // ============================================================================
  // STATE DERIVATIONS
  // ============================================================================
  
  const allSelected = selectedTypes.length === ALL_HAZARD_TYPES.length;
  const noneSelected = selectedTypes.length === 0;
  const totalCount = Object.values(hazardCounts).reduce((sum, count) => sum + count, 0);

  // ============================================================================
  // HELPER: Determine visual state of a hazard type item
  // ============================================================================
  
  /**
   * Returns the visual state of a hazard type checkbox based on:
   * - Whether this type is selected
   * - Whether any types are selected (neutral state when none selected)
   * 
   * States:
   * - 'selected': This type is actively checked
   * - 'neutral': No types selected (show all are visible)
   * - 'deselected': Some types selected but not this one
   */
  const getItemState = (typeIsSelected: boolean) => {
    if (typeIsSelected) return 'selected';
    if (noneSelected) return 'neutral';
    return 'deselected';
  };

  // ============================================================================
  // HELPER: Get background class for item container based on state
  // ============================================================================
  
  const getItemBackgroundClass = (state: 'selected' | 'neutral' | 'deselected') => {
    switch (state) {
      case 'selected':
        return 'border-red-400 bg-gradient-to-br from-red-50 to-red-50/30 shadow-sm';
      case 'neutral':
        return 'border-secondary-200 bg-secondary-50 hover:border-secondary-300';
      case 'deselected':
        return 'border-gray-200 bg-white hover:border-gray-300';
    }
  };

  // ============================================================================
  // HELPER: Get checkbox background class based on state
  // ============================================================================
  
  const getCheckboxClass = (state: 'selected' | 'neutral' | 'deselected') => {
    switch (state) {
      case 'selected':
        return 'bg-red-500 border-red-500';
      case 'neutral':
        return 'bg-secondary-200 border-secondary-300';
      case 'deselected':
        return 'border-gray-300 bg-white group-hover:border-red-300';
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
      backgroundColor = '#c0dff3';
      iconColor = '#005A9C';
    } else if (state === 'selected') {
      backgroundColor = `${color}30`;
      iconColor = color;
    } else {
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
   * Toggle all hazard types
   */
  const handleToggleAll = () => {
    if (allSelected) {
      onTypesChange([]);
    } else {
      onTypesChange([...ALL_HAZARD_TYPES]);
    }
  };
  
  /**
   * Toggle individual hazard type
   */
  const handleToggleType = (type: string) => {
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter(t => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

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

        .hazard-item {
          animation: slideInDown 0.25s ease-out forwards;
        }

        .hazard-item:nth-child(1) { animation-delay: 0ms; }
        .hazard-item:nth-child(2) { animation-delay: 40ms; }
        .hazard-item:nth-child(3) { animation-delay: 80ms; }
        .hazard-item:nth-child(4) { animation-delay: 120ms; }
        .hazard-item:nth-child(5) { animation-delay: 160ms; }
        .hazard-item:nth-child(6) { animation-delay: 200ms; }

        @media (prefers-reduced-motion: reduce) {
          .hazard-item {
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
            <h3 className="text-sm font-semibold text-primary-600 font-lato">Hazard Type</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-inter">Filter by hazard classification</p>
          </div>
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
            aria-label={allSelected ? 'Deselect all hazard types' : 'Select all hazard types'}
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
        </div>

        {/* Summary Badge */}
        {!noneSelected && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-secondary-50 to-secondary-50/50 rounded-lg border border-secondary-100">
            <Badge variant="secondary" className="font-semibold text-secondary-900 bg-secondary-200">
              {selectedTypes.length} / {ALL_HAZARD_TYPES.length}
            </Badge>
            {totalCount > 0 && (
              <span className="text-xs font-medium text-slate-600 font-inter">
                {totalCount} hazard{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Hazard Type Grid - Single Column for optimal text/badge fit */}
        <div className="grid grid-cols-1 gap-2.5">
          {ALL_HAZARD_TYPES.map((type) => {
            const config = HAZARD_ICON_REGISTRY[type as keyof typeof HAZARD_ICON_REGISTRY] || HAZARD_ICON_REGISTRY.other;
            const count = hazardCounts[type] || 0;
            const typeIsSelected = selectedTypes.includes(type);
            const state = getItemState(typeIsSelected);
            const itemBgClass = getItemBackgroundClass(state);
            const checkboxClass = getCheckboxClass(state);
            const iconStyles = getIconStyles(state, config.color);
            const labelClass = getLabelClass(state);
            
            return (
              <label
                key={type}
                className="hazard-item"
              >
                <div
                  className={`
                    group relative flex items-center gap-3 p-3 rounded-lg
                    border-2 transition-all duration-200 cursor-pointer
                    ${itemBgClass}
                    ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:shadow-sm'}
                    focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2
                  `}
                >
                  {/* Hidden Checkbox */}
                  <input
                    type="checkbox"
                    checked={typeIsSelected}
                    onChange={() => handleToggleType(type)}
                    disabled={disabled}
                    className="sr-only"
                  />
                  
                  {/* Custom Checkbox */}
                  <div className="flex-shrink-0">
                    <div
                      className={`
                        w-5 h-5 rounded-md border-2 flex items-center justify-center
                        transition-all duration-200
                        ${checkboxClass}
                      `}
                    >
                      {typeIsSelected && (
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
                      {state === 'neutral' && (
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
                  
                  {/* Icon Container */}
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
                    <HazardIcon hazardType={type} size={18} />
                  </div>
                  
                  {/* Label and Badge Container - Flex row to fit text and badge horizontally */}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium transition-colors duration-200 truncate ${labelClass}`}>
                      {config.label}
                    </span>
                    
                    {/* Count Badge - Always visible, right-aligned */}
                    <Badge
                      variant={count > 0 ? 'secondary' : 'outline'}
                      className={`text-xs flex-shrink-0 transition-all duration-200 whitespace-nowrap ${
                        count > 0
                          ? 'font-bold text-accent-900 bg-accent-200 shadow-sm'
                          : 'font-normal text-slate-500'
                      }`}
                    >
                      {count}
                    </Badge>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* No Selection Message */}
        {noneSelected && (
          <div className="text-center py-4 px-3 bg-gradient-to-r from-slate-50 to-slate-50/50 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-900">
              All hazard types are visible
            </p>
            <p className="text-xs text-slate-500 mt-1.5">
              Select specific types to filter
            </p>
          </div>
        )}

        {/* Info Note */}
        <div className="text-xs bg-gradient-to-br from-slate-50 to-red-50/30 rounded-lg p-3 border border-slate-200 space-y-1.5">
          <p className="font-semibold text-slate-900">
            Hazard Classification
          </p>
          <p className="text-slate-600 leading-relaxed">
            Filter events based on type of natural hazard detected by our AI system. Includes floods, typhoons, earthquakes, and other environmental threats.
          </p>
        </div>
      </div>
    </Card>
  );
}