/**
 * TimeWindowFilter Component
 * 
 * Date range picker with preset options for filtering hazards by time.
 * Supports preset buttons and custom date range selection.
 * 
 * Module: FP-03
 * Change: add-advanced-map-features
 * 
 * Features:
 * - Preset buttons: "All Time", "Last 24 Hours", "Last 7 Days", "Last 30 Days"
 * - Custom date range picker with react-day-picker
 * - Timezone handling (Philippine Time GMT+8)
 * - Active range display
 * - Validation for invalid date ranges
 */

import React, { useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { format, subDays, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { DayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import type { TimeWindow, CustomDateRange } from '../../hooks/useHazardFilters';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TimeWindowFilterProps {
  timeWindow: TimeWindow;
  customDateRange?: CustomDateRange;
  onTimeWindowChange: (window: TimeWindow, customRange?: CustomDateRange) => void;
  disabled?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRESET_OPTIONS = [
  { value: 'all' as TimeWindow, label: 'All Time', icon: Clock },
  { value: '24h' as TimeWindow, label: 'Last 24 Hours', icon: Clock },
  { value: '7d' as TimeWindow, label: 'Last 7 Days', icon: Calendar },
  { value: '30d' as TimeWindow, label: 'Last 30 Days', icon: Calendar },
  { value: 'custom' as TimeWindow, label: 'Custom Range', icon: Calendar },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date range for display
 */
function formatDateRange(window: TimeWindow, customRange?: CustomDateRange): string {
  switch (window) {
    case '24h':
      return 'Last 24 hours';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case 'custom':
      if (customRange) {
        return `${format(customRange.start, 'MMM d, yyyy')} - ${format(customRange.end, 'MMM d, yyyy')}`;
      }
      return 'Select date range';
    case 'all':
    default:
      return 'All time';
  }
}

/**
 * Validate date range
 */
function validateDateRange(start: Date, end: Date): string | null {
  // Check if end is before start
  if (isBefore(end, start)) {
    return 'End date must be after start date';
  }
  
  // Check if dates are in the future
  const now = new Date();
  if (isAfter(start, now)) {
    return 'Start date cannot be in the future';
  }
  
  if (isAfter(end, now)) {
    return 'End date cannot be in the future';
  }
  
  return null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TimeWindowFilter({
  timeWindow,
  customDateRange,
  onTimeWindowChange,
  disabled = false,
  onExpandChange,
}: TimeWindowFilterProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(timeWindow === 'custom');
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(
    customDateRange ? { from: customDateRange.start, to: customDateRange.end } : undefined
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  /**
   * Handle preset button click
   */
  const handlePresetClick = (preset: TimeWindow) => {
    if (preset === 'custom') {
      setShowCustomPicker(true);
      onExpandChange?.(true); // Expand sidebar for calendar
      onTimeWindowChange('custom', customDateRange);
    } else {
      setShowCustomPicker(false);
      onExpandChange?.(false); // Collapse sidebar
      setValidationError(null);
      onTimeWindowChange(preset);
    }
  };

  /**
   * Handle custom date range selection (v9 API: selected, triggerDate, modifiers, event)
   */
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setSelectedRange(range);

    if (range?.from && range?.to) {
      const start = startOfDay(range.from);
      const end = endOfDay(range.to);

      const error = validateDateRange(start, end);
      setValidationError(error);

      if (!error) {
        onTimeWindowChange('custom', { start, end });
      }
    } else {
      setValidationError(null);
    }
  };

  /**
   * Clear custom date range
   */
  const handleClearCustom = () => {
    setSelectedRange(undefined);
    setValidationError(null);
    setShowCustomPicker(false);
    onExpandChange?.(false); // Collapse sidebar
    onTimeWindowChange('all');
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Time Window</h3>
          {timeWindow !== 'all' && (
            <button
              onClick={handleClearCustom}
              disabled={disabled}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Active Range Display */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-medium">
            <Clock className="w-3 h-3 mr-1" />
            {formatDateRange(timeWindow, customDateRange)}
          </Badge>
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {PRESET_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = timeWindow === option.value;
            
            return (
              <button
                key={option.value}
                onClick={() => handlePresetClick(option.value)}
                disabled={disabled}
                className={`
                  flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-medium
                  ${isActive 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <Icon size={16} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Date Picker */}
        {showCustomPicker && (
          <div className="space-y-3 pt-3 border-t border-gray-200 w-full max-w-full min-w-0 overflow-hidden">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Custom Date Range
              </h4>
              {selectedRange?.from && selectedRange?.to && !validationError && (
                <button
                  onClick={handleClearCustom}
                  disabled={disabled}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed"
                >
                  Clear selection
                </button>
              )}
            </div>

            {/* Date Picker - Compact Calendar with proper range highlighting */}
            <div 
              className="w-full bg-white rounded-lg border border-gray-200 p-3 overflow-hidden"
              style={{
                '--rdp-accent-color': '#3b82f6',
                '--rdp-accent-background-color': '#dbeafe',
                '--rdp-day-height': '36px',
                '--rdp-day-width': '36px',
                '--rdp-day_button-height': '34px',
                '--rdp-day_button-width': '34px',
                '--rdp-range_start-date-background-color': '#3b82f6',
                '--rdp-range_end-date-background-color': '#3b82f6',
                '--rdp-range_middle-background-color': '#dbeafe',
                '--rdp-range_middle-color': '#1e40af',
                '--rdp-today-color': '#3b82f6',
              } as React.CSSProperties}
            >
              <style>{`
                .compact-rdp { width: 100%; }
                .compact-rdp .rdp-months { width: 100%; }
                .compact-rdp .rdp-month { width: 100%; }
                .compact-rdp .rdp-month_grid { width: 100%; }
                .compact-rdp .rdp-month_caption { font-size: 15px; font-weight: 600; }
                .compact-rdp .rdp-weekday { padding: 8px 0; font-size: 12px; font-weight: 600; color: #6b7280; }
                .compact-rdp .rdp-day button { font-size: 14px; transition: all 0.15s ease; }
                .compact-rdp .rdp-disabled { opacity: 0.35; cursor: not-allowed; }
              `}</style>
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={handleDateRangeSelect}
                disabled={[
                  { after: new Date() },
                ]}
                numberOfMonths={1}
                defaultMonth={customDateRange?.start || subDays(new Date(), 30)}
                className="compact-rdp"
                showOutsideDays
              />
            </div>

            {/* Validation Error */}
            {validationError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {validationError}
              </div>
            )}

            {/* Date Range Display */}
            {selectedRange?.from && selectedRange?.to && !validationError && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 font-medium">Start:</span>
                  <span className="text-gray-900 font-semibold">
                    {format(selectedRange.from, 'MMMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 font-medium">End:</span>
                  <span className="text-gray-900 font-semibold">
                    {format(selectedRange.to, 'MMMM d, yyyy')}
                  </span>
                </div>
              </div>
            )}

            {/* Instruction Text */}
            {!selectedRange?.from && (
              <p className="text-xs text-gray-500 text-center italic">
                Click to select start date, then click again for end date
              </p>
            )}
          </div>
        )}

        {/* Info Note */}
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-200">
          <p className="font-medium text-gray-700 mb-1">Note:</p>
          <p>All times are in Philippine Time (GMT+8). Future dates are not selectable.</p>
        </div>
      </div>
    </Card>
  );
}
