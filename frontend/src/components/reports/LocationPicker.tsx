/**
 * Location Picker Component (CR-05)
 * Interactive Leaflet map for selecting exact hazard location
 * 
 * Features:
 * - Leaflet map centered on Philippines
 * - Click to place marker
 * - Drag marker to adjust location
 * - "Use My Current Location" button with geolocation API
 * - Coordinate validation (Philippine bounds: 4-21°N, 116-127°E)
 * - Coordinate display below map
 * - Mobile-friendly interaction
 * - Permission handling for geolocation
 */

import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, AlertCircle, Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// ============================================================================
// TYPES
// ============================================================================

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect: (lat: number, lng: number) => void;
  /** If true, attempts to get user's GPS location when the component mounts */
  autoLocateOnMount?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Philippine bounds
const PHILIPPINES_BOUNDS = {
  minLat: 4,
  maxLat: 21,
  minLng: 116,
  maxLng: 127,
};

// Default center (Philippines center)
const DEFAULT_CENTER: [number, number] = [12.8797, 121.774];
const DEFAULT_ZOOM = 6;

// ============================================================================
// MARKER ICON (Fix Leaflet default icon issue)
// ============================================================================

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate coordinates are within Philippine bounds
 */
function isWithinPhilippineBounds(lat: number, lng: number): boolean {
  return (
    lat >= PHILIPPINES_BOUNDS.minLat &&
    lat <= PHILIPPINES_BOUNDS.maxLat &&
    lng >= PHILIPPINES_BOUNDS.minLng &&
    lng <= PHILIPPINES_BOUNDS.maxLng
  );
}

// ============================================================================
// MAP CLICK HANDLER COMPONENT
// ============================================================================

interface MapClickHandlerProps {
  onLocationClick: (lat: number, lng: number) => void;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onLocationClick }) => {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (isWithinPhilippineBounds(lat, lng)) {
        onLocationClick(lat, lng);
      }
    },
  });
  return null;
};

// ============================================================================
// MAP VIEWPORT SYNC COMPONENT
// ============================================================================

interface MapViewportSyncProps {
  markerPosition: [number, number] | null;
}

const MapViewportSync: React.FC<MapViewportSyncProps> = ({ markerPosition }) => {
  const map = useMap();

  useEffect(() => {
    const center = markerPosition ?? DEFAULT_CENTER;
    const zoom = markerPosition ? 13 : DEFAULT_ZOOM;
    map.setView(center, zoom);
  }, [map, markerPosition]);

  return null;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LocationPicker: React.FC<LocationPickerProps> = ({
  initialLat,
  initialLng,
  onLocationSelect,
  autoLocateOnMount = false,
}) => {
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(
    initialLat && initialLng ? [initialLat, initialLng] : null
  );
  const [error, setError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [hasAutoLocated, setHasAutoLocated] = useState(false);

  // Sync marker position with initial props
  useEffect(() => {
    if (initialLat && initialLng) {
      setMarkerPosition([initialLat, initialLng]);
    }
  }, [initialLat, initialLng]);

  // Auto-request GPS on mount when enabled (e.g., when no initial coords)
  useEffect(() => {
    if (!autoLocateOnMount || hasAutoLocated || markerPosition) return;
    if (!navigator.geolocation) return;

    setHasAutoLocated(true);
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (isWithinPhilippineBounds(latitude, longitude)) {
          setMarkerPosition([latitude, longitude]);
          onLocationSelect(latitude, longitude);
        }
        setIsGettingLocation(false);
      },
      () => setIsGettingLocation(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [autoLocateOnMount, hasAutoLocated, markerPosition, onLocationSelect]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setError(null);
    setMarkerPosition([lat, lng]);
    onLocationSelect(lat, lng);
  }, [onLocationSelect]);

  const handleMarkerDrag = useCallback((marker: L.Marker) => {
    const position = marker.getLatLng();
    const { lat, lng } = position;

    if (isWithinPhilippineBounds(lat, lng)) {
      setError(null);
      setMarkerPosition([lat, lng]);
      onLocationSelect(lat, lng);
    } else {
      setError('Location must be within the Philippines');
      // Snap back to Philippines center if dragged outside
      marker.setLatLng(DEFAULT_CENTER);
      setMarkerPosition(DEFAULT_CENTER);
      onLocationSelect(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
    }
  }, [onLocationSelect]);

  const handleUseCurrentLocation = useCallback(() => {
    setError(null);
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (isWithinPhilippineBounds(latitude, longitude)) {
          setMarkerPosition([latitude, longitude]);
          onLocationSelect(latitude, longitude);
        } else {
          setError('Your current location is outside the Philippines. Please select a location manually.');
        }
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError('Location permission denied. Please enable location access in your browser settings.');
            break;
          case error.POSITION_UNAVAILABLE:
            setError('Location information is unavailable. Please try again or select manually.');
            break;
          case error.TIMEOUT:
            setError('Location request timed out. Please try again or select manually.');
            break;
          default:
            setError('Failed to get your location. Please select manually on the map.');
        }
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [onLocationSelect]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-3">
      {/* Use Current Location Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isGettingLocation}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGettingLocation ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Getting location...
            </>
          ) : (
            <>
              <Navigation size={16} />
              Use My Current Location
            </>
          )}
        </button>

        {markerPosition && (
          <p className="text-sm text-gray-600">
            <span className="font-medium">Coordinates:</span>{' '}
            {markerPosition[0].toFixed(6)}, {markerPosition[1].toFixed(6)}
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Map Container */}
      <div className="border rounded-lg overflow-hidden h-[280px] sm:h-[350px] md:h-[400px]">
        <MapContainer
          center={markerPosition || DEFAULT_CENTER}
          zoom={markerPosition ? 13 : DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Map Click Handler */}
          <MapClickHandler onLocationClick={handleMapClick} />

          {/* Sync viewport when marker changes */}
          <MapViewportSync markerPosition={markerPosition} />

          {/* Draggable Marker */}
          {markerPosition && (
            <Marker
              position={markerPosition}
              icon={markerIcon}
              draggable={true}
              eventHandlers={{
                dragend: (e) => {
                  handleMarkerDrag(e.target);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>💡 <strong>Click</strong> anywhere on the map to place a marker</p>
        <p>🖱️ <strong>Drag</strong> the marker to adjust the exact location</p>
        <p>🌍 Location must be within the Philippines</p>
      </div>
    </div>
  );
};

export default LocationPicker;
