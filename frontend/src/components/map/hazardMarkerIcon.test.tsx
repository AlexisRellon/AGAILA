/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { getHazardMarkerIcon } from './hazardMarkerIcon';

describe('getHazardMarkerIcon', () => {
  it('returns a cached icon for same hazard/severity', () => {
    const a = getHazardMarkerIcon('flood', 'high');
    const b = getHazardMarkerIcon('flood', 'high');
    expect(a).toBe(b);
  });

  it('falls back for unknown hazard types', () => {
    const icon = getHazardMarkerIcon('unknown_hazard', 'low');
    expect(icon.options.html).toContain('O');
  });
});