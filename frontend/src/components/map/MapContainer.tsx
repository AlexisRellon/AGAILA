/**
 * Map Container Component
 * 
 * Wrapper component for Leaflet map with custom styling.
 * Applies navy-based minimalist theme to base tiles.
 * 
 * Features:
 * - Custom Mapbox-inspired tile styling
 * - Navy/subtle color palette (brand-aligned)
 * - Reduced visual clutter (minimal labels, icons)
 * - High contrast elements for accessibility
 * - Responsive scaling
 * 
 * Module: GV-01 (Base Map)
 * Design: Minimalist + Navy theme (Eleken guidelines)
 */

import React from 'react';
import { TileLayer, GeoJSON } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';

interface MapContainerProps {
  /**
   * Boundary GeoJSON data (optional)
   */
  boundaryGeoJSON?: FeatureCollection;
}

export function MapContainer({ boundaryGeoJSON }: MapContainerProps) {
  // Custom Mapbox-inspired styling with navy theme
  // Using OpenStreetMap tiles with custom CSS filters
  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  
  const TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <>
      {/* Base Map Layer - Custom styled tiles */}
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        maxZoom={19}
        // Custom CSS filter for navy/desaturated appearance
        // Applied via L.TileLayer className
        className="map-tiles--minimal"
        // Improve performance with subdomains
        subdomains={['a', 'b', 'c']}
      />

      {/* Boundary Layer (optional) - Shows Philippine administrative divisions */}
      {boundaryGeoJSON && (
        <GeoJSON
          key={JSON.stringify(boundaryGeoJSON)}
          data={boundaryGeoJSON}
          style={{
            color: '#0A2A4D',
            weight: 1,
            opacity: 0.3,
            fillOpacity: 0,
          }}
        />
      )}

      {/* Global CSS for map tile styling */}
      <style>{`
        /* Desaturate and adjust colors for minimalist navy theme */
        .map-tiles--minimal {
          filter: saturate(0.8) contrast(1.1) brightness(1.05) hue-rotate(-5deg);
        }

        /* Optional: Add custom Mapbox-inspired styling via SnazzyMaps URL if using Google Maps */
        /* For current implementation with OSM, filters provide sufficient theming */
      `}</style>
    </>
  );
}
