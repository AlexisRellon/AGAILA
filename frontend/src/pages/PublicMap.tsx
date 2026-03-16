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
import { MapOnboarding } from '../components/map/MapOnboarding';
import { FilterPanel } from '../components/filters/FilterPanel';
import { BoundaryLayer } from '../components/map/BoundaryLayer';
import { ReportGenerator } from '../components/reports/ReportGenerator';
import { useHazardFilters } from '../hooks/useHazardFilters';
import { 
  Menu,
  X,
  Search,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  MapPin,
  ExternalLink,
  RefreshCw,
  Layers,
  Map as MapIcon,
  Settings,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { 
  HAZARD_ICON_REGISTRY, 
  HazardIcon,
} from '../constants/hazard-icons';
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
 * - WCAG A/AA/AAA accessibility compliance
 * - Responsive design for mobile, tablet, and desktop
 * 
 * Data Source: gaia.hazards table (RLS: public can view validated hazards)
 * 
 * Use Case: General public can view live hazard map without login
 * 
 * Related Modules: GV-01 (Base Map), GV-02 (Dynamic Markers)
 * 
 * Accessibility Features:
 * - Skip navigation link for keyboard users
 * - ARIA landmarks and labels
 * - Focus management for modals/drawers
 * - High contrast mode support
 * - Screen reader announcements for dynamic content
 * - Keyboard navigation for all interactive elements
 * - Reduced motion support
 */
const PublicMap: React.FC = () => {
  const { user } = useAuth(); // Get authenticated user
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false);
  
  // Accessibility: Live region announcements
  const [announcement, setAnnouncement] = useState<string>('');
  
  // Sidebar focus trap ref
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  
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
      setLastUpdated(new Date());
      
      // Accessibility: Announce update to screen readers
      setAnnouncement(`Hazard data refreshed. ${hazards.length} active hazards loaded.`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Error fetching hazards:', errorMessage);
      setError('Failed to load hazard data. Please try again later.');
      setAnnouncement('Error: Failed to load hazard data.');
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

  // Close mobile controls panel whenever the sidebar opens so they don't overlap
  useEffect(() => {
    if (isSidebarOpen) {
      setIsMobileControlsOpen(false);
    }
  }, [isSidebarOpen]);

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
    // eslint-disable-next-line
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

  // Hazard icons and colors are now accessed from HAZARD_ICON_REGISTRY
  // Use getHazardIcon(hazardType) for individual icon config

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Skip Navigation Link - WCAG 2.4.1 (Level A) */}
      <a
        href="#public-map-container"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:bg-[#0a2a4d] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>
      
      {/* Live Region for Screen Reader Announcements - WCAG 4.1.3 (Level A) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Main Content with Sidebar and Map */}
      <div className="flex-1 relative" role="main">
        {/* Left Sidebar - Layer Controls (Overlay) */}
        {/* Full width on mobile, fixed width on desktop */}
        <aside
          ref={sidebarRef}
          id="sidebar-filters"
          aria-label="Hazard filters and controls"
          aria-hidden={!isSidebarOpen}
          className={`${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${
            isSidebarExpanded ? 'md:w-[420px]' : 'md:w-80'
          } w-full md:max-w-none fixed md:absolute left-0 top-0 h-full transition-all duration-300 ease-in-out motion-reduce:transition-none bg-white shadow-2xl z-[1000] overflow-hidden flex flex-col`}
        >
          {/* Sidebar Header - Fixed */}
          <header className="p-4 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center justify-between gap-4">
              <Link 
                to="/" 
                className="flex items-center space-x-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#0a2a4d] focus:ring-offset-2 rounded-lg p-1 -m-1"
                aria-label="Go to GAIA homepage"
              >
                <img
                  src="/assets/img/GAIA.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-10 w-10 sm:h-12 sm:w-12"
                />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-[#0a2a4d]">GAIA</h1>
                  <p className="text-xs sm:text-sm text-gray-600">Live Hazard Map</p>
                </div>
              </Link>
              {/* Close button - visible on all screens when sidebar is open */}
              <button
                onClick={() => {
                  setIsSidebarOpen(false);
                  sidebarToggleRef.current?.focus();
                }}
                className="p-2 sm:p-2.5 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a2a4d] focus:ring-offset-1"
                aria-label="Close sidebar"
                aria-expanded={isSidebarOpen}
                aria-controls="sidebar-filters"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {/* Search Location */}
            <div className="p-4 border-b border-gray-200">
              <label htmlFor="location-search" className="sr-only">Search for a location in the Philippines</label>
              <div className="relative" role="search">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <Search className="w-5 h-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="location-search"
                  type="search"
                  placeholder="Search Location (Philippines)"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => searchQuery && setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSuggestions(false);
                    }
                  }}
                  className="w-full pl-10 pr-12 py-2.5 sm:py-3 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#0a2a4d] focus:border-transparent transition-shadow"
                  aria-describedby="search-hint"
                  aria-autocomplete="list"
                  aria-controls="search-suggestions"
                  aria-expanded={showSuggestions && searchSuggestions.length > 0}
                  autoComplete="off"
                />
                <span id="search-hint" className="sr-only">
                  Type at least 3 characters to search. Use arrow keys to navigate suggestions.
                </span>
                <button 
                  type="button"
                  aria-label={isSearching ? 'Searching...' : 'Search location'}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-[#0a2a4d] hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a2a4d]"
                  onClick={() => searchQuery && searchLocation(searchQuery)}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
                
                {/* Search Suggestions Dropdown */}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <ul
                    id="search-suggestions"
                    role="listbox"
                    aria-label="Location suggestions"
                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
                  >
                    {searchSuggestions.map((suggestion) => (
                      <li key={suggestion.place_id} role="option" aria-selected={false}>
                        <button
                          onClick={() => handleSelectSuggestion(suggestion)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {suggestion.display_name.split(',')[0]}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {suggestion.display_name}
                              </p>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              
              {/* Stop Following Button - shown when following active */}
              {isFollowingSearch && selectedLocation && (
                <button
                  type="button"
                  onClick={() => setIsFollowingSearch(false)}
                  className="mt-3 w-full px-4 py-2.5 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
                  aria-live="polite"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
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
          </div>

          {/* Active Hazards Count - Fixed at bottom */}
          <div className="p-4 border-t border-gray-200 bg-white shrink-0">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm sm:text-base text-gray-700">
                    <strong className="text-[#0a2a4d] text-lg sm:text-xl">{filteredHazards.length}</strong>
                    <span className="ml-1">hazard{filteredHazards.length !== 1 ? 's' : ''} visible</span>
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                    {hazards.length - filteredHazards.length > 0 && (
                      <span className="text-amber-600 font-medium">
                        {hazards.length - filteredHazards.length} hidden by filters
                      </span>
                    )}
                    {hazards.length - filteredHazards.length === 0 && 'All hazards shown'}
                  </p>
                </div>
                <Badge variant="outline" className="hidden sm:flex bg-white text-[#0a2a4d] border-[#0a2a4d]">
                  Live
                </Badge>
              </div>
            </div>
          </div>
        </aside>

        {/* Sidebar Toggle Button */}
        <button
          ref={sidebarToggleRef}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`${
            isSidebarOpen 
              ? `${isSidebarExpanded ? 'md:left-[420px]' : 'md:left-80'} hidden md:flex` 
              : 'left-0 flex'
          } fixed md:absolute top-20 sm:top-24 z-[1001] bg-white shadow-lg rounded-r-xl p-2.5 sm:p-3 hover:bg-gray-50 transition-all duration-300 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-[#0a2a4d] focus:ring-offset-1 items-center justify-center group`}
          aria-label={isSidebarOpen ? 'Close filters sidebar' : 'Open filters sidebar'}
          aria-expanded={isSidebarOpen}
          aria-controls="sidebar-filters"
        >
          {isSidebarOpen ? (
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 group-hover:text-[#0a2a4d]" aria-hidden="true" />
          ) : (
            <>
              <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 group-hover:text-[#0a2a4d]" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2 sm:text-sm sm:font-medium sm:text-gray-700 sm:group-hover:text-[#0a2a4d]">
                Filters
              </span>
            </>
          )}
        </button>

        {/* Mobile Overlay when sidebar is open */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/30 z-[999] md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Map Container - Full Screen */}
        <div 
          ref={mapContainerRef} 
          className="absolute inset-0" 
          id="public-map-container"
          role="application"
          aria-label="Interactive hazard map of the Philippines"
        >
          {/* Mobile Controls Toggle Button — visible only on small screens when sidebar is closed */}
          {!isSidebarOpen && (
            <button
              className="sm:hidden absolute top-4 right-4 z-[1001] p-2.5 bg-white/95 backdrop-blur-sm shadow-lg rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a2a4d]"
              onClick={() => setIsMobileControlsOpen(prev => !prev)}
              aria-label={isMobileControlsOpen ? 'Hide map controls' : 'Show map controls'}
              aria-expanded={isMobileControlsOpen}
              aria-controls="mobile-controls-panel"
              data-map-control="true"
            >
              {isMobileControlsOpen
                ? <X className="w-5 h-5 text-gray-700" aria-hidden="true" />
                : <Layers className="w-5 h-5 text-gray-700" aria-hidden="true" />
              }
            </button>
          )}

          {/* Unified Floating Controls Panel - Top Right */}
          <Card
            id="mobile-controls-panel"
            className={`absolute right-4 sm:right-6 z-[1000] bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200 w-[280px] sm:w-[300px] max-h-[75vh] sm:max-h-none overflow-y-auto sm:overflow-visible transition-all duration-300 motion-reduce:transition-none ${
              isMobileControlsOpen && !isSidebarOpen ? 'top-[3.75rem] block' : 'top-4 sm:top-6 hidden sm:block'
            } ${
              isSidebarOpen ? 'sm:opacity-0 sm:pointer-events-none md:opacity-100 md:pointer-events-auto' : ''
            }`}
            data-map-control="true"
            role="region"
            aria-label="Map controls and legend"
          >
            {/* Report Generator Button (RG-02) - Only for authenticated users */}
            {user && (
              <div className="p-3 border-b border-gray-100">
                <ReportGenerator 
                  hazards={filteredHazards}
                  mapContainerRef={mapContainerRef}
                  onReportGenerated={() => {
                    setAnnouncement('Report generated successfully.');
                  }}
                  triggerButton={
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2">
                      <FileText className="w-4 h-4" />
                      Generate Report
                    </button>
                  }
                />
              </div>
            )}

            {/* Legend Section */}
            <div className="p-3 sm:p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 id="legend-heading" className="text-sm sm:text-base font-semibold text-gray-800">
                  Legend
                </h2>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                    aria-label={`${filteredHazards.length} active hazards`}
                  >
                    {filteredHazards.length} active
                  </Badge>
                  <button
                    onClick={() => setIsLegendVisible(!isLegendVisible)}
                    className="p-1.5 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a2a4d]"
                    aria-expanded={isLegendVisible}
                    aria-controls="legend-content"
                    aria-label={isLegendVisible ? 'Collapse legend' : 'Expand legend'}
                  >
                    {isLegendVisible ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              {isLegendVisible && (
                <ul 
                  id="legend-content"
                  className="space-y-1 max-h-[200px] overflow-y-auto mt-3 -mx-1 px-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                  aria-label="Hazard types and counts"
                >
                  {Object.entries(HAZARD_ICON_REGISTRY).map(([key, config]) => {
                    const count = filteredHazards.filter(h => h.hazard_type === key).length;
                    const hasCount = count > 0;
                    return (
                      <li
                        key={key}
                        className={`flex items-center justify-between p-1.5 rounded-lg transition-colors ${
                          hasCount ? 'hover:bg-gray-50 cursor-default' : 'opacity-40'
                        }`}
                        aria-label={`${config.label}: ${count} ${count === 1 ? 'hazard' : 'hazards'}`}
                      >
                        <div className="flex items-center space-x-2">
                          <div 
                            className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0"
                            style={{ 
                              backgroundColor: hasCount ? config.bgColor : '#f3f4f6', 
                              color: hasCount ? config.color : '#9ca3af' 
                            }}
                            aria-hidden="true"
                          >
                            <HazardIcon hazardType={key} size={16} />
                          </div>
                          <span className={`text-xs font-medium ${hasCount ? 'text-gray-700' : 'text-gray-400'}`}>
                            {config.label}
                          </span>
                        </div>
                        <Badge 
                          variant={hasCount ? "secondary" : "outline"} 
                          className={`text-xs h-5 min-w-[1.75rem] justify-center ${
                            hasCount 
                              ? 'bg-gray-100 text-gray-700' 
                              : 'bg-transparent text-gray-400 border-gray-200'
                          }`}
                        >
                          {count}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Map Controls Section - Clustering & Heatmap */}
            <div className="p-3 sm:p-4 space-y-3">
              {/* Clustering Toggle */}
              <div className="flex items-center justify-between" data-tour="cluster-section">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 rounded-md">
                    <Layers className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  </div>
                  <span id="clustering-label" className="text-sm font-medium text-gray-700">
                    Clustering
                  </span>
                </div>
                <button
                  type="button"
                  data-tour="cluster-toggle"
                  onClick={() => setClusteringEnabled(!clusteringEnabled)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full
                    transition-colors duration-200 motion-reduce:transition-none
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${clusteringEnabled ? 'bg-blue-600' : 'bg-gray-300'}
                  `}
                  role="switch"
                  aria-checked={clusteringEnabled}
                  aria-labelledby="clustering-label"
                >
                  <span className="sr-only">
                    {clusteringEnabled ? 'Disable clustering' : 'Enable clustering'}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200
                      ${clusteringEnabled ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Heatmap Toggle */}
              <div className="flex items-center justify-between" data-tour="heatmap-section">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${currentZoom > heatmapSettings.maxZoom ? 'bg-gray-100' : 'bg-orange-50'}`}>
                    <MapIcon 
                      className={`w-4 h-4 ${currentZoom > heatmapSettings.maxZoom ? 'text-gray-400' : 'text-orange-600'}`} 
                      aria-hidden="true" 
                    />
                  </div>
                  <div className="flex flex-col">
                    <span id="heatmap-label" className="text-sm font-medium text-gray-700">
                      Heatmap
                    </span>
                    {currentZoom > heatmapSettings.maxZoom && (
                      <span className="text-[10px] text-amber-600 font-medium leading-tight">
                        Zoom out to enable
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  data-tour="heatmap-toggle"
                  onClick={() => updateHeatmapSettings({ enabled: !heatmapSettings.enabled })}
                  disabled={currentZoom > heatmapSettings.maxZoom}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full
                    transition-colors duration-200 motion-reduce:transition-none
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${heatmapSettings.enabled && currentZoom <= heatmapSettings.maxZoom ? 'bg-blue-600' : 'bg-gray-300'}
                    ${currentZoom > heatmapSettings.maxZoom ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  role="switch"
                  aria-checked={heatmapSettings.enabled && currentZoom <= heatmapSettings.maxZoom}
                  aria-labelledby="heatmap-label"
                  aria-disabled={currentZoom > heatmapSettings.maxZoom}
                >
                  <span className="sr-only">
                    {heatmapSettings.enabled ? 'Disable heatmap' : 'Enable heatmap'}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200
                      ${heatmapSettings.enabled && currentZoom <= heatmapSettings.maxZoom ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Settings Link */}
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors pt-1"
                aria-expanded={showSettings}
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showSettings ? 'Hide settings' : 'Heatmap settings'}</span>
              </button>

              {/* Heatmap Settings Panel */}
              {showSettings && (
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div>
                    <label htmlFor="heatmap-radius" className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>Radius</span>
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{heatmapSettings.radius}px</span>
                    </label>
                    <input
                      id="heatmap-radius"
                      type="range"
                      min="10"
                      max="50"
                      value={heatmapSettings.radius}
                      onChange={(e) => updateHeatmapSettings({ radius: Number(e.target.value) })}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="heatmap-blur" className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>Blur</span>
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{heatmapSettings.blur}px</span>
                    </label>
                    <input
                      id="heatmap-blur"
                      type="range"
                      min="5"
                      max="30"
                      value={heatmapSettings.blur}
                      onChange={(e) => updateHeatmapSettings({ blur: Number(e.target.value) })}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Error Alert - Enhanced Styling */}
          {error && (
            <div 
              className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1100] max-w-md w-full px-4"
              role="alert"
              aria-live="assertive"
            >
              <Alert variant="destructive" className="bg-red-50 border-red-300 shadow-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 mt-0.5 text-red-600 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-red-800 font-medium">Error Loading Data</p>
                    <p className="text-red-700 text-sm mt-1">{error}</p>
                    <button
                      onClick={fetchHazards}
                      className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </Alert>
            </div>
          )}

          {/* Loading State - Enhanced Accessibility */}
          {loading && hazards.length === 0 && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-gray-50/90 backdrop-blur-sm z-[999]"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Card className="p-6 sm:p-8 shadow-xl border border-gray-200">
                <div className="flex flex-col items-center space-y-4">
                  <div 
                    className="animate-spin rounded-full h-12 w-12 sm:h-14 sm:w-14 border-4 border-gray-200 border-t-[#0a2a4d]" 
                    aria-hidden="true"
                  />
                  <div className="text-center">
                    <p className="text-gray-800 font-medium text-base sm:text-lg">Loading hazard data...</p>
                    <p className="text-gray-500 text-sm mt-1">This may take a moment</p>
                  </div>
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
            
            {/* Map Controls - Zoom on left to avoid legend overlap */}
            <ZoomControl position="topleft" />
            <ScaleControl position="bottomright" />
            
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
            
            {/* Layers Control - Base Map Switcher (bottom-right to avoid sidebar overlap) */}
            <LayersControl position="bottomright">
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
        </div>
      </div>

      {/* Stats Footer - Enhanced Responsiveness and Accessibility */}
      <footer 
        className="bg-white border-t border-gray-200 py-2 sm:py-3 z-[9999] relative" 
        data-realtime-footer="true"
        role="contentinfo"
        aria-label="Hazard statistics and controls"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
            {/* Hazard Count */}
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className="bg-green-50 text-green-700 border-green-200 font-semibold"
                aria-label={`${hazards.length} active hazards displayed`}
              >
                <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse" aria-hidden="true" />
                {hazards.length} Active
              </Badge>
              <span className="hidden sm:inline text-gray-400">|</span>
              <span className="hidden sm:inline">
                hazard{hazards.length !== 1 ? 's' : ''} displayed
              </span>
            </div>

            {/* Last Updated & Auto-refresh */}
            <div className="flex items-center gap-2 text-gray-500">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Updated: {lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-green-600 font-medium">Auto-refresh: 30s</span>
            </div>

            {/* Report a Hazard Link */}
            <Link 
              to="/report" 
              className="flex items-center gap-1.5 text-[#005a9c] hover:text-[#003d66] font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[#005a9c] focus:ring-offset-2 rounded px-2 py-1 -mx-2 transition-colors"
              aria-label="Report a hazard - opens citizen report form"
            >
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              <span>Report a Hazard</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </Link>
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
