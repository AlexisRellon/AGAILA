/**
 * Map Controls Component
 * 
 * Custom control panel for toggling map features:
 * - Marker clustering (GV-03)
 * - Heatmap overlay (GV-04)
 * - Heatmap settings
 * 
 * Module: GV-03, GV-04
 * Change: add-advanced-map-features
 */

import React, { useState } from 'react';
import { Layers, Map as MapIcon, Settings } from 'lucide-react';
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
  
  const isHeatmapAutoDisabled = currentZoom > heatmapMaxZoom;

  // Handle slider changes with immediate update
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
    <div className="absolute top-20 right-4 z-[1000] flex flex-col gap-2">
      <Card className="p-3 bg-white shadow-lg">
        <div className="flex flex-col gap-3">
          {/* Clustering Toggle */}
          <div className="flex items-center justify-between gap-3" data-tour="cluster-section">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span id="clustering-label" className="text-sm font-medium">Clustering</span>
            </div>
            <button
              type="button"
              data-tour="cluster-toggle"
              onClick={() => onToggleClustering(!clusteringEnabled)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full
                transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${clusteringEnabled ? 'bg-blue-600' : 'bg-gray-200'}
              `}
              role="switch"
              aria-checked={clusteringEnabled}
              aria-labelledby="clustering-label"
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${clusteringEnabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Heatmap Toggle */}
          <div className="flex items-center justify-between gap-3" data-tour="heatmap-section">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span id="heatmap-label" className="text-sm font-medium">Heatmap</span>
              {isHeatmapAutoDisabled && (
                <Badge variant="secondary" className="text-xs">
                  Zoom out
                </Badge>
              )}
            </div>
            <button
              type="button"
              data-tour="heatmap-toggle"
              onClick={() => onToggleHeatmap(!heatmapEnabled)}
              disabled={isHeatmapAutoDisabled}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full
                transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${heatmapEnabled && !isHeatmapAutoDisabled ? 'bg-blue-600' : 'bg-gray-200'}
                ${isHeatmapAutoDisabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              role="switch"
              aria-checked={heatmapEnabled && !isHeatmapAutoDisabled}
              aria-labelledby="heatmap-label"
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${heatmapEnabled && !isHeatmapAutoDisabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Heatmap Message */}
          {isHeatmapAutoDisabled && heatmapEnabled && (
            <div className="text-xs text-slate-500 pl-6 -mt-2">
              Auto-disabled at zoom level {currentZoom}. Zoom out to view heatmap.
            </div>
          )}

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors mt-1"
            data-tour="heatmap-settings"
            aria-expanded={showSettings}
            aria-controls="heatmap-settings-panel"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
            <span>{showSettings ? 'Hide Settings' : 'Settings'}</span>
          </button>
        </div>
      </Card>

      {/* Settings Panel */}
      {showSettings && (
        <Card id="heatmap-settings-panel" className="p-4 bg-white shadow-lg min-w-[240px]">
          <h3 className="text-sm font-semibold mb-3">Heatmap Settings</h3>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <label htmlFor="heatmap-radius" className="block text-slate-600 mb-1">
                Radius: <span className="font-semibold">{localRadius}px</span>
              </label>
              <input
                id="heatmap-radius"
                type="range"
                min="10"
                max="50"
                value={localRadius}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                className="w-full accent-blue-600"
                aria-valuenow={localRadius}
                aria-valuemin={10}
                aria-valuemax={50}
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1" aria-hidden="true">
                <span>10px</span>
                <span>50px</span>
              </div>
            </div>
            <div>
              <label htmlFor="heatmap-blur" className="block text-slate-600 mb-1">
                Blur: <span className="font-semibold">{localBlur}px</span>
              </label>
              <input
                id="heatmap-blur"
                type="range"
                min="5"
                max="30"
                value={localBlur}
                onChange={(e) => handleBlurChange(Number(e.target.value))}
                className="w-full accent-blue-600"
                aria-valuenow={localBlur}
                aria-valuemin={5}
                aria-valuemax={30}
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1" aria-hidden="true">
                <span>5px</span>
                <span>30px</span>
              </div>
            </div>
            <div>
              <label htmlFor="heatmap-maxzoom" className="block text-slate-600 mb-1">
                Max Zoom Level: <span className="font-semibold">{localMaxZoom}</span>
              </label>
              <input
                id="heatmap-maxzoom"
                type="range"
                min="8"
                max="15"
                value={localMaxZoom}
                onChange={(e) => handleMaxZoomChange(Number(e.target.value))}
                className="w-full accent-blue-600"
                aria-valuenow={localMaxZoom}
                aria-valuemin={8}
                aria-valuemax={15}
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1" aria-hidden="true">
                <span>8</span>
                <span>15</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-500 mb-2">
                Changes apply immediately. Settings persist in browser storage.
              </p>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Close Settings
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
