/**
 * Map Controls Component (Redesigned)
 * 
 * Modern minimal layer controls for map features.
 * Follows Eleken Map UI Design Guidelines - minimalist aesthetic.
 * 
 * Features:
 * - Compact horizontal layout (desktop) / icon buttons (mobile)
 * - Toggle clustering & heatmap with instant visual feedback
 * - Smart settings panel (collapsible on small screens)
 * - Accessibility: ARIA labels, keyboard nav, focus management
 * 
 * Module: GV-03, GV-04
 * Design: Minimalist + Flat (navy/orange accents)
 */

import React, { useState, useRef, useEffect } from 'react';
import { Layers, Map as MapIcon, Settings, X } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

interface MapControlsProps {
  clusteringEnabled: boolean;
  onToggleClustering: (enabled: boolean) => void;
  heatmapEnabled: boolean;
  onToggleHeatmap: (enabled: boolean) => void;
  currentZoom: number;
  heatmapMaxZoom: number;
  heatmapRadius?: number;
  heatmapBlur?: number;
  onHeatmapSettingsChange?: (settings: { radius?: number; blur?: number; maxZoom?: number }) => void;
}

export function MapControls({
  clusteringEnabled,
  onToggleClustering,
  heatmapEnabled,
  onToggleHeatmap,
  currentZoom,
  heatmapMaxZoom,
  heatmapRadius = 25,
  heatmapBlur = 15,
  onHeatmapSettingsChange,
}: MapControlsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [localRadius, setLocalRadius] = useState(heatmapRadius);
  const [localBlur, setLocalBlur] = useState(heatmapBlur);
  const [localMaxZoom, setLocalMaxZoom] = useState(heatmapMaxZoom);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  
  const isHeatmapAutoDisabled = currentZoom > heatmapMaxZoom;

  // Sync local state with prop updates
  useEffect(() => {
    setLocalRadius(heatmapRadius);
    setLocalBlur(heatmapBlur);
    setLocalMaxZoom(heatmapMaxZoom);
  }, [heatmapRadius, heatmapBlur, heatmapMaxZoom]);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(e.target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showSettings]);

  const handleRadiusChange = (value: number) => {
    setLocalRadius(value);
    onHeatmapSettingsChange?.({ radius: value });
  };

  const handleBlurChange = (value: number) => {
    setLocalBlur(value);
    onHeatmapSettingsChange?.({ blur: value });
  };

  const handleMaxZoomChange = (value: number) => {
    setLocalMaxZoom(value);
    onHeatmapSettingsChange?.({ maxZoom: value });
  };


  return (
    <div 
      className="absolute top-44 sm:top-48 right-3 sm:right-4 z-[1000]"
      role="region"
      aria-label="Map layer controls"
    >
      {/* Main Controls - Compact Card */}
      <Card className="p-2 sm:p-3 bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Clustering Toggle - Icon Button */}
          <button
            type="button"
            onClick={() => onToggleClustering(!clusteringEnabled)}
            className={`
              p-2.5 rounded-lg transition-all duration-200 motion-reduce:transition-none
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
              ${clusteringEnabled 
                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }
            `}
            role="switch"
            aria-checked={clusteringEnabled}
            aria-label={`${clusteringEnabled ? 'Disable' : 'Enable'} marker clustering`}
            title="Clustering"
          >
            <Layers className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>

          {/* Heatmap Toggle - Icon Button */}
          <button
            type="button"
            onClick={() => onToggleHeatmap(!heatmapEnabled)}
            disabled={isHeatmapAutoDisabled}
            className={`
              p-2.5 rounded-lg transition-all duration-200 motion-reduce:transition-none
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
              ${isHeatmapAutoDisabled
                ? 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-50'
                : heatmapEnabled
                  ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }
            `}
            role="switch"
            aria-checked={heatmapEnabled}
            aria-label={`${heatmapEnabled ? 'Disable' : 'Enable'} heatmap overlay${isHeatmapAutoDisabled ? ' (zoom out to enable)' : ''}`}
            aria-disabled={isHeatmapAutoDisabled}
            title={isHeatmapAutoDisabled ? 'Zoom out to enable' : 'Heatmap'}
          >
            <MapIcon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>

          {/* Settings Button */}
          <button
            ref={settingsButtonRef}
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`
              p-2.5 rounded-lg transition-all duration-200 motion-reduce:transition-none
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
              ${showSettings ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}
            `}
            aria-expanded={showSettings}
            aria-controls="heatmap-settings"
            aria-label="Heatmap settings"
            title="Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>
        </div>
      </Card>

      {/* Settings Panel - Slide down */}
      {showSettings && (
        <div
          ref={settingsPanelRef}
          id="heatmap-settings"
          className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72 z-50"
          role="dialog"
          aria-label="Heatmap settings"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Heatmap Settings</h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Close settings"
            >
              <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Radius Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="heatmap-radius" className="text-xs font-medium text-gray-600">
                  Radius
                </label>
                <Badge variant="secondary" className="text-xs font-mono bg-gray-100">
                  {localRadius}px
                </Badge>
              </div>
              <input
                id="heatmap-radius"
                type="range"
                min="10"
                max="50"
                value={localRadius}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                aria-valuenow={localRadius}
                aria-valuemin={10}
                aria-valuemax={50}
              />
            </div>

            {/* Blur Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="heatmap-blur" className="text-xs font-medium text-gray-600">
                  Blur
                </label>
                <Badge variant="secondary" className="text-xs font-mono bg-gray-100">
                  {localBlur}px
                </Badge>
              </div>
              <input
                id="heatmap-blur"
                type="range"
                min="5"
                max="30"
                value={localBlur}
                onChange={(e) => handleBlurChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                aria-valuenow={localBlur}
                aria-valuemin={5}
                aria-valuemax={30}
              />
            </div>

            {/* Max Zoom Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="heatmap-maxzoom" className="text-xs font-medium text-gray-600">
                  Auto-disable at zoom
                </label>
                <Badge variant="secondary" className="text-xs font-mono bg-gray-100">
                  {localMaxZoom}+
                </Badge>
              </div>
              <input
                id="heatmap-maxzoom"
                type="range"
                min="8"
                max="15"
                value={localMaxZoom}
                onChange={(e) => handleMaxZoomChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                aria-valuenow={localMaxZoom}
                aria-valuemin={8}
                aria-valuemax={15}
              />
            </div>
          </div>

          {/* Current Zoom Indicator */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              <span className="font-medium">Current zoom:</span> Level {Math.round(currentZoom)}
              {isHeatmapAutoDisabled && (
                <span className="ml-2 text-amber-600 font-medium">(Heatmap disabled)</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
