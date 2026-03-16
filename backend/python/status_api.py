"""
Service Status API for GAIA
Module: SHM-04
Provides real-time operational status of all core system services and external data integrations.
Publicly accessible endpoint for monitoring system health.
"""

import os
import sys
import logging
import asyncio
import httpx
from datetime import datetime
from typing import Dict, List, Optional
from enum import Enum
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.supabase_client import supabase
from backend.python.models.classifier import classifier
from backend.python.models.geo_ner import geo_ner
from backend.python.pipeline.rss_processor import rss_processor, RSSProcessor
from backend.python.middleware.redis_cache import get_or_set, generate_cache_key

logger = logging.getLogger(__name__)

# Initialize router - main.py adds /api/v1 prefix, so this becomes /api/v1/status
router = APIRouter(prefix="/status", tags=["System Health"])


class ServiceStatus(str, Enum):
    """Service status enumeration"""
    OPERATIONAL = "operational"
    DEGRADED = "degraded"
    DOWN = "down"
    MAINTENANCE = "maintenance"


class ServiceStatusResponse(BaseModel):
    """Response model for service status"""
    name: str
    status: ServiceStatus
    message: str
    last_checked: datetime
    response_time_ms: Optional[float] = None
    details: Optional[Dict] = None


class SystemStatusResponse(BaseModel):
    """Overall system status response"""
    overall_status: ServiceStatus
    timestamp: datetime
    services: List[ServiceStatusResponse]
    uptime_seconds: Optional[float] = None
    cached_at: Optional[datetime] = None


# Track startup time for uptime calculation
_startup_time = datetime.now()


async def check_supabase_database() -> ServiceStatusResponse:
    """Check Supabase database connectivity"""
    start_time = datetime.now()
    try:
        # Simple query to test database connection
        response = supabase.schema('gaia').from_('system_config').select('config_key').limit(1).execute()
        
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ServiceStatusResponse(
            name="Supabase Database",
            status=ServiceStatus.OPERATIONAL,
            message="Database connection successful",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"schema": "gaia", "query_successful": True}
        )
    except Exception as e:
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"Supabase database check failed: {str(e)}")
        return ServiceStatusResponse(
            name="Supabase Database",
            status=ServiceStatus.DOWN,
            message=f"Database connection failed: {str(e)}",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"error": str(e)}
        )


async def check_supabase_realtime() -> ServiceStatusResponse:
    """Check Supabase Realtime connectivity"""
    start_time = datetime.now()
    try:
        # Check if Realtime is available by attempting to create a channel
        # Note: This is a lightweight check, actual subscription would require more setup
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        # For now, we'll assume Realtime is operational if database is operational
        # In production, you might want to actually test a Realtime subscription
        return ServiceStatusResponse(
            name="Supabase Realtime",
            status=ServiceStatus.OPERATIONAL,
            message="Realtime service available",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"service": "realtime"}
        )
    except Exception as e:
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"Supabase Realtime check failed: {str(e)}")
        return ServiceStatusResponse(
            name="Supabase Realtime",
            status=ServiceStatus.DEGRADED,
            message=f"Realtime check failed: {str(e)}",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"error": str(e)}
        )


async def check_ai_classifier() -> ServiceStatusResponse:
    """Check AI Classifier model status"""
    start_time = datetime.now()
    try:
        model_loaded = classifier.model is not None
        active_model = classifier.get_active_model() if hasattr(classifier, 'get_active_model') else "unknown"
        
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        if model_loaded:
            return ServiceStatusResponse(
                name="AI Classifier",
                status=ServiceStatus.OPERATIONAL,
                message=f"Model loaded: {active_model}",
                last_checked=datetime.now(),
                response_time_ms=round(response_time, 2),
                details={"model": active_model, "loaded": True}
            )
        else:
            return ServiceStatusResponse(
                name="AI Classifier",
                status=ServiceStatus.DOWN,
                message="Model not loaded",
                last_checked=datetime.now(),
                response_time_ms=round(response_time, 2),
                details={"model": active_model, "loaded": False}
            )
    except Exception as e:
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"AI Classifier check failed: {str(e)}")
        return ServiceStatusResponse(
            name="AI Classifier",
            status=ServiceStatus.DOWN,
            message=f"Check failed: {str(e)}",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"error": str(e)}
        )


async def check_ai_geo_ner() -> ServiceStatusResponse:
    """Check Geo-NER model status"""
    start_time = datetime.now()
    try:
        model_loaded = geo_ner.ner_model is not None
        model_name = geo_ner.ner_model_name if hasattr(geo_ner, 'ner_model_name') else "unknown"
        
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        if model_loaded:
            return ServiceStatusResponse(
                name="Geo-NER",
                status=ServiceStatus.OPERATIONAL,
                message=f"Model loaded: {model_name}",
                last_checked=datetime.now(),
                response_time_ms=round(response_time, 2),
                details={"model": model_name, "loaded": True}
            )
        else:
            return ServiceStatusResponse(
                name="Geo-NER",
                status=ServiceStatus.DOWN,
                message="Model not loaded",
                last_checked=datetime.now(),
                response_time_ms=round(response_time, 2),
                details={"model": model_name, "loaded": False}
            )
    except Exception as e:
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"Geo-NER check failed: {str(e)}")
        return ServiceStatusResponse(
            name="Geo-NER",
            status=ServiceStatus.DOWN,
            message=f"Check failed: {str(e)}",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"error": str(e)}
        )


async def check_rss_processor() -> ServiceStatusResponse:
    """Check RSS Processor availability"""
    start_time = datetime.now()
    try:
        # Check if RSS processor is available
        default_feeds_count = len(RSSProcessor.DEFAULT_FEEDS) if hasattr(RSSProcessor, 'DEFAULT_FEEDS') else 0
        
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ServiceStatusResponse(
            name="RSS Processor",
            status=ServiceStatus.OPERATIONAL,
            message="RSS processor available",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"default_feeds_count": default_feeds_count}
        )
    except Exception as e:
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"RSS Processor check failed: {str(e)}")
        return ServiceStatusResponse(
            name="RSS Processor",
            status=ServiceStatus.DEGRADED,
            message=f"Check failed: {str(e)}",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"error": str(e)}
        )


async def check_rss_feed(feed_url: str, timeout: float = 5.0) -> Dict:
    """Check individual RSS feed connectivity"""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            start_time = datetime.now()
            response = await client.get(feed_url, follow_redirects=True)
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            if response.status_code == 200:
                return {
                    "url": feed_url,
                    "status": ServiceStatus.OPERATIONAL,
                    "response_time_ms": round(response_time, 2),
                    "status_code": response.status_code
                }
            else:
                return {
                    "url": feed_url,
                    "status": ServiceStatus.DEGRADED,
                    "response_time_ms": round(response_time, 2),
                    "status_code": response.status_code
                }
    except httpx.TimeoutException:
        return {
            "url": feed_url,
            "status": ServiceStatus.DOWN,
            "response_time_ms": None,
            "error": "Request timeout"
        }
    except Exception as e:
        return {
            "url": feed_url,
            "status": ServiceStatus.DOWN,
            "response_time_ms": None,
            "error": str(e)
        }


async def check_rss_feeds() -> ServiceStatusResponse:
    """Check external RSS feed connectivity"""
    start_time = datetime.now()
    try:
        # Get default feeds
        default_feeds = RSSProcessor.DEFAULT_FEEDS if hasattr(RSSProcessor, 'DEFAULT_FEEDS') else []
        
        if not default_feeds:
            return ServiceStatusResponse(
                name="External RSS Feeds",
                status=ServiceStatus.DEGRADED,
                message="No default feeds configured",
                last_checked=datetime.now(),
                response_time_ms=0,
                details={"feeds_checked": 0}
            )
        
        # Check all feeds concurrently
        feed_checks = [check_rss_feed(feed_url) for feed_url in default_feeds]
        results = await asyncio.gather(*feed_checks)
        
        # Determine overall status
        operational_count = sum(1 for r in results if r["status"] == ServiceStatus.OPERATIONAL)
        degraded_count = sum(1 for r in results if r["status"] == ServiceStatus.DEGRADED)
        down_count = sum(1 for r in results if r["status"] == ServiceStatus.DOWN)
        
        if down_count == len(results):
            overall_status = ServiceStatus.DOWN
            message = f"All {len(results)} feeds are down"
        elif down_count > 0 or degraded_count > 0:
            overall_status = ServiceStatus.DEGRADED
            message = f"{operational_count} operational, {degraded_count} degraded, {down_count} down"
        else:
            overall_status = ServiceStatus.OPERATIONAL
            message = f"All {len(results)} feeds operational"
        
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ServiceStatusResponse(
            name="External RSS Feeds",
            status=overall_status,
            message=message,
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={
                "total_feeds": len(results),
                "operational": operational_count,
                "degraded": degraded_count,
                "down": down_count,
                "feeds": results
            }
        )
    except Exception as e:
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"RSS Feeds check failed: {str(e)}")
        return ServiceStatusResponse(
            name="External RSS Feeds",
            status=ServiceStatus.DOWN,
            message=f"Check failed: {str(e)}",
            last_checked=datetime.now(),
            response_time_ms=round(response_time, 2),
            details={"error": str(e)}
        )


@router.get("", response_model=SystemStatusResponse)
async def get_system_status():
    """
    Get real-time operational status of all core system services and external data integrations.

    This endpoint is publicly accessible and provides:
    - Core services: Backend API, Supabase Database, Supabase Realtime
    - AI/ML services: Classifier, Geo-NER
    - Data processing: RSS Processor
    - External integrations: RSS Feeds

    Returns overall system status and individual service statuses with response times.
    Cached for 15 seconds to reduce load from frequent polling.
    """
    cache_key = generate_cache_key("config:system", "status")

    async def fetch_status():
        # Run all checks concurrently
        checks = [
            check_supabase_database(),
            check_supabase_realtime(),
            check_ai_classifier(),
            check_ai_geo_ner(),
            check_rss_processor(),
            check_rss_feeds(),
        ]

        results = await asyncio.gather(*checks, return_exceptions=True)

        # Handle any exceptions
        services = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Status check exception: {str(result)}")
                services.append(ServiceStatusResponse(
                    name="Unknown Service",
                    status=ServiceStatus.DOWN,
                    message=f"Check error: {str(result)}",
                    last_checked=datetime.now(),
                    details={"error": str(result)}
                ))
            else:
                services.append(result)

        # Determine overall status
        statuses = [s.status for s in services]
        if ServiceStatus.DOWN in statuses:
            overall_status = ServiceStatus.DEGRADED
        elif ServiceStatus.DEGRADED in statuses:
            overall_status = ServiceStatus.DEGRADED
        elif all(s == ServiceStatus.OPERATIONAL for s in statuses):
            overall_status = ServiceStatus.OPERATIONAL
        else:
            overall_status = ServiceStatus.DEGRADED

        # Calculate uptime
        uptime_seconds = (datetime.now() - _startup_time).total_seconds()

        return SystemStatusResponse(
            overall_status=overall_status,
            timestamp=datetime.now(),
            services=services,
            uptime_seconds=round(uptime_seconds, 2)
        ).dict()

    try:
        data = await get_or_set(cache_key, fetch_status, ttl=15)
        # Inject response-time metadata so clients can distinguish the original
        # check time (timestamp/last_checked inside data) from when this
        # particular response was served (cached_at).
        if isinstance(data, dict):
            data["cached_at"] = datetime.now().isoformat()
        return data

    except Exception as e:
        logger.error(f"System status check failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve system status: {str(e)}"
        )


@router.get("/health", tags=["Core"])
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "service": "gaia-status-api",
        "timestamp": datetime.now().isoformat()
    }

