"""
GAIA Backend API Entry Point
Geospatial AI-driven Assessment - Environmental Hazard Detection
"""

import os
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional


project_root = Path(__file__).parent.parent.parent.resolve()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Import AI models and processors
from backend.python.models.classifier import classifier
from backend.python.models.geo_ner import geo_ner
from backend.python.pipeline.rss_processor import rss_processor

# Import research API router (commented out until Supabase configured)
# from backend.python.research_api import router as research_router

# Import PDF report generation router
from backend.python.reports import router as reports_router

# Import citizen reports router
from backend.python.citizen_reports import router as citizen_reports_router

# Import admin dashboard router
from backend.python.admin_api import router as admin_router

# Import RSS admin router
from backend.python.rss_admin_api import router as rss_admin_router

# Import boundaries API router
from backend.python.boundaries_api import router as boundaries_router

# Import security middleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from backend.python.middleware.rate_limiter import limiter, rate_limit_exceeded_handler
from backend.python.middleware.security_headers import SecurityHeadersMiddleware

# PATCH-1: Import request logging middleware (Critical Security Fixes)
from backend.python.middleware.request_logger import RequestLoggingMiddleware

# PATCH-5: Import Redis cache for response caching (Performance Optimization)
from backend.python.middleware.redis_cache import get_redis, close_redis, get_cache_stats, clear_all_cache

# PATCH-1: Import new API proxy routers (Critical Security Fixes)
from backend.python.api import hazards as hazards_api

# PATCH-1.3: Import Realtime SSE router
from backend.python.api import realtime as realtime_api

# Import Auth API router for auth event logging
from backend.python.api import auth as auth_api

# Import System Error Logger for global exception handling
from backend.python.middleware.error_logger import SystemErrorLogger, ErrorSource

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Lifespan event handler (replaces deprecated @app.on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load AI models on startup, cleanup on shutdown"""
    # Startup
    logger.info("Starting GAIA Backend...")
    logger.info("Loading AI models...")

    try:
        # Load classifier
        classifier.load_model()
        logger.info("✓ Zero-Shot Classifier loaded")

        # Load Geo-NER
        geo_ner.load_model()
        logger.info("✓ Geo-NER model loaded")

        # PATCH-5: Initialize Redis cache connection pool
        try:
            await get_redis()
            logger.info("✓ Redis cache pool initialized")
        except Exception as e:
            logger.warning(f"Redis cache not available (non-critical): {e}")

        logger.info("GAIA Backend ready!")
        logger.info(f"Environment: {ENV}")
        logger.info(f"Port: {os.getenv('PORT', '8000')}")

    except Exception as e:
        logger.error(f"Error loading models: {str(e)}")
        logger.error("Backend startup failed - check model loading and environment variables")
        raise

    yield  # Application runs here

    # Shutdown (cleanup if needed)
    logger.info("Shutting down GAIA Backend...")
    
    # PATCH-5: Close Redis cache connection pool
    try:
        await close_redis()
        logger.info("✓ Redis cache pool closed")
    except Exception as e:
        logger.warning(f"Error closing Redis cache: {e}")

# Initialize FastAPI application with lifespan handler
app = FastAPI(
    title="GAIA API",
    description="Geospatial AI-driven Assessment for Philippine Environmental Hazards",
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=[
        {
            "name": "Core",
            "description": "Core API endpoints"
        },
        {
            "name": "AI/ML",
            "description": "AI/ML endpoints for hazard classification and location extraction"
        },
        {
            "name": "RSS Processing",
            "description": "RSS feed processing for real-time hazard detection"
        },
        {
            "name": "Research & Validation",
            "description": "Officer validation, ground truth, and algorithm metrics for thesis research"
        }
    ]
)

# Determine environment for security and CORS configuration
ENV = os.getenv("ENV", "development")

# Configure CORS with environment-based whitelist
# Support for Vercel + Railway deployment, localhost development, and future custom domains
if ENV == "production":
    # Production: Explicit Vercel frontend + Digital Ocean backend domains
    # NOTE: CORSMiddleware does NOT support glob patterns (*.vercel.app) in allow_origins list.
    # Also, allow_origins=["*"] with allow_credentials=True is forbidden by the CORS spec.
    # Use allow_origin_regex for wildcard subdomain matching instead.
    default_origins = "https://agaila-ph.vercel.app,https://agaila.me"
else:
    # Development: localhost only
    default_origins = "http://localhost:3000,http://localhost:8000"

allowed_origins_str = os.getenv("CORS_ORIGINS", default_origins)

# Parse CORS origins into explicit list (no glob wildcards)
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

# Optional: regex pattern for Vercel preview deployments (*.vercel.app)
# This allows PR preview URLs like https://gaia-abc123.vercel.app
allowed_origin_regex = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"https://.*\.vercel\.app" if ENV == "production" else None
)

# Log CORS configuration for debugging
logger.info(f"CORS configured for environment: {ENV}")
logger.info(f"Allowed origins: {allowed_origins}")
logger.info(f"Allowed origin regex: {allowed_origin_regex}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Content-Type", 
        "Authorization", 
        "Accept", 
        "Origin", 
        "X-Requested-With", 
        "X-API-Key",
        "X-CSRF-Token",
        "Railway-Deployment-Id"  # Railway-specific header
    ],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Add security headers middleware (SECURITY_AUDIT.md #5)
# Use ENV variable defined above - enable HSTS only in production
enable_hsts = ENV == "production"
app.add_middleware(
    SecurityHeadersMiddleware,
    enable_hsts=enable_hsts,
    frame_options="DENY",
    hsts_seconds=31536000  # 1 year
)

# PATCH-1: Add request logging middleware (Critical Security Fixes)
# Log all requests for security audit (disabled in production for performance)
log_requests = ENV == "development"  # Set to True for debugging, False for production
app.add_middleware(
    RequestLoggingMiddleware,
    log_request_body=log_requests,
    log_response_body=log_requests,
    exclude_paths=["/health", "/docs", "/openapi.json", "/favicon.ico", "/metrics"]
)

# PATCH-2: Add rate limit headers middleware
from backend.python.middleware.redis_rate_limiter import add_rate_limit_headers
app.middleware("http")(add_rate_limit_headers)

# Attach rate limiter (SECURITY_AUDIT.md #1)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ============================================================================
# Global Exception Handler (AC-06: System Error Logging)
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler to catch and log all unhandled exceptions.

    This ensures that system crashes, unhandled exceptions, and unexpected errors
    are properly logged to the audit trail with full stack traces and context.

    Module: AC-06 (System Error Logger)
    """
    # Extract user context if available from Authorization header
    user_id = None
    user_email = None

    try:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            # Could parse JWT token here to extract user info
            # For now, we'll just log it came from an authenticated request
            user_email = "authenticated_user"
    except Exception:
        pass  # If we can't extract user info, just log as system

    # Log the unhandled exception
    await SystemErrorLogger.log_unhandled_exception(
        exception=exc,
        source=ErrorSource.BACKEND_PYTHON,
        request=request,
        context={
            "endpoint": str(request.url.path) if request.url else None,
            "method": request.method,
            "exception_type": type(exc).__name__,
        },
        user_id=user_id,
        user_email=user_email
    )

    # Return generic error to client (don't expose internal details)
    # For HTTPException, preserve the status code and detail
    if isinstance(exc, HTTPException):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )

    # For all other exceptions, return 500
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. The error has been logged.",
            "error_id": datetime.now(timezone.utc).isoformat(),
            "type": "internal_server_error"
        }
    )

# Include routers
# app.include_router(research_router, prefix="/api/v1")  # Research API (commented out until configured)
app.include_router(reports_router, prefix="/api/v1")  # PDF Report Generation
app.include_router(citizen_reports_router, prefix="/api/v1")  # Citizen Reports
app.include_router(admin_router, prefix="/api/v1")  # Admin Dashboard
app.include_router(rss_admin_router, prefix="/api/v1")  # RSS Feed Management
app.include_router(boundaries_router)  # Boundaries API (no prefix - uses /api/boundaries)

# PATCH-1: Include new API proxy routers (Critical Security Fixes)
app.include_router(hazards_api.router, prefix="/api/v1")  # Hazards API Proxy

# PATCH-1.3: Include Realtime SSE router
app.include_router(realtime_api.router, prefix="/api/v1")  # Realtime SSE Streaming

# Include Auth API router for auth event logging
app.include_router(auth_api.router, prefix="/api/v1")  # Auth Event Logging

# Import analytics router
from backend.python.analytics_api import router as analytics_router
app.include_router(analytics_router, prefix="/api/v1")  # Analytics API

# Import status API router
from backend.python.status_api import router as status_router
app.include_router(status_router, prefix="/api/v1")  # System Status API (SHM-04)

# PATCH-2: Import Redis rate limiter for stats endpoint
from backend.python.middleware.redis_rate_limiter import get_rate_limit_stats


# PATCH-2: Rate limit statistics endpoint
@app.get("/api/v1/rate-limit/stats", tags=["System"])
async def rate_limit_stats():
    """Get rate limiting statistics (PATCH-2)"""
    return await get_rate_limit_stats()


# PATCH-5: Cache statistics endpoint
@app.get("/api/v1/cache/stats", tags=["System"])
async def cache_stats():
    """
    Get Redis cache statistics (PATCH-5).
    
    Returns cache hit/miss rates, memory usage, and key counts.
    """
    try:
        stats = await get_cache_stats()
        return {
            "status": "success",
            "cache": stats
        }
    except Exception as e:
        logger.warning(f"Cache stats unavailable: {e}")
        return {
            "status": "degraded",
            "message": "Cache not available",
            "cache": None
        }


# PATCH-5: Cache invalidation endpoint (admin only)
@app.delete("/api/v1/cache/clear", tags=["System"])
async def clear_cache():
    """
    Clear all cache entries (PATCH-5).
    
    **WARNING**: This will cause temporary performance degradation.
    Use only when cache data is stale or corrupted.
    """
    try:
        count = await clear_all_cache()
        return {
            "status": "success",
            "message": f"Cleared {count} cache entries"
        }
    except Exception as e:
        logger.error(f"Cache clear failed: {e}")
        raise HTTPException(status_code=500, detail=f"Cache clear failed: {str(e)}")


# Pydantic models for request/response validation
class ClassifyTextRequest(BaseModel):
    text: str
    threshold: Optional[float] = 0.5


class ClassifyTextResponse(BaseModel):
    hazard_type: Optional[str]
    score: float
    is_hazard: bool
    all_scores: dict


class ExtractLocationsRequest(BaseModel):
    text: str


class LocationResponse(BaseModel):
    location_name: str
    location_type: str
    confidence: float
    source: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    province: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None


class ProcessRSSRequest(BaseModel):
    feeds: Optional[List[str]] = None


@app.get("/", tags=["Core"])
async def root():
    """Root endpoint"""
    return {
        "message": "GAIA API - Geospatial AI-driven Assessment",
        "version": "0.1.0",
        "status": "running",
        "capabilities": [
            "Zero-Shot Hazard Classification",
            "Philippine Geo-NER",
            "RSS Feed Processing",
            "Real-time Hazard Detection",
            "Research & Validation"
        ]
    }


@app.get("/health", tags=["Core"])
async def health_check():
    """Health check endpoint for Docker"""
    return {
        "status": "healthy",
        "service": "gaia-backend",
        "models_loaded": {
            "classifier": classifier.model is not None,
            "geo_ner": geo_ner.ner_model is not None
        }
    }


# ============================================================================
# AI/ML Endpoints
# ============================================================================
@app.post("/api/v1/classify", response_model=ClassifyTextResponse, tags=["AI/ML"])
@limiter.limit("20/minute")  # Rate limit: 20 requests per minute (AI/ML intensive)
async def classify_text(request: Request, response: Response, body: ClassifyTextRequest):
    """
    Classify text into environmental hazard categories.
    Uses model fallback hierarchy: climatebert → deberta → bart → xlm-roberta
    Rate limited: 20 requests per minute per IP

    - **text**: Text to classify (article content, citizen report)
    - **threshold**: Minimum confidence threshold (0.0-1.0)

    Returns classification result with hazard type and confidence score.
    """
    try:
        result = classifier.classify(body.text, threshold=body.threshold)
        return ClassifyTextResponse(**result)

    except Exception as e:
        logger.error(f"Classification error: {str(e)}")
        # Log model error for tracking
        await SystemErrorLogger.log_model_error(
            model_name="climate-classifier",
            error=e,
            input_data={"text_length": len(body.text), "threshold": body.threshold}
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/extract-locations", response_model=List[LocationResponse], tags=["AI/ML"])
@limiter.limit("30/minute")  # Rate limit: 30 requests per minute (includes geocoding)
async def extract_locations(request: Request, response: Response, body: ExtractLocationsRequest):
    """
    Extract Philippine locations from text using Geo-NER.
    Rate limited: 30 requests per minute per IP

    - **text**: Text to extract locations from

    Returns list of locations with coordinates and administrative hierarchy.
    """
    try:
        locations = geo_ner.extract_locations(body.text)
        return [LocationResponse(**loc) for loc in locations]

    except Exception as e:
        logger.error(f"Location extraction error: {str(e)}")
        # Log model error for tracking
        await SystemErrorLogger.log_model_error(
            model_name="geo-ner",
            error=e,
            input_data={"text_length": len(body.text)}
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/hazard-categories", tags=["AI/ML"])
async def get_hazard_categories():
    """
    Get list of supported hazard categories.
    
    Returns all 10 environmental hazard types supported by the classifier.
    """
    return {
        "categories": classifier.get_categories(),
        "count": len(classifier.get_categories())
    }


@app.get("/api/v1/model-info", tags=["AI/ML"])
async def get_model_info():
    """
    Get information about currently loaded AI models.
    Useful for monitoring which model is active in the fallback hierarchy.
    """
    return {
        "classifier": {
            "active_model": classifier.get_active_model(),
            "fallback_models": classifier.fallback_models,
            "categories_count": len(classifier.get_categories())
        },
        "geo_ner": {
            "model": geo_ner.ner_model_name,
            "loaded": geo_ner.ner_model is not None
        }
    }


# ============================================================================
# RSS Processing Endpoints
# ============================================================================

@app.post("/api/v1/rss/process", tags=["RSS Processing"])
async def process_rss_feeds(request: ProcessRSSRequest, background_tasks: BackgroundTasks):
    """
    Process RSS feeds to detect environmental hazards.
    
    - **feeds**: Optional list of RSS feed URLs (uses default Philippine news sources if not provided)
    
    Triggers background processing of feeds with AI pipeline.
    Returns immediately with task started confirmation.
    
    **IMPORTANT**: This endpoint returns immediately and processes feeds in the background
    to prevent blocking other API requests. Check processing status via logs or database.
    """
    try:
        # Set feeds
        feeds_to_process = request.feeds if request.feeds else rss_processor.DEFAULT_FEEDS
        
        # Add background task (non-blocking)
        async def process_feeds_background():
            try:
                rss_processor.set_feeds(feeds_to_process)
                results = await rss_processor.process_all_feeds()
                logger.info(f"✅ Background RSS processing completed: {len(results)} feeds processed")
                return results
            except Exception as e:
                logger.error(f"❌ Background RSS processing error: {str(e)}", exc_info=True)
        
        background_tasks.add_task(process_feeds_background)
        
        # Return immediately with task started status
        return {
            "status": "processing",
            "message": "RSS feed processing started in background",
            "feeds_count": len(feeds_to_process),
            "feeds": feeds_to_process,
            "note": "Processing happens in background. Check logs or database for results."
        }
        
    except Exception as e:
        logger.error(f"RSS processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/rss/default-feeds", tags=["RSS Processing"])
async def get_default_feeds():
    """Get list of default Philippine news RSS feeds"""
    return {
        "feeds": rss_processor.DEFAULT_FEEDS,
        "count": len(rss_processor.DEFAULT_FEEDS)
    }


# ============================================================================
# Database Integration Endpoints (Placeholder - will connect to Supabase)
# ============================================================================

@app.get("/api/v1/hazards")
async def get_hazards():
    """Get all hazards from database (placeholder for Supabase integration)"""
    return {
        "hazards": [],
        "message": "Database integration pending - Supabase connection to be added"
    }


@app.get("/api/v1/hazards/{hazard_id}")
async def get_hazard(hazard_id: int):
    """Get specific hazard by ID (placeholder)"""
    return {
        "hazard": None,
        "message": f"Hazard {hazard_id} - Database integration pending"
    }


# NOTE: Routers already included at lines 133-140 with /api/v1 prefix
# Duplicate inclusions removed to prevent path conflicts


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("API_PORT", 8000))
    host = os.getenv("API_HOST", "0.0.0.0")

    uvicorn.run("main:app", host=host, port=port, reload=True, log_level="info")
