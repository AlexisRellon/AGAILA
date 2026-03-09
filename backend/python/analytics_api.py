"""
Analytics API for GAIA Dashboard
Provides real-time analytics, statistics, and trends for hazard data.

Supports: CD-01 (Dashboard Analytics), AAM-01 (Trend Analysis), AAM-02 (KPI Dashboard)
"""

import os
import logging
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.supabase_client import supabase

# Import Redis caching for performance
from backend.python.middleware.redis_cache import (
    cache_response, 
    get_or_set, 
    generate_cache_key,
    CACHE_TTLS
)

logger = logging.getLogger(__name__)

# Supabase client imported from centralized configuration

# Create router
router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


# ============================================================================
# Pydantic Models
# ============================================================================

class HazardStats(BaseModel):
    """Overall hazard statistics"""
    total_hazards: int
    active_hazards: int
    resolved_hazards: int
    unverified_reports: int
    avg_confidence: float
    avg_time_to_action: Optional[float]  # In minutes


class HazardTrend(BaseModel):
    """Time-series data for hazard trends - supports all hazard types dynamically"""
    date: str
    volcanic_eruption: int = 0
    earthquake: int = 0
    flood: int = 0
    landslide: int = 0
    fire: int = 0
    storm_surge: int = 0
    typhoon: int = 0
    tsunami: int = 0
    drought: int = 0
    tornado: int = 0
    coastal_erosion: int = 0
    other: int = 0
    total: int = 0
    
    class Config:
        extra = 'allow'  # Allow additional hazard types


class RegionStats(BaseModel):
    """Hazard statistics by region"""
    region: str
    total_count: int
    active_count: int
    resolved_count: int


class HazardTypeDistribution(BaseModel):
    """Distribution of hazards by type"""
    hazard_type: str
    count: int
    percentage: float


class RecentAlert(BaseModel):
    """Recent hazard alert"""
    id: str
    hazard_type: str
    severity: Optional[str]  # Can be NULL in database
    location_name: Optional[str]  # Can be NULL
    admin_division: Optional[str]  # Can be NULL
    confidence_score: float
    detected_at: str
    status: str


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/stats", response_model=HazardStats)
async def get_hazard_stats():
    """
    Get overall hazard statistics (cached for 30s)
    """
    cache_key = generate_cache_key("analytics:stats")
    
    async def fetch_stats():
        # Get total hazards
        total_response = supabase.schema("gaia").from_('hazards').select('id', count='exact').execute()
        total_hazards = total_response.count or 0
        
        # Get active hazards
        active_response = supabase.schema("gaia").from_('hazards').select('id', count='exact').eq('status', 'active').execute()
        active_hazards = active_response.count or 0
        
        # Get resolved hazards
        resolved_response = supabase.schema("gaia").from_('hazards').select('id', count='exact').eq('status', 'resolved').execute()
        resolved_hazards = resolved_response.count or 0
        
        # Get unverified reports (confidence < 0.7)
        unverified_response = supabase.schema("gaia").from_('hazards').select('id', count='exact').lt('confidence_score', 0.7).eq('validated', False).execute()
        unverified_reports = unverified_response.count or 0
        
        # Get average confidence score (direct query instead of RPC)
        all_hazards_response = supabase.schema('gaia').from_('hazards').select('confidence_score').execute()
        if all_hazards_response.data:
            confidence_scores = [h['confidence_score'] for h in all_hazards_response.data if h.get('confidence_score')]
            avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
        else:
            avg_confidence = 0.0
        
        avg_time_to_action = None
        
        return {
            "total_hazards": total_hazards,
            "active_hazards": active_hazards,
            "resolved_hazards": resolved_hazards,
            "unverified_reports": unverified_reports,
            "avg_confidence": round(avg_confidence, 2),
            "avg_time_to_action": round(avg_time_to_action / 60, 2) if avg_time_to_action else None
        }
    
    try:
        data = await get_or_set(cache_key, fetch_stats, ttl=CACHE_TTLS.get("analytics:stats", 30))
        return HazardStats(**data)
        
    except Exception as e:
        logger.error(f"Error fetching hazard stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard statistics: {str(e)}")


@router.get("/trends", response_model=List[HazardTrend])
async def get_hazard_trends(
    days: int = Query(30, ge=7, le=90, description="Number of days to retrieve (7-90)")
):
    """
    Get hazard trends over time (cached for 2 minutes)
    """
    cache_key = generate_cache_key("analytics:trends", days=days)
    
    async def fetch_trends():
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        response = supabase.schema('gaia').from_('hazards') \
            .select('hazard_type,detected_at') \
            .gte('detected_at', start_date.isoformat()) \
            .lte('detected_at', end_date.isoformat()) \
            .execute()
        
        date_data = {}
        all_hazard_types = [
            'volcanic_eruption', 'earthquake', 'flood', 'landslide', 'fire',
            'storm_surge', 'typhoon', 'tsunami', 'drought', 'tornado',
            'coastal_erosion', 'other'
        ]
        
        for i in range(days):
            date_str = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
            date_data[date_str] = {'date': date_str, 'total': 0}
            for hazard_type in all_hazard_types:
                date_data[date_str][hazard_type] = 0
        
        if response.data:
            for item in response.data:
                detected = datetime.fromisoformat(item['detected_at'].replace('Z', '+00:00'))
                date_str = detected.strftime('%Y-%m-%d')
                if date_str in date_data:
                    hazard_type = item['hazard_type']
                    if hazard_type in date_data[date_str]:
                        date_data[date_str][hazard_type] += 1
                    date_data[date_str]['total'] += 1
        
        return sorted(list(date_data.values()), key=lambda x: x['date'])
    
    try:
        data = await get_or_set(cache_key, fetch_trends, ttl=CACHE_TTLS.get("analytics:trends", 120))
        return [HazardTrend(**item) for item in data]
        
    except Exception as e:
        logger.error(f"Error fetching hazard trends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard trends: {str(e)}")


@router.get("/regions", response_model=List[RegionStats])
async def get_region_stats():
    """
    Get hazard statistics by region (cached for 3 minutes)
    """
    cache_key = generate_cache_key("analytics:regions")
    
    async def fetch_regions():
        from backend.python.philippine_regions import (
            get_region_from_location,
            PROVINCE_TO_REGION,
            PHILIPPINE_ADMIN_MAPPING,
        )

        response = supabase.schema('gaia').from_('hazards') \
            .select('admin_division,location_name,status') \
            .execute()
        
        if not response.data:
            return []
        
        known_regions = {v['region'] for v in PROVINCE_TO_REGION.values()}
        known_regions.update({'NCR', 'CAR', 'BARMM'})

        city_lookup = {k.lower(): v for k, v in PHILIPPINE_ADMIN_MAPPING.items()}
        province_lookup = {k.lower(): v for k, v in PROVINCE_TO_REGION.items()}

        def _try_resolve(text: str) -> Optional[str]:
            """Try to resolve a single text fragment to a region code."""
            if not text:
                return None
            clean = text.strip()
            if not clean or clean.lower() == 'philippines':
                return None

            if clean in known_regions:
                return clean

            result = get_region_from_location(city=clean)
            if result:
                return result['region']
            result = get_region_from_location(province=clean)
            if result:
                return result['region']

            words = clean.split()
            if len(words) > 1:
                without_suffix = ' '.join(words[:-1])
                result = get_region_from_location(city=without_suffix)
                if result:
                    return result['region']

            lower = clean.lower()
            for city_key, data in city_lookup.items():
                if city_key in lower or lower in city_key:
                    return data['region']
            for prov_key, data in province_lookup.items():
                if prov_key in lower or lower in prov_key:
                    return data['region']

            return None

        def resolve_region(admin_div: str, location_name: str) -> str:
            """Resolve admin_division + location_name to a standardized region code."""
            for candidate in [admin_div, location_name]:
                if not candidate or not candidate.strip():
                    continue

                hit = _try_resolve(candidate)
                if hit:
                    return hit

                parts = [p.strip() for p in candidate.split(',') if p.strip()]
                for part in parts:
                    hit = _try_resolve(part)
                    if hit:
                        return hit

            return 'Unknown'

        region_data: Dict[str, Dict] = {}
        for item in response.data:
            raw_admin = item.get('admin_division') or ''
            loc_name = item.get('location_name') or ''
            region = resolve_region(raw_admin, loc_name)

            if region not in region_data:
                region_data[region] = {
                    'region': region,
                    'total_count': 0,
                    'active_count': 0,
                    'resolved_count': 0
                }
            
            region_data[region]['total_count'] += 1
            if item.get('status') == 'active':
                region_data[region]['active_count'] += 1
            elif item.get('status') == 'resolved':
                region_data[region]['resolved_count'] += 1
        
        return sorted(list(region_data.values()), key=lambda x: x['total_count'], reverse=True)
    
    try:
        data = await get_or_set(cache_key, fetch_regions, ttl=CACHE_TTLS.get("analytics:regions", 180))
        return [RegionStats(**item) for item in data]
        
    except Exception as e:
        logger.error(f"Error fetching region stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch region statistics: {str(e)}")


@router.get("/distribution", response_model=List[HazardTypeDistribution])
async def get_hazard_distribution():
    """
    Get distribution of hazards by type (cached for 2 minutes)
    """
    cache_key = generate_cache_key("analytics:distribution")
    
    async def fetch_distribution():
        total_response = supabase.schema("gaia").from_('hazards').select('id', count='exact').execute()
        total = total_response.count or 0
        
        if total == 0:
            return []
        
        response = supabase.schema("gaia").from_('hazards') \
            .select('hazard_type') \
            .execute()
        
        type_counts = {}
        for item in response.data:
            hazard_type = item['hazard_type']
            type_counts[hazard_type] = type_counts.get(hazard_type, 0) + 1
        
        distribution = []
        for hazard_type, count in type_counts.items():
            percentage = (count / total) * 100
            distribution.append({
                "hazard_type": hazard_type,
                "count": count,
                "percentage": round(percentage, 1)
            })
        
        distribution.sort(key=lambda x: x["count"], reverse=True)
        return distribution
    
    try:
        data = await get_or_set(cache_key, fetch_distribution, ttl=CACHE_TTLS.get("analytics:distribution", 120))
        return [HazardTypeDistribution(**item) for item in data]
        
    except Exception as e:
        logger.error(f"Error fetching hazard distribution: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard distribution: {str(e)}")


@router.get("/recent-alerts", response_model=List[RecentAlert])
async def get_recent_alerts(
    limit: int = Query(10, ge=1, le=50, description="Number of recent alerts to retrieve")
):
    """
    Get most recent hazard alerts (cached for 15 seconds)
    """
    cache_key = generate_cache_key("analytics:alerts", limit=limit)
    
    async def fetch_alerts():
        response = supabase.schema("gaia").from_('hazards') \
            .select('id, hazard_type, severity, location_name, admin_division, confidence_score, detected_at, status') \
            .order('detected_at', desc=True) \
            .limit(limit) \
            .execute()
        
        return response.data or []
    
    try:
        data = await get_or_set(cache_key, fetch_alerts, ttl=CACHE_TTLS.get("analytics:alerts", 15))
        return [RecentAlert(**item) for item in data]
        
    except Exception as e:
        logger.error(f"Error fetching recent alerts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch recent alerts: {str(e)}")
