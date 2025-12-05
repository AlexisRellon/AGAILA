import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, LayersControl, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { fetchValidatedHazards, HazardResponse } from '../services/hazardsApi';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from '../components/ui/alert';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { createCustomClusterIcon } from '../components/map/clusterIcon';
import { HeatmapLayer, useHeatmapSettings } from '../components/map/HeatmapLayer';
import { MapControls } from '../components/map/MapControls';
import { MapOnboarding } from '../components/map/MapOnboarding';
import { FilterPanel } from '../components/filters/FilterPanel';
import { BoundaryLayer } from '../components/map/BoundaryLayer';
import { ReportGenerator } from '../components/reports/ReportGenerator';
import { useHazardFilters } from '../hooks/useHazardFilters';
import { 
  Droplets, 
  Wind, 
  Mountain, 
  Activity, 
  Flame, 
  Waves, 
  CloudRain, 
  Sun, 
  Thermometer, 
  AlertTriangle,
  type LucideIcon
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Hazard {
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
}

/**
 * Map API response to local Hazard interface
 */
function mapResponseToHazard(response: HazardResponse): Hazard {
  return {
    id: response.id,
    hazard_type: response.hazard_type,
    severity: response.severity || 'unknown',
    location_name: response.location_name,
    latitude: response.latitude,
    longitude: response.longitude,
    confidence_score: response.confidence_score,
    source_type: response.source_type,
    validated: response.validated,
    created_at: response.created_at,
    source_content: response.source_content || undefined,
  };
}

interface NominatimResult {
  place_id: number | string;  // GeoSearch can return string or number
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    province?: string;
    region?: string;
    country?: string;
  };
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500',
  severe: 'bg-orange-500',
  moderate: 'bg-yellow-500',
  minor: 'bg-green-500',
};

/**
 * PublicMap Component
 * 
 * Public-facing live hazard map accessible without authentication.
 * Displays validated hazards from the GAIA system for general public viewing.
 * 
 * Features:
 * - Real-time hazard visualization on interactive map
 * - Left sidebar with layer controls (NOAH-inspired interface)
 * - Automatic refresh every 30 seconds
 * - Color-coded severity markers
 * - Hazard details popup on marker click
 * - Philippine-focused viewport (default center: Manila)
 * 
 * Data Source: gaia.hazards table (RLS: public can view validated hazards)
 * 
 * Use Case: General public can view live hazard map without login
 * 
 * Related Modules: GV-01 (Base Map), GV-02 (Dynamic Markers)
 */
const PublicMap: React.FC = () => {
  const { user } = useAuth(); // Get authenticated user
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(true);
  
  // Map container ref for PDF screenshot capture
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Search location state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isFollowingSearch, setIsFollowingSearch] = useState(false);
  const [boundaryBounds, setBoundaryBounds] = useState<L.LatLngBoundsExpression | null>(null);
  const [boundaryLevel, setBoundaryLevel] = useState<string | null>(null);
  
  // Map enhancements state (GV-03, GV-04)
  const [clusteringEnabled, setClusteringEnabled] = useState(true);
  const { settings: heatmapSettings, updateSettings: updateHeatmapSettings } = useHeatmapSettings();
  const [currentZoom, setCurrentZoom] = useState(6);
  
  // Filter hook (FP-01, FP-02, FP-03, FP-04) - replaces old layer visibility filters
  const { applyFilters } = useHazardFilters();

  // Fetch validated hazards from backend proxy API (PATCH-1.4: Secure API migration)
  // Replaces direct Supabase access to remove exposed credentials
  const fetchHazards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchValidatedHazards({
        limit: 1000, // Max limit to fetch all validated hazards
        // No timeWindowHours - fetch all validated hazards, filtering happens client-side
      });

      // Map API response to local Hazard interface
      const hazards = data.map(mapResponseToHazard);
      setHazards(hazards);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Error fetching hazards:', errorMessage);
      setError('Failed to load hazard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHazards();

    // Refresh hazards every 30 seconds for real-time updates
    const interval = setInterval(fetchHazards, 30000);

    return () => clearInterval(interval);
  }, [fetchHazards]);

  // Default map center: Manila, Philippines
  const philippinesCenter: [number, number] = [14.5995, 120.9842];
  const defaultZoom = 6;
  
  // Philippines geographic bounds to restrict map panning
  // Format: [[south, west], [north, east]]
  const philippinesBounds: L.LatLngBoundsExpression = [
    [4.0, 116.0],  // Southwest corner
    [21.0, 127.0]  // Northeast corner
  ];

  // Apply filters using hook (includes hazard type, time, source, and severity)
  const filteredHazards = applyFilters(hazards);

  // Search location using Nominatim geocoding API
  // Initialize geocoding provider (Leaflet-Geosearch)
  const searchProviderRef = useRef<OpenStreetMapProvider | null>(null);
  
  useEffect(() => {
    // Initialize provider once
    if (!searchProviderRef.current) {
      searchProviderRef.current = new OpenStreetMapProvider({
        params: {
          countrycodes: 'ph', // Philippines only
          addressdetails: 1,
          'accept-language': 'en',
          limit: 5
        }
      });
    }
  }, []);

  // Search location using Leaflet-Geosearch
  const searchLocation = async (query: string) => {
    if (!query || query.length < 3) {
      setSearchSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const provider = searchProviderRef.current;
      if (!provider) throw new Error('Geosearch provider not initialized');
      
      const results = await provider.search({ query });
      
      // Transform GeoSearch results to match our NominatimResult interface
      const suggestions = results.map((result: { raw: { place_id: string | number; address?: Record<string, unknown> }; y: number; x: number; label: string }) => ({
        place_id: result.raw.place_id.toString(),
        lat: result.y.toString(),
        lon: result.x.toString(),
        display_name: result.label,
        address: result.raw.address || {}
      }));
      
      setSearchSuggestions(suggestions);
      setShowSuggestions(true);
    } catch (err) {
      console.error('GeoSearch error:', err);
      setSearchSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 500);
  };

  // Handle suggestion selection - coordinates will be used by SearchController
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lon: number } | null>(null);
  
  // Searched location name for boundary highlighting (GV-01 optimization)
  const [searchedLocationName, setSearchedLocationName] = useState<string | null>(null);
  
  const handleSelectSuggestion = (suggestion: NominatimResult) => {
    setSearchQuery(suggestion.display_name);
    setShowSuggestions(false);
    setSelectedLocation({ lat: parseFloat(suggestion.lat), lon: parseFloat(suggestion.lon) });
    setIsFollowingSearch(true); // Enable following when new location selected
    
    // Extract city/municipality name from display_name (first part before comma)
    const locationName = suggestion.display_name.split(',')[0].trim();
    setSearchedLocationName(locationName);
    console.log('[PublicMap] Searched location:', locationName);
  };

  // SearchController component to control map from selected location
  const SearchController: React.FC<{ 
    location: { lat: number; lon: number } | null;
    bounds: L.LatLngBoundsExpression | null;
    boundaryLevel: string | null;
    isFollowing: boolean;
    onStopFollowing: () => void;
  }> = ({ location, bounds, boundaryLevel, isFollowing, onStopFollowing }) => {
    const map = useMap();
    const previousLocationRef = useRef<{ lat: number; lon: number } | null>(null);
    const hasFlownRef = useRef(false);

    useEffect(() => {
      // Only fly to location if following is enabled
      if (isFollowing && location && 
          (!previousLocationRef.current || 
           previousLocationRef.current.lat !== location.lat || 
           previousLocationRef.current.lon !== location.lon ||
           !hasFlownRef.current)) {
        
        // If we have boundary bounds, use fitBounds for better UX
        if (bounds) {
          // Adaptive padding based on boundary level
          const paddingOptions: { [key: string]: [number, number] } = {
            municipality: [50, 50],
            province: [30, 30],
            region: [20, 20],
            default: [40, 40]
          };
          
          const padding = paddingOptions[boundaryLevel as keyof typeof paddingOptions] || paddingOptions.default;
          
          map.fitBounds(bounds, {
            padding,
            animate: true,
            duration: 1.5
          });
        } else {
          // Fallback to flyTo with fixed zoom if no bounds available
          map.flyTo([location.lat, location.lon], 15, {
            duration: 1.5
          });
        }
        
        // Update the ref to track this location
        previousLocationRef.current = location;
        hasFlownRef.current = true;
      }
    }, [location, bounds, boundaryLevel, map, isFollowing]);

    // Detect user interaction (drag, zoom) to auto-disable following
    useEffect(() => {
      if (!isFollowing) return;

      const handleUserInteraction = () => {
        // Only disable following if user manually moved the map
        // (not during the initial flyTo animation)
        if (hasFlownRef.current) {
          onStopFollowing();
        }
      };

      // Listen for map drag and zoom events
      map.on('dragstart', handleUserInteraction);
      map.on('zoomstart', handleUserInteraction);

      return () => {
        map.off('dragstart', handleUserInteraction);
        map.off('zoomstart', handleUserInteraction);
      };
    }, [map, isFollowing, onStopFollowing]);

    // Reset hasFlownRef when location changes
    useEffect(() => {
      if (location && previousLocationRef.current && 
          (previousLocationRef.current.lat !== location.lat || 
           previousLocationRef.current.lon !== location.lon)) {
        hasFlownRef.current = false;
      }
    }, [location]);

    return null;
  };

  // ZoomTracker component - tracks current zoom level for heatmap auto-disable (GV-04)
  const ZoomTracker: React.FC<{ onZoomChange: (zoom: number) => void }> = ({ onZoomChange }) => {
    const map = useMap();

    useEffect(() => {
      const updateZoom = () => {
        onZoomChange(map.getZoom());
      };

      // Set initial zoom
      updateZoom();

      // Listen for zoom changes
      map.on('zoomend', updateZoom);

      return () => {
        map.off('zoomend', updateZoom);
      };
    }, [map, onZoomChange]);

    return null;
  };

  // Hazard type labels
  const hazardLabels: Record<string, string> = {
    flood: 'Flood Hazard',
    typhoon: 'Typhoon',
    landslide: 'Landslide Hazard',
    earthquake: 'Earthquake',
    volcanic_eruption: 'Volcanoes',
    storm_surge: 'Storm Surge Hazard',
    tsunami: 'Tsunami',
    fire: 'Fire Incident',
    drought: 'Drought',
    heat_wave: 'Heat Wave',
    heavy_rain: 'Heavy Rain',
    other: 'Other Hazards',
  };

  // Hazard icons and colors mapping
  const hazardIcons: Record<string, { icon: LucideIcon; color: string }> = {
    flood: { icon: Droplets, color: '#3b82f6' },
    typhoon: { icon: Wind, color: '#6366f1' },
    landslide: { icon: Mountain, color: '#a855f7' },
    earthquake: { icon: Activity, color: '#ef4444' },
    volcanic_eruption: { icon: Flame, color: '#dc2626' },
    storm_surge: { icon: Waves, color: '#0891b2' },
    tsunami: { icon: Waves, color: '#06b6d4' },
    fire: { icon: Flame, color: '#f97316' },
    drought: { icon: Sun, color: '#eab308' },
    heat_wave: { icon: Thermometer, color: '#f59e0b' },
    heavy_rain: { icon: CloudRain, color: '#0ea5e9' },
    other: { icon: AlertTriangle, color: '#64748b' },
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Main Content with Sidebar and Map */}
      <div className="flex-1 relative">
        {/* Left Sidebar - Layer Controls (Overlay) */}
        {/* Full width on mobile, fixed width on desktop */}
        <div
          className={`${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${
            isSidebarExpanded ? 'md:w-[420px]' : 'md:w-80'
          } w-full md:max-w-none absolute left-0 top-0 h-full transition-all duration-300 bg-white shadow-2xl z-[1000] overflow-hidden`}
        >
          <div className="h-full overflow-y-auto">
            {/* GAIA Logo and Navigation */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                  <img
                    src="/assets/img/GAIA.svg"
                    alt="GAIA Logo"
                    className="h-10 w-10"
                  />
                  <div>
                    <h2 className="text-lg font-bold text-[#0a2a4d]">GAIA</h2>
                    <p className="text-xs text-gray-600">Live Hazard Map</p>
                  </div>
                </Link>
                {/* Close button - visible on mobile */}
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close sidebar"
                >
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search Location */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search Location (Philippines)"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => searchQuery && setShowSuggestions(true)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0a2a4d] focus:border-transparent"
                />
                <button 
                  type="button"
                  aria-label={isSearching ? 'Searching...' : 'Search location'}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#0a2a4d]"
                  onClick={() => searchQuery && searchLocation(searchQuery)}
                >
                  {isSearching ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0a2a4d]" aria-hidden="true"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </button>
                
                {/* Search Suggestions Dropdown */}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                    {searchSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {suggestion.display_name.split(',')[0]}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {suggestion.display_name}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Stop Following Button - shown when following active */}
              {isFollowingSearch && selectedLocation && (
                <button
                  type="button"
                  onClick={() => setIsFollowingSearch(false)}
                  className="mt-2 w-full px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-800 rounded-md hover:bg-amber-100 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Stop Following Location
                </button>
              )}
            </div>

            {/* FilterPanel Component (FP-01, FP-02, FP-03, FP-04) */}
            <div className="p-4">
              <FilterPanel 
                hazards={hazards}
                className="h-full"
                onExpandChange={setIsSidebarExpanded}
              />
            </div>

            {/* Active Hazards Count */}
            <div className="p-4 border-t border-gray-200">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-gray-700">
                  <strong className="text-[#0a2a4d]">{filteredHazards.length}</strong> active hazard
                  {filteredHazards.length !== 1 ? 's' : ''} visible
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {hazards.length - filteredHazards.length} hidden by filters
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Toggle Button */}
        {/* Hidden on mobile when sidebar is open (use X button inside instead) */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`${
            isSidebarOpen 
              ? `hidden md:block ${isSidebarExpanded ? 'md:left-[420px]' : 'md:left-80'}` 
              : 'block left-0'
          } absolute top-[6rem] z-[1001] bg-white shadow-md rounded-r-md p-2 hover:bg-gray-50 transition-all duration-300`}
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <svg
            className={`w-5 h-5 text-gray-700 transform transition-transform ${
              isSidebarOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Map Container - Full Screen */}
        <div ref={mapContainerRef} className="absolute inset-0" id="public-map-container">
          {/* Floating UI Controls Container - Top Right */}
          {/* Hidden on mobile when sidebar is open for better UX */}
          <div 
            className={`absolute top-56 right-4 z-[1000] space-y-4 transition-opacity duration-300 ${
              isSidebarOpen ? 'hidden md:block' : 'block'
            }`} 
            data-map-control="true"
          >
            {/* Report Generator Button (RG-02) - Only for authenticated users */}
            {user && (
              <ReportGenerator 
                hazards={filteredHazards}
                mapContainerRef={mapContainerRef}
                onReportGenerated={() => {
                  // PDF report generated successfully
                }}
              />
            )}

            {/* Legend Card */}
            <Card className="bg-white/95 backdrop-blur-sm shadow-lg max-w-xs map-legend">
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Legend</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {filteredHazards.length} active
                    </Badge>
                    <button
                      onClick={() => setIsLegendVisible(!isLegendVisible)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      aria-label={isLegendVisible ? 'Hide legend' : 'Show legend'}
                    >
                      <svg
                        className={`w-4 h-4 text-gray-500 transition-transform ${isLegendVisible ? '' : 'rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                {isLegendVisible && (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto mt-3">
                    {Object.entries(hazardIcons).map(([key, { icon: Icon, color }]) => {
                      const count = filteredHazards.filter(h => h.hazard_type === key).length;
                      const hasCount = count > 0;
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between p-1.5 rounded ${
                            hasCount ? 'hover:bg-gray-50' : 'opacity-50'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <div 
                              className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0"
                              style={{ backgroundColor: `${color}20`, color: hasCount ? color : '#9ca3af' }}
                            >
                              <Icon size={16} strokeWidth={2.5} />
                            </div>
                            <span className={`text-xs ${hasCount ? 'text-gray-700' : 'text-gray-400'}`}>
                              {hazardLabels[key]}
                            </span>
                          </div>
                          <Badge 
                            variant={hasCount ? "secondary" : "outline"} 
                            className="text-xs h-5"
                          >
                            {count}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1100] max-w-md w-full px-4">
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-5 w-5 mt-0.5 text-red-600" />
                  <span className="text-red-800">{error}</span>
                </div>
              </Alert>
            </div>
          )}

          {loading && hazards.length === 0 && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-gray-50 z-[999]"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Card className="p-8">
                <div className="flex flex-col items-center space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a2a4d]" aria-hidden="true"></div>
                  <p className="text-gray-600">Loading hazard data...</p>
                </div>
              </Card>
            </div>
          )}
          
          <MapContainer
            center={philippinesCenter}
            zoom={defaultZoom}
            zoomControl={false}
            minZoom={5}
            maxBounds={philippinesBounds}
            maxBoundsViscosity={1.0}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* Map Controls */}
            <ZoomControl position="topright" />
            <ScaleControl position="bottomleft" />
            
            {/* Search Controller - flies map to selected location */}
            <SearchController 
              location={selectedLocation}
              bounds={boundaryBounds}
              boundaryLevel={boundaryLevel}
              isFollowing={isFollowingSearch}
              onStopFollowing={() => setIsFollowingSearch(false)}
            />
            
            {/* Zoom Tracker - updates current zoom for heatmap auto-disable */}
            <ZoomTracker onZoomChange={setCurrentZoom} />
            
            {/* Heatmap Layer (GV-04) - Auto-disables at zoom > 12 */}
            <HeatmapLayer
              hazards={filteredHazards}
              enabled={heatmapSettings.enabled}
              radius={heatmapSettings.radius}
              blur={heatmapSettings.blur}
              maxZoom={heatmapSettings.maxZoom}
              gradient={heatmapSettings.gradient}
            />
            
            {/* Boundary Layer (GV-01) - Location-Based Highlighting */}
            {/* Shows highlighted boundary when user searches for a location */}
            <BoundaryLayer
              enabled={searchedLocationName !== null}
              locationName={searchedLocationName}
              highlightColor="#3b82f6" // Tailwind blue-500
              onBoundsCalculated={(bounds, level) => {
                setBoundaryBounds(bounds);
                setBoundaryLevel(level);
              }}
            />
            
            {/* Layers Control - Base Map Switcher */}
            <LayersControl position="topleft">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
              
              <LayersControl.BaseLayer name="Topographic">
                <TileLayer
                  attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            {/* Hazard Markers with Clustering (GV-03) */}
            {clusteringEnabled ? (
              <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={50}
                disableClusteringAtZoom={10}
                spiderfyOnMaxZoom={true}
                showCoverageOnHover={true}
                iconCreateFunction={createCustomClusterIcon}
              >
                {filteredHazards.map((hazard) => (
                  <Marker
                    key={hazard.id}
                    position={[hazard.latitude, hazard.longitude]}
                    // @ts-expect-error - Custom option for cluster coloring (react-leaflet-cluster extension)
                    options={{ hazardType: hazard.hazard_type }}
                  >
                    <Popup maxWidth={300}>
                  <div className="p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg capitalize">
                        {hazard.hazard_type.replace(/_/g, ' ')}
                      </h3>
                      <Badge
                        className={`${severityColors[hazard.severity] || 'bg-gray-500'} text-white`}
                      >
                        {hazard.severity}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm">
                      <p>
                        <strong>Location:</strong> {hazard.location_name}
                      </p>
                      <p>
                        <strong>Source:</strong> {hazard.source_type.replace(/_/g, ' ')}
                      </p>
                      <p>
                        <strong>Confidence:</strong> {(hazard.confidence_score * 100).toFixed(0)}%
                      </p>
                      <p className="text-gray-600">
                        <strong>Detected:</strong>{' '}
                        {new Date(hazard.created_at).toLocaleString('en-PH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>

                    {hazard.source_content && (
                      <p className="text-sm text-gray-700 pt-2 border-t">
                        {hazard.source_content}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
              </MarkerClusterGroup>
            ) : (
              // Individual markers when clustering disabled
              filteredHazards.map((hazard) => (
                <Marker
                  key={hazard.id}
                  position={[hazard.latitude, hazard.longitude]}
                >
                  <Popup maxWidth={300}>
                    <div className="p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg capitalize">
                          {hazard.hazard_type.replace(/_/g, ' ')}
                        </h3>
                        <Badge
                          className={`${severityColors[hazard.severity] || 'bg-gray-500'} text-white`}
                        >
                          {hazard.severity}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-sm">
                        <p>
                          <strong>Location:</strong> {hazard.location_name}
                        </p>
                        <p>
                          <strong>Source:</strong> {hazard.source_type.replace(/_/g, ' ')}
                        </p>
                        <p>
                          <strong>Confidence:</strong> {(hazard.confidence_score * 100).toFixed(0)}%
                        </p>
                        <p className="text-gray-600">
                          <strong>Detected:</strong>{' '}
                          {new Date(hazard.created_at).toLocaleString('en-PH', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>

                      {hazard.source_content && (
                        <p className="text-sm text-gray-700 pt-2 border-t">
                          {hazard.source_content}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))
            )}
          </MapContainer>
          
          {/* Map Controls (GV-03, GV-04) */}
          {/* Hidden on mobile when sidebar is open */}
          <div 
            className={`${isSidebarOpen ? 'hidden md:block' : 'block'}`}
            data-map-control="true"
          >
            <MapControls
              clusteringEnabled={clusteringEnabled}
              onToggleClustering={setClusteringEnabled}
              heatmapEnabled={heatmapSettings.enabled}
              onToggleHeatmap={(enabled) => updateHeatmapSettings({ enabled })}
              currentZoom={currentZoom}
              heatmapMaxZoom={heatmapSettings.maxZoom}
              heatmapRadius={heatmapSettings.radius}
              heatmapBlur={heatmapSettings.blur}
              onHeatmapSettingsChange={updateHeatmapSettings}
            />
          </div>
        </div>
      </div>

      {/* Stats Footer */}
      <footer className="bg-white border-t border-gray-200 py-2 md:py-3 z-[9999]" data-realtime-footer="true">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              <strong>{hazards.length}</strong> active hazard{hazards.length !== 1 ? 's' : ''} displayed
            </div>
            <div>
              Last updated: {new Date().toLocaleTimeString('en-PH')} • Auto-refresh: 30s
            </div>
            <div>
              <a href="/report" className="text-[#005a9c] hover:underline">
                Report a Hazard
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Onboarding Tutorial */}
      <MapOnboarding
        autoStart
        steps={[
          {
            id: 'map',
            selector: '#public-map-container',
            title: 'Interactive Live Map',
            description: 'Pan and zoom to explore active hazards. The map updates continuously as new reports are validated.',
            placement: 'bottom',
            padding: 8,
          },
          {
            id: 'zoom',
            selector: '.leaflet-control-zoom',
            title: 'Zoom Controls',
            description: 'Use + and − to zoom. You can also use your mouse wheel or pinch gestures.',
            placement: 'right',
          },
          {
            id: 'layers',
            selector: '.leaflet-control-layers',
            title: 'Base Map Layers',
            description: 'Switch between OpenStreetMap, Satellite, and Topographic views to suit your analysis.',
            placement: 'right',
          },
          {
            id: 'cluster',
            selector: '[data-tour="cluster-toggle"]',
            title: 'Marker Clustering',
            description: 'Group nearby hazards for clarity. Toggle off to see individual markers at all zoom levels.',
            placement: 'left',
          },
          {
            id: 'heatmap',
            selector: '[data-tour="heatmap-toggle"]',
            title: 'Heatmap Overlay',
            description: 'Visualize hazard density. The heatmap auto-disables when you zoom in for detailed inspection.',
            placement: 'left',
          },
          {
            id: 'realtime',
            selector: '[data-realtime-footer="true"]',
            title: 'Real-Time Updates',
            description: 'The map refreshes every 30s. See the latest update time here and total active hazards shown.',
            placement: 'top',
          },
        ]}
      />
    </div>
  );
};

export default PublicMap;
