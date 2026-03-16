"""
Hazards API - Backend Proxy for Hazard Data Access
Replaces direct Supabase client access from frontend

Security: PATCH-1 (Critical Security Fixes)
- No Supabase credentials exposed to frontend
- All queries go through backend with validation
- RBAC enforcement and audit logging
- Rate limiting applied (will be moved to Redis in Patch 2)

Module: GV-02 (Geospatial Visualization), FP-01 to FP-04 (Filtering)
"""

import asyncio
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from pydantic import BaseModel, Field

from backend.python.lib.supabase_client import supabase
from backend.python.middleware.rbac import UserContext, require_auth, get_current_user_optional
# PATCH-2: Import Redis rate limiter
from backend.python.middleware.redis_rate_limiter import (
    RateLimitHazardsRead,
    RateLimitHazardsNearby,
    RateLimitDefault,
)
from backend.python.middleware.activity_logger import ActivityLogger
from backend.python.middleware.redis_cache import (
    get_or_set,
    generate_cache_key,
    CACHE_TTLS,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/hazards",
    tags=["Hazards API"],
    responses={404: {"description": "Not found"}},
)


# ============================================================================
# Pydantic Models
# ============================================================================

class HazardResponse(BaseModel):
    """Hazard data response model"""
    id: str
    hazard_type: str
    location_name: str
    latitude: float
    longitude: float
    severity: Optional[str] = None  # Can be null in database
    confidence_score: float
    validated: bool
    source_type: str
    source_url: Optional[str] = None
    source_title: Optional[str] = None  # Match actual database schema
    source_content: Optional[str] = None  # Match actual database schema (was 'description')
    created_at: str
    validated_at: Optional[str] = None
    validated_by: Optional[str] = None
    
    class Config:
        # Allow extra fields from database
        extra = "ignore"


class HazardFilters(BaseModel):
    """Query filters for hazards endpoint"""
    hazard_types: Optional[List[str]] = Field(None, description="Filter by hazard types")
    source_types: Optional[List[str]] = Field(None, description="Filter by source (rss, citizen_report)")
    validated: Optional[bool] = Field(None, description="Filter by validation status")
    min_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    severity: Optional[List[str]] = Field(None, description="Filter by severity")
    time_window_hours: Optional[int] = Field(None, ge=1, le=8760, description="Filter by time window")
    region: Optional[str] = Field(None, description="Filter by Philippine region")
    province: Optional[str] = Field(None, description="Filter by province")
    limit: int = Field(100, ge=1, le=1000, description="Maximum results")
    offset: int = Field(0, ge=0, description="Pagination offset")


class HazardStatsResponse(BaseModel):
    """Hazard statistics response"""
    total_hazards: int
    validated_hazards: int
    unvalidated_hazards: int
    by_type: Dict[str, int]
    by_severity: Dict[str, int]
    by_source: Dict[str, int]
    last_24h: int
    last_7d: int
    last_30d: int


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/", response_model=List[HazardResponse])
async def get_hazards(
    request: Request,
    hazard_types: Optional[str] = Query(None, description="Comma-separated hazard types"),
    source_types: Optional[str] = Query(None, description="Comma-separated source types"),
    validated: Optional[bool] = Query(None, description="Filter by validation status"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0),
    severity: Optional[str] = Query(None, description="Comma-separated severity levels"),
    time_window_hours: Optional[int] = Query(None, ge=1, le=8760),
    region: Optional[str] = Query(None),
    province: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: Optional[UserContext] = Depends(get_current_user_optional),
    _rate_limit: None = Depends(RateLimitHazardsRead)  # PATCH-2: Redis rate limiting
):
    """
    Get hazards with optional filtering

    Public endpoint with rate limiting
    Authenticated users get higher rate limits and more details
    """
    try:
        cache_key = generate_cache_key(
            "hazards:list",
            hazard_types=hazard_types,
            source_types=source_types,
            validated=validated,
            min_confidence=min_confidence,
            severity=severity,
            time_window_hours=time_window_hours,
            region=region,
            province=province,
            limit=limit,
            offset=offset,
        )

        async def fetch_hazards():
            # Build query
            query = supabase.schema("gaia").from_("hazards").select("*")

            # Apply filters
            if hazard_types:
                types_list = [t.strip() for t in hazard_types.split(",")]
                query = query.in_("hazard_type", types_list)

            if source_types:
                sources_list = [s.strip() for s in source_types.split(",")]
                query = query.in_("source_type", sources_list)

            if validated is not None:
                query = query.eq("validated", validated)

            if min_confidence is not None:
                query = query.gte("confidence_score", min_confidence)

            if severity:
                severity_list = [s.strip() for s in severity.split(",")]
                query = query.in_("severity", severity_list)

            if time_window_hours:
                cutoff = datetime.utcnow() - timedelta(hours=time_window_hours)
                query = query.gte("created_at", cutoff.isoformat())

            if region:
                query = query.eq("region", region)

            if province:
                query = query.eq("province", province)

            # Order by newest first
            query = query.order("created_at", desc=True)

            # Apply pagination
            query = query.range(offset, offset + limit - 1)

            result = await asyncio.to_thread(lambda: query.execute())
            return result.data or []

        data = await get_or_set(cache_key, fetch_hazards, ttl=CACHE_TTLS.get("hazards:list", 15))

        # Log activity (for authenticated users) — runs on every request, cache hit or miss
        if user:
            await ActivityLogger.log_activity(
                user_context=user,
                action="VIEW_HAZARDS",
                request=request,
                resource_type="hazards",
                details={
                    "filters": {
                        "hazard_types": hazard_types,
                        "source_types": source_types,
                        "validated": validated,
                        "limit": limit,
                        "offset": offset
                    },
                    "results_count": len(data)
                }
            )

        return data

    except Exception as e:
        logger.error(f"Error fetching hazards: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch hazards: {str(e)}"
        )


@router.get("/stats", response_model=HazardStatsResponse)
async def get_hazard_stats(
    request: Request,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    _rate_limit: None = Depends(RateLimitDefault)  # PATCH-2: Redis rate limiting
):
    """
    Get hazard statistics

    Public endpoint with stricter rate limiting
    """
    try:
        cache_key = generate_cache_key("hazards:stats")

        async def fetch_stats():
            now = datetime.utcnow()

            # Run all independent queries concurrently.
            # The 3 aggregation columns (hazard_type, severity, source_type) are
            # fetched in a single scan instead of 3 separate full-table reads.
            (
                total_response,
                validated_response,
                aggregated_response,
                last_24h_response,
                last_7d_response,
                last_30d_response,
            ) = await asyncio.gather(
                asyncio.to_thread(
                    lambda: supabase.schema("gaia").from_("hazards").select("id", count="exact").execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema("gaia").from_("hazards").select("id", count="exact").eq("validated", True).execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema("gaia").from_("hazards").select("hazard_type,severity,source_type").execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema("gaia").from_("hazards").select("id", count="exact").gte("created_at", (now - timedelta(hours=24)).isoformat()).execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema("gaia").from_("hazards").select("id", count="exact").gte("created_at", (now - timedelta(days=7)).isoformat()).execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema("gaia").from_("hazards").select("id", count="exact").gte("created_at", (now - timedelta(days=30)).isoformat()).execute()
                ),
            )

            total = total_response.count or 0
            validated = validated_response.count or 0

            by_type: Dict[str, int] = {}
            by_severity: Dict[str, int] = {}
            by_source: Dict[str, int] = {}
            for item in (aggregated_response.data or []):
                htype = item.get("hazard_type") or "unknown"  # Handle None values
                by_type[htype] = by_type.get(htype, 0) + 1
                sev = item.get("severity") or "unassigned"  # Handle None values
                by_severity[sev] = by_severity.get(sev, 0) + 1
                src = item.get("source_type") or "unknown"  # Handle None values
                by_source[src] = by_source.get(src, 0) + 1

            return HazardStatsResponse(
                total_hazards=total,
                validated_hazards=validated,
                unvalidated_hazards=total - validated,
                by_type=by_type,
                by_severity=by_severity,
                by_source=by_source,
                last_24h=last_24h_response.count or 0,
                last_7d=last_7d_response.count or 0,
                last_30d=last_30d_response.count or 0,
            ).model_dump()

        data = await get_or_set(cache_key, fetch_stats, ttl=CACHE_TTLS.get("analytics:stats", 30))

        # Log activity
        if user:
            await ActivityLogger.log_activity(
                user_context=user,
                action="VIEW_HAZARD_STATS",
                request=request,
                resource_type="hazard_stats"
            )

        return data

    except Exception as e:
        logger.error(f"Error fetching hazard stats: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch statistics: {str(e)}"
        )


@router.get("/{hazard_id}", response_model=HazardResponse)
async def get_hazard_by_id(
    hazard_id: str,
    request: Request,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    _rate_limit: None = Depends(RateLimitHazardsRead)  # PATCH-2: Redis rate limiting
):
    """
    Get a single hazard by ID

    Public endpoint with rate limiting
    """
    try:
        cache_key = generate_cache_key("hazards:detail", hazard_id)

        async def fetch_hazard():
            response = await asyncio.to_thread(
                lambda: supabase.schema("gaia").from_("hazards").select("*").eq("id", hazard_id).execute()
            )
            if not response.data or len(response.data) == 0:
                return None
            return response.data[0]

        data = await get_or_set(cache_key, fetch_hazard, ttl=CACHE_TTLS.get("hazards:detail", 30))

        if data is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hazard not found: {hazard_id}"
            )

        # Log activity
        if user:
            await ActivityLogger.log_activity(
                user_context=user,
                action="VIEW_HAZARD_DETAIL",
                request=request,
                resource_type="hazard",
                resource_id=hazard_id
            )

        return data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hazard {hazard_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch hazard: {str(e)}"
        )


async def validate_philippine_coordinates(lat: float, lon: float) -> bool:
    """
    Validate that coordinates fall within Philippine administrative boundaries
    using a PostGIS ST_Contains check against the gaia.admin_boundaries table.

    Requires DB function: is_within_philippines(lat float, lon float) -> boolean

    Returns:
        True  — coordinate is inside the Philippines.
        False — coordinate is outside the Philippines (DB returned falsy result).

    Raises:
        Exception: Re-raises RPC/database/connection errors so the caller can
                   surface HTTP 503 rather than masking a service outage as a
                   boundary-validation failure (which would produce a misleading 400).
    """
    try:
        response = await asyncio.to_thread(
            lambda: supabase.schema("gaia").rpc(
                "is_within_philippines",
                {"lat": lat, "lon": lon}
            ).execute()
        )
        return bool(response.data)
    except Exception:
        logger.error(
            "PostGIS coordinate validation service error (lat=%.6f, lon=%.6f)",
            lat, lon,
            exc_info=True,
        )
        raise


@router.get("/nearby/{latitude}/{longitude}", response_model=List[HazardResponse])
async def get_nearby_hazards(
    latitude: float,
    longitude: float,
    request: Request,
    radius_km: float = Query(50.0, ge=1.0, le=500.0, description="Search radius in kilometers"),
    limit: int = Query(20, ge=1, le=100),
    user: Optional[UserContext] = Depends(get_current_user_optional),
    _rate_limit: None = Depends(RateLimitHazardsNearby)  # PATCH-2: Redis rate limiting
):
    """
    Get hazards near a location using PostGIS spatial query

    Public endpoint with stricter rate limiting
    """
    try:
        # Validate coordinates fall within Philippine administrative boundaries
        # using PostGIS ST_Contains on gaia.admin_boundaries.
        # Service errors are re-raised by the helper and mapped to 503 here;
        # a False return means the point is genuinely outside the Philippines (400).
        try:
            within_ph = await validate_philippine_coordinates(latitude, longitude)
        except Exception as validation_err:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Coordinate validation service is temporarily unavailable",
            ) from validation_err
        if not within_ph:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Coordinates are outside Philippine administrative boundaries"
            )

        cache_key = generate_cache_key(
            "hazards:nearby",
            lat=latitude,
            lon=longitude,
            radius_km=radius_km,
            limit=limit,
        )

        async def fetch_nearby():
            # Use PostGIS function (must be created in database)
            # This assumes you have a function: get_nearby_hazards(lat, lon, radius_km, limit)
            response = await asyncio.to_thread(
                lambda: supabase.schema("gaia").rpc(
                    "get_nearby_hazards",
                    {
                        "lat": latitude,
                        "lon": longitude,
                        "radius_km": radius_km,
                        "max_results": limit
                    }
                ).execute()
            )
            return response.data or []

        data = await get_or_set(cache_key, fetch_nearby, ttl=CACHE_TTLS.get("hazards:nearby", 10))

        # Log activity
        if user:
            await ActivityLogger.log_activity(
                user_context=user,
                action="SEARCH_NEARBY_HAZARDS",
                request=request,
                resource_type="hazards",
                details={
                    "latitude": latitude,
                    "longitude": longitude,
                    "radius_km": radius_km,
                    "results_count": len(data)
                }
            )

        return data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching nearby hazards: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch nearby hazards: {str(e)}"
        )
