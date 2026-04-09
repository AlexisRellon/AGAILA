/**
 * Hazard Info Panel Component
 * 
 * Slide-in right panel for displaying detailed hazard information.
 * Replaces modal popups for cleaner, less intrusive UX.
 * 
 * Features:
 * - Smooth slide-in animation from right
 * - Quick stats display (severity, confidence, location)
 * - Action buttons (zoom to, view source)
 * - Close button with keyboard support (Esc)
 * - Responsive design (responsive width on mobile)
 * - Accessibility: Focus trap, ARIA labels, keyboard navigation
 * 
 * Module: GV-02 (Dynamic Markers)
 * Design: Minimalist + Flat design (Eleken guidelines)
 */

import React, { useEffect, useRef } from 'react';
import { X, MapPin, AlertTriangle, TrendingUp, Eye, ExternalLink, Clock } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

interface HazardInfoPanelProps {
  hazard: {
    id: string;
    hazard_type: string;
    severity: string;
    location_name: string;
    latitude: number;
    longitude: number;
    confidence_score: number;
    source_type: string;
    validated: boolean;
    created_at: string;
    source_content?: string;
    source_url?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onZoomTo?: (lat: number, lon: number) => void;
}

const severityConfig = {
  critical: { color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50', label: 'Critical' },
  severe: { color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50', label: 'Severe' },
  moderate: { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50', label: 'Moderate' },
  minor: { color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50', label: 'Minor' },
  unknown: { color: 'bg-gray-500', textColor: 'text-gray-700', bgLight: 'bg-gray-50', label: 'Unknown' },
};

const hazardTypeEmoji: Record<string, string> = {
  flood: '🌊',
  earthquake: '🏚️',
  typhoon: '🌪️',
  landslide: '🏔️',
  volcanic_eruption: '🌋',
  storm_surge: '🌊💨',
  drought: '☀️',
  wildfire: '🔥',
};

export function HazardInfoPanel({
  hazard,
  isOpen,
  onClose,
  onZoomTo,
}: HazardInfoPanelProps) {
  const panelRef = useRef<HTMLBaseElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Implement focus trap
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    // Save the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Get all focusable elements in the panel
    const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus the first element when panel opens
    if (firstElement) {
      firstElement.focus();
    }

    // Handle Tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    if (focusableElements.length > 0) {
      const element = panelRef.current;
      if (element) {
        element.addEventListener('keydown', handleKeyDown);
      }
      
      // Restore focus when panel closes
      return () => {
        if (element) {
          element.removeEventListener('keydown', handleKeyDown);
        }
        if (previousFocusRef.current) {
          previousFocusRef.current.focus();
        }
      };
    }

    // If no focusable elements, just restore focus on close
    if (previousFocusRef.current) {
      return () => {
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  if (!hazard) return null;

  const severity = severityConfig[hazard.severity as keyof typeof severityConfig] || severityConfig.unknown;
  const emoji = hazardTypeEmoji[hazard.hazard_type] || '⚠️';
  const confidencePercentage = Math.round(hazard.confidence_score * 100);
  const createdDate = new Date(hazard.created_at);
  const formattedTime = createdDate.toLocaleTimeString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {/* Backdrop overlay when panel is open - positioned absolute within parent */}
      {isOpen && (
        <div
          className="absolute inset-0 bg-black/30 z-[499]"
          aria-hidden="true"
        />
      )}

      {/* Slide-in Panel - Positioned absolute to match parent height */}
      <aside
        ref={panelRef}
        className={`
          absolute right-0 top-0 h-full w-full sm:w-96 bg-white shadow-2xl z-[2000]
          transform transition-transform duration-300 ease-out motion-reduce:transition-none
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          flex flex-col
        `}
        role="complementary"
        aria-label="Hazard details"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-3xl">{emoji}</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900 capitalize">
                  {hazard.hazard_type.replace(/_/g, ' ')}
                </h2>
                <p className="text-sm text-gray-600 mt-1">{hazard.location_name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Close panel"
            >
              <X className="w-5 h-5 text-gray-600" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Severity Badge */}
          <div className={`${severity.bgLight} rounded-lg p-4`}>
            <div className="flex items-center gap-3">
              <div className={`${severity.color} p-2 rounded-lg`}>
                <AlertTriangle className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">Severity Level</p>
                <p className={`${severity.textColor} font-bold text-lg`}>{severity.label}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            {/* Confidence Score */}
            <Card className="p-3 text-center border-gray-200">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="w-4 h-4 text-blue-600" aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{confidencePercentage}%</p>
              <p className="text-xs text-gray-600 mt-1">Confidence</p>
            </Card>

            {/* Coordinates */}
            <Card className="p-3 text-center border-gray-200">
              <div className="flex items-center justify-center mb-2">
                <MapPin className="w-4 h-4 text-green-600" aria-hidden="true" />
              </div>
              <p className="text-xs text-gray-900 font-mono text-[10px]">
                {hazard.latitude.toFixed(3)}, <br /> {hazard.longitude.toFixed(3)}
              </p>
              <p className="text-xs text-gray-600 mt-1">Location</p>
            </Card>

            {/* Validation Status */}
            <Card className="p-3 text-center border-gray-200">
              <div className="flex items-center justify-center mb-2">
                <Eye className={`w-4 h-4 ${hazard.validated ? 'text-purple-600' : 'text-gray-400'}`} aria-hidden="true" />
              </div>
              <p className="text-xs font-bold text-gray-900 uppercase">{hazard.validated ? 'Valid' : 'Pending'}</p>
              <p className="text-xs text-gray-600 mt-1">Status</p>
            </Card>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Source Type</p>
              <p className="text-sm text-gray-900 mt-1 capitalize">{hazard.source_type}</p>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Reported</p>
              </div>
              <p className="text-sm text-gray-900 mt-1">{formattedTime}</p>
            </div>

            {hazard.source_content && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Source Content</p>
                <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{hazard.source_content}</p>
              </div>
            )}
          </div>

          {/* Information Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>Confidence Score:</strong> This indicates how confident the AI model is about this classification. Higher scores mean more reliable predictions.
            </p>
          </div>
        </div>

        {/* Actions Footer - Always Visible */}
        <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-gray-50 space-y-2">
          <Button
            onClick={() => onZoomTo?.(hazard.latitude, hazard.longitude)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
            title='Zoom to the selected pin location'
          >
            <MapPin className="w-4 h-4 mr-2" aria-hidden="true" />
            Zoom to Location
          </Button>

          {(hazard.source_url?.trim() || hazard.source_content) && (
            <Button
              onClick={() => {
                if (hazard.source_url?.trim()) {
                  window.open(hazard.source_url, '_blank', 'noopener,noreferrer');
                }
              }}
              variant="outline"
              className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
              size="sm"
              disabled={!hazard.source_url?.trim()}
              title={!hazard.source_url?.trim() ? 'Source URL not available' : 'Open original source in new tab'}
            >
              <ExternalLink className="w-4 h-4 mr-2" aria-hidden="true" />
              View Full Source
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}
