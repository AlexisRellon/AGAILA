/**
 * Centralized Hazard Icon Registry
 *
 * This module provides a single source of truth for all hazard-related icons
 * used throughout the GAIA application. Centralizing icons:
 * - Improves performance by ensuring consistent imports
 * - Ensures semantic consistency (each hazard has contextually appropriate icon)
 * - Makes updates easier (change in one place, reflects everywhere)
 * - Supports accessibility with proper labels
 *
 * Module: GV-01, FP-01
 * Change: improve-hazard-icons
 *
 * Icon Selection Rationale (FontAwesome):
 * - Flood: faHouseFloodWater (house with water, representing flooding)
 * - Typhoon: faHurricane (hurricane icon, representing typhoon power)
 * - Landslide: faHillRockslide (hill with rockslide, representing landslide)
 * - Earthquake: faHouseChimneyCrack (house with crack, representing earthquake damage)
 * - Volcanic Eruption: faVolcano (volcano icon, representing eruption)
 * - Storm Surge: faHouseFloodWaterCircleArrowRight (water surge with arrow)
 * - Tsunami: Not in FontAwesome, mapped to storm_surge equivalent
 * - Fire: faFire (fire/flames)
 * - Drought: faSunPlantWilt (sun with wilting plant, representing drought)
 * - Heat Wave: faSunPlantWilt (sun with wilting plant, representing heat)
 * - Heavy Rain: Not directly available, using faCloudRain alternative
 * - Other: faExclamationTriangle (general hazard/warning)
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  IconDefinition,
  faHouseFloodWater,
  faHurricane,
  faHillRockslide,
  faVolcano,
  faHouseChimneyCrack,
  faHouseFloodWaterCircleArrowRight,
  faSunPlantWilt,
  faFire,
  faCloudRain,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HazardIconConfig {
  /** The FontAwesome icon definition */
  icon: IconDefinition;
  /** Primary color for the hazard type (hex) */
  color: string;
  /** Background color for badges/chips (with opacity) */
  bgColor: string;
  /** Human-readable label */
  label: string;
  /** Accessible description for screen readers */
  ariaLabel: string;
  /** Icon keywords for search/filtering */
  keywords: string[];
}

export type HazardType =
  | 'flood'
  | 'typhoon'
  | 'landslide'
  | 'earthquake'
  | 'volcanic_eruption'
  | 'storm_surge'
  | 'tsunami'
  | 'fire'
  | 'drought'
  | 'heat_wave'
  | 'heavy_rain'
  | 'other';

// ============================================================================
// HAZARD ICON REGISTRY
// ============================================================================

/**
 * Master registry of all hazard types with their icons and metadata.
 * This is the single source of truth for hazard visualization.
 */
export const HAZARD_ICON_REGISTRY: Record<HazardType, HazardIconConfig> = {
  flood: {
    icon: faHouseFloodWater,
    color: '#3b82f6', // blue-500
    bgColor: 'rgba(59, 130, 246, 0.15)',
    label: 'Flood',
    ariaLabel: 'Flood hazard indicator',
    keywords: ['water', 'flooding', 'overflow', 'inundation', 'deluge'],
  },
  typhoon: {
    icon: faHurricane,
    color: '#6366f1', // indigo-500
    bgColor: 'rgba(99, 102, 241, 0.15)',
    label: 'Typhoon',
    ariaLabel: 'Typhoon hazard indicator',
    keywords: ['storm', 'hurricane', 'cyclone', 'tropical storm', 'bagyo', 'wind'],
  },
  landslide: {
    icon: faHillRockslide,
    color: '#a855f7', // purple-500
    bgColor: 'rgba(168, 85, 247, 0.15)',
    label: 'Landslide',
    ariaLabel: 'Landslide hazard indicator',
    keywords: ['mudslide', 'debris flow', 'rockfall', 'slope failure', 'erosion'],
  },
  earthquake: {
    icon: faHouseChimneyCrack,
    color: '#ef4444', // red-500
    bgColor: 'rgba(239, 68, 68, 0.15)',
    label: 'Earthquake',
    ariaLabel: 'Earthquake hazard indicator',
    keywords: ['seismic', 'tremor', 'quake', 'lindol', 'temblor', 'shaking'],
  },
  volcanic_eruption: {
    icon: faVolcano,
    color: '#dc2626', // red-600
    bgColor: 'rgba(220, 38, 38, 0.15)',
    label: 'Volcanic Eruption',
    ariaLabel: 'Volcanic eruption hazard indicator',
    keywords: ['volcano', 'lava', 'ash', 'magma', 'pyroclastic', 'bulkan'],
  },
  storm_surge: {
    icon: faHouseFloodWaterCircleArrowRight,
    color: '#0891b2', // cyan-600
    bgColor: 'rgba(8, 145, 178, 0.15)',
    label: 'Storm Surge',
    ariaLabel: 'Storm surge hazard indicator',
    keywords: ['coastal flooding', 'tidal surge', 'wave surge', 'daluyong'],
  },
  tsunami: {
    icon: faHouseFloodWaterCircleArrowRight,
    color: '#06b6d4', // cyan-500
    bgColor: 'rgba(6, 182, 212, 0.15)',
    label: 'Tsunami',
    ariaLabel: 'Tsunami hazard indicator',
    keywords: ['tidal wave', 'seismic wave', 'ocean wave', 'coastal disaster'],
  },
  fire: {
    icon: faFire,
    color: '#f97316', // orange-500
    bgColor: 'rgba(249, 115, 22, 0.15)',
    label: 'Fire',
    ariaLabel: 'Fire hazard indicator',
    keywords: ['wildfire', 'blaze', 'forest fire', 'sunog', 'conflagration'],
  },
  drought: {
    icon: faSunPlantWilt,
    color: '#eab308', // yellow-500
    bgColor: 'rgba(234, 179, 8, 0.15)',
    label: 'Drought',
    ariaLabel: 'Drought hazard indicator',
    keywords: ['dry spell', 'water shortage', 'arid', 'tagtuyot', 'el niño'],
  },
  heat_wave: {
    icon: faSunPlantWilt,
    color: '#f59e0b', // amber-500
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'Heat Wave',
    ariaLabel: 'Heat wave hazard indicator',
    keywords: ['extreme heat', 'high temperature', 'heat index', 'init'],
  },
  heavy_rain: {
    icon: faCloudRain,
    color: '#0ea5e9', // sky-500
    bgColor: 'rgba(14, 165, 233, 0.15)',
    label: 'Heavy Rain',
    ariaLabel: 'Heavy rain hazard indicator',
    keywords: ['rainfall', 'downpour', 'precipitation', 'ulan', 'monsoon'],
  },
  other: {
    icon: faExclamationTriangle,
    color: '#64748b', // slate-500
    bgColor: 'rgba(100, 116, 139, 0.15)',
    label: 'Other Hazards',
    ariaLabel: 'Other hazard indicator',
    keywords: ['miscellaneous', 'unclassified', 'iba pa', 'general'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get icon configuration for a hazard type.
 * Falls back to 'other' if the type is unknown.
 */
export function getHazardIcon(type: string): HazardIconConfig {
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_') as HazardType;
  return HAZARD_ICON_REGISTRY[normalizedType] || HAZARD_ICON_REGISTRY.other;
}

/**
 * Get all hazard types as an array.
 */
export function getAllHazardTypes(): HazardType[] {
  return Object.keys(HAZARD_ICON_REGISTRY) as HazardType[];
}

/**
 * Get hazard labels as a Record for dropdowns/selects.
 */
export function getHazardLabels(): Record<string, string> {
  return Object.entries(HAZARD_ICON_REGISTRY).reduce(
    (acc, [key, config]) => {
      acc[key] = config.label;
      return acc;
    },
    {} as Record<string, string>
  );
}

/**
 * Search hazards by keyword.
 */
export function searchHazardsByKeyword(keyword: string): HazardType[] {
  const lowerKeyword = keyword.toLowerCase();
  return getAllHazardTypes().filter((type) => {
    const config = HAZARD_ICON_REGISTRY[type];
    return (
      config.label.toLowerCase().includes(lowerKeyword) ||
      config.keywords.some((kw) => kw.toLowerCase().includes(lowerKeyword))
    );
  });
}

// ============================================================================
// ICON COMPONENTS (with custom icons for specific hazards)
// ============================================================================

interface HazardIconProps {
  /** The hazard type to render */
  hazardType: string;
  /** Whether to use the hazard's defined color */
  useHazardColor?: boolean;
  /** Icon size in pixels */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders the appropriate icon for a hazard type.
 * Uses FontAwesome icons for all hazard types with consistent rendering.
 */
export const HazardIcon: React.FC<HazardIconProps> = ({
  hazardType,
  useHazardColor = false,
  size = 16,
  className,
  style,
}) => {
  const config = getHazardIcon(hazardType);
  const iconColor = useHazardColor ? config.color : 'currentColor';

  return (
    <FontAwesomeIcon
      icon={config.icon}
      className={className}
      style={{
        color: iconColor,
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        ...style,
      }}
      aria-label={config.ariaLabel}
    />
  );
};

/**
 * Renders a hazard badge with icon and label.
 */
interface HazardBadgeProps {
  hazardType: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const HazardBadge: React.FC<HazardBadgeProps> = ({
  hazardType,
  showLabel = true,
  size = 'md',
  className = '',
}) => {
  const config = getHazardIcon(hazardType);

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-sm gap-1.5',
    lg: 'px-3 py-1.5 text-base gap-2',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses[size]} ${className}`}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
      role="status"
      aria-label={config.ariaLabel}
    >
      <HazardIcon hazardType={hazardType} size={iconSizes[size]} useHazardColor />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};

// ============================================================================
// EXPORTS FOR BACKWARDS COMPATIBILITY
// ============================================================================

/**
 * Legacy hazard icons mapping (for existing components).
 * @deprecated Use HAZARD_ICON_REGISTRY or getHazardIcon() instead.
 */
export const HAZARD_ICONS = Object.entries(HAZARD_ICON_REGISTRY).reduce(
  (acc, [key, config]) => {
    acc[key] = { icon: config.icon, color: config.color };
    return acc;
  },
  {} as Record<string, { icon: IconDefinition; color: string }>
);

/**
 * Legacy hazard labels mapping.
 * @deprecated Use HAZARD_ICON_REGISTRY or getHazardLabels() instead.
 */
export const HAZARD_LABELS = getHazardLabels();

export default HAZARD_ICON_REGISTRY;
