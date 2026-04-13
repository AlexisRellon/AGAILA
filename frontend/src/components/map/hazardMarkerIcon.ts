import L, { DivIcon } from 'leaflet';
import { getHazardIcon } from '../../constants/hazard-icons';

const markerCache = new Map<string, DivIcon>();

export function getHazardMarkerIcon(hazardType: string, severity?: string): DivIcon {
  const normalizedType = (hazardType || 'other').toLowerCase();
  const normalizedSeverity = (severity || 'low').toLowerCase();
  const cacheKey = `${normalizedType}:${normalizedSeverity}`;

  if (markerCache.has(cacheKey)) {
    return markerCache.get(cacheKey)!;
  }

  const config = getHazardIcon(normalizedType);
  const severityRing =
    normalizedSeverity === 'critical'
      ? '0 0 0 3px rgba(220,38,38,0.35)'
      : normalizedSeverity === 'high'
        ? '0 0 0 3px rgba(245,158,11,0.35)'
        : '0 0 0 2px rgba(15,23,42,0.12)';

  const icon = L.divIcon({
    className: 'hazard-marker-icon',
    html: `<div style="
      width:24px;
      height:24px;
      border-radius:9999px;
      background:${config.color};
      border:2px solid #ffffff;
      box-shadow:${severityRing};
      display:flex;
      align-items:center;
      justify-content:center;
      color:#ffffff;
      font-size:10px;
      font-weight:700;
      line-height:1;
    ">${(config.label || 'H').charAt(0).toUpperCase()}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  markerCache.set(cacheKey, icon);
  return icon;
}
