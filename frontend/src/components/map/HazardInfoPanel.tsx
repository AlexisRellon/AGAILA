/**
 * Hazard Info Panel Component
 * 
 * Slide-in right panel for displaying detailed hazard information.
 * Replaces modal popups for cleaner, less intrusive UX.
 * 
 * Features:
 * - Smooth fade animation (always in DOM, opacity hidden)
 * - Quick stats display (severity, confidence, location)
 * - Action buttons (zoom to, view source)
 * - Close button with keyboard support (Esc)
 * - Responsive design (responsive width on mobile)
 * - Accessibility: Focus trap, ARIA labels, keyboard navigation
 * 
 * Module: GV-02 (Dynamic Markers)
 * Design: Minimalist + Flat design (Eleken guidelines)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition, faTimes, faMapPin, faExclamationTriangle, faChartLine, faEye, faExternalLinkAlt, faClock, faFire, faHouseChimneyCrack, faHouseFloodWater, faHurricane, faHillRockslide, faVolcano, faSunPlantWilt, faHouseFloodWaterCircleArrowRight } from '@fortawesome/free-solid-svg-icons';
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

const hazardTypeIcons: Record<string, IconDefinition> = {
  flood: faHouseFloodWater,
  earthquake: faHouseChimneyCrack,
  typhoon: faHurricane,
  landslide: faHillRockslide,
  volcanic_eruption: faVolcano,
  storm_surge: faHouseFloodWaterCircleArrowRight,
  drought: faSunPlantWilt,
  wildfire: faFire,
};

export function HazardInfoPanel({
  hazard,
  isOpen,
  onClose,
  onZoomTo,
}: HazardInfoPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Handle close with animation delay
  const handleClose = useCallback(() => {
    // Clear any existing timeout to prevent duplicate timers
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    setIsClosing(true);
    // Wait for animation to complete before calling onClose
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300); // Match animation duration
  }, [onClose]);

  // Cleanup timeout on unmount or when closing
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isClosing) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isClosing, handleClose]);

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

    // Focus the first element when panel opens, or fall back to close button if no hazard
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
  }, [isOpen, hazard]);

  // No overflow handling needed - panel is absolutely positioned and doesn't affect body layout
  // The backdrop overlay prevents interaction with content behind the panel

  const severity = hazard ? (severityConfig[hazard.severity as keyof typeof severityConfig] || severityConfig.unknown) : severityConfig.unknown;
  const confidencePercentage = hazard ? Math.round(hazard.confidence_score * 100) : 0;
  const createdDate = hazard ? new Date(hazard.created_at) : new Date();
  const formattedTime = createdDate.toLocaleTimeString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <style>{`
        .hazard-panel {
          transition: opacity 0.3s ease;
          will-change: opacity;
        }

        .hazard-panel-visible {
          opacity: 1;
          pointer-events: auto;
        }

        .hazard-panel-hidden {
          opacity: 0;
          pointer-events: none;
        }

        .hazard-backdrop {
          transition: opacity 0.3s ease;
          will-change: opacity;
        }

        .hazard-backdrop-visible {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }

        .hazard-backdrop-hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .hazard-panel,
          .hazard-backdrop {
            transition: none;
          }
        }
      `}</style>

      {/* Backdrop overlay - always in DOM */}
      <div
        onClick={isOpen && !isClosing ? handleClose : undefined}
        className={`
          absolute inset-0 z-[1999] cursor-pointer hazard-backdrop
          ${isOpen && !isClosing ? 'hazard-backdrop-visible bg-black/30' : 'hazard-backdrop-hidden bg-transparent'}
        `}
        aria-hidden="true"
        role={isOpen && !isClosing ? "button" : undefined}
        tabIndex={isOpen && !isClosing ? -1 : undefined}
      />
    

      {/* Slide-in Panel - always in DOM, hidden with translateX */}
      <aside
        ref={panelRef}
        className={`
          absolute inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-[2000]
          flex flex-col hazard-panel
          ${isOpen && !isClosing ? 'hazard-panel-visible' : 'hazard-panel-hidden'}
        `}
        role="complementary"
        aria-label="Hazard details"
        aria-hidden={!isOpen || isClosing}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100">
                <FontAwesomeIcon 
                  icon={hazard ? (hazardTypeIcons[hazard.hazard_type] || faExclamationTriangle) : faExclamationTriangle} 
                  className="text-lg text-gray-700"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 capitalize">
                  {hazard ? hazard.hazard_type.replace(/_/g, ' ') : 'No hazard selected'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">{hazard ? hazard.location_name : 'No hazard selected'}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-2 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Close panel"
            >
              <FontAwesomeIcon icon={faTimes} className="text-gray-600" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {hazard ? (
            <>
              {/* Severity Badge */}
              <div className={`${severity.bgLight} rounded-lg p-4`}>
                <div className="flex items-center gap-3">
                  <div className={`${severity.color} p-2 rounded-lg flex items-center justify-center w-8 h-8`}>
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-white text-sm" aria-hidden="true" />
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
                    <FontAwesomeIcon icon={faChartLine} className="text-blue-600 text-sm" aria-hidden="true" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{confidencePercentage}%</p>
                  <p className="text-xs text-gray-600 mt-1">Confidence</p>
                </Card>

                {/* Coordinates */}
                <Card className="p-3 text-center border-gray-200">
                  <div className="flex items-center justify-center mb-2">
                    <FontAwesomeIcon icon={faMapPin} className="text-green-600 text-sm" aria-hidden="true" />
                  </div>
                  <p className="text-xs text-gray-900 font-mono text-[10px]">
                    {hazard.latitude.toFixed(3)}, <br /> {hazard.longitude.toFixed(3)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Location</p>
                </Card>

                {/* Validation Status */}
                <Card className="p-3 text-center border-gray-200">
                  <div className="flex items-center justify-center mb-2">
                    <FontAwesomeIcon 
                      icon={faEye} 
                      className={`text-sm ${hazard.validated ? 'text-purple-600' : 'text-gray-400'}`} 
                      aria-hidden="true" 
                    />
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
                    <FontAwesomeIcon icon={faClock} className="text-gray-400 text-sm" aria-hidden="true" />
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
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>No hazard selected</p>
            </div>
          )}
        </div>

        {/* Actions Footer - Always Visible */}
        <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-gray-50 space-y-2">
          <Button
            onClick={() => hazard && onZoomTo?.(hazard.latitude, hazard.longitude)}
            disabled={!hazard}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            size="sm"
            title='Zoom to the selected pin location'
          >
            <FontAwesomeIcon icon={faMapPin} className="mr-2 text-sm" aria-hidden="true" />
            Zoom to Location
          </Button>

          {hazard?.source_url?.trim() && (
            <Button
              onClick={() => {
                if (hazard.source_url?.trim()) {
                  window.open(hazard.source_url, '_blank', 'noopener,noreferrer');
                }
              }}
              variant="outline"
              className="w-full border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-blue-50"
              size="sm"
              title="Open original source in new tab"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} className="mr-2 text-sm" aria-hidden="true" />
              View Full Source
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}