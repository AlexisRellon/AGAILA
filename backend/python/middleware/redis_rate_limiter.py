"""
Redis Rate Limiting - PATCH 2
Enhanced rate limiting with Redis backend for distributed deployments.

Security: CIA Compliance
- Availability: Protects against DoS via per-IP and per-user limits
- Integrity: Prevents abuse of data modification endpoints
- Confidentiality: Rate limits prevent data scraping

Architecture:
- Redis backend for distributed rate limit tracking
- Tiered limits based on user role (anonymous, authenticated, admin)
- Endpoint-specific limits for resource-intensive operations
- Graceful fallback to in-memory if Redis unavailable
"""

import os
import logging
import time
from typing import Optional, Callable, Dict, Any
from functools import wraps
from datetime import datetime, timedelta

from fastapi import Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse
from redis import Redis, ConnectionError as RedisConnectionError
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from backend.python.middleware.rbac import UserContext, get_current_user_optional

logger = logging.getLogger(__name__)


# ============================================================================
# Redis Connection
# ============================================================================

def get_redis_client() -> Optional[Redis]:
    """
    Get Redis client for rate limiting.
    Returns None if Redis is unavailable.
    """
    try:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/1")  # Use DB 1 for rate limiting
        client = Redis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        client.ping()  # Test connection
        return client
    except (RedisConnectionError, Exception) as e:
        logger.warning(f"Redis unavailable for rate limiting: {e}")
        return None


# Global Redis client (lazy initialization)
_redis_client: Optional[Redis] = None


def get_redis() -> Optional[Redis]:
    """Get or create Redis client singleton"""
    global _redis_client
    if _redis_client is None:
        _redis_client = get_redis_client()
    return _redis_client


# ============================================================================
# Rate Limit Configuration
# ============================================================================

class RateLimitTier:
    """Rate limit tiers based on user authentication status"""
    
    # Anonymous users (strictest limits)
    ANONYMOUS = {
        "default": (60, 60),          # 60 requests per minute
        "hazards_read": (100, 60),    # 100 reads per minute
        "hazards_nearby": (30, 60),   # 30 geospatial queries per minute
        "classify": (10, 60),         # 10 AI classifications per minute
        "extract_locations": (10, 60), # 10 NER extractions per minute
        "rss_process": (5, 60),       # 5 RSS processing per minute
        "citizen_report": (1, 300),    # 1 report per 5 minutes (prevent spam)
        "export": (2, 60),            # 2 exports per minute
        "sse_stream": (5, 300),       # 5 SSE connections per 5 minutes
    }
    
    # Authenticated users (relaxed limits)
    AUTHENTICATED = {
        "default": (120, 60),         # 120 requests per minute
        "hazards_read": (200, 60),    # 200 reads per minute
        "hazards_nearby": (60, 60),   # 60 geospatial queries per minute
        "classify": (30, 60),         # 30 AI classifications per minute
        "extract_locations": (30, 60), # 30 NER extractions per minute
        "rss_process": (20, 60),      # 20 RSS processing per minute
        "citizen_report": (1, 300),   # 1 report per 5 minutes
        "export": (10, 60),           # 10 exports per minute
        "sse_stream": (10, 300),      # 10 SSE connections per 5 minutes
    }
    
    # Admin/Validator users (highest limits)
    ADMIN = {
        "default": (300, 60),         # 300 requests per minute
        "hazards_read": (500, 60),    # 500 reads per minute
        "hazards_nearby": (100, 60),  # 100 geospatial queries per minute
        "classify": (100, 60),        # 100 AI classifications per minute
        "extract_locations": (100, 60), # 100 NER extractions per minute
        "rss_process": (60, 60),      # 60 RSS processing per minute
        "citizen_report": (1, 300),   # 1 report per 5 minutes
        "export": (30, 60),           # 30 exports per minute
        "sse_stream": (20, 300),      # 20 SSE connections per 5 minutes
    }
    
    @classmethod
    def get_limit(cls, user: Optional[UserContext], endpoint_type: str = "default") -> tuple:
        """
        Get rate limit for user and endpoint type.
        Returns (max_requests, window_seconds)
        """
        if user is None:
            tier = cls.ANONYMOUS
        elif user.role in ("master_admin", "validator"):
            tier = cls.ADMIN
        else:
            tier = cls.AUTHENTICATED
        
        return tier.get(endpoint_type, tier["default"])


# ============================================================================
# Redis Rate Limiter
# ============================================================================

class RedisRateLimiter:
    """
    Redis-backed rate limiter with sliding window algorithm.
    
    Features:
    - Distributed rate limiting across multiple backend instances
    - Sliding window for smoother rate limiting
    - Tiered limits based on user role
    - Graceful degradation if Redis unavailable
    """
    
    def __init__(self, redis_client: Optional[Redis] = None):
        self.redis = redis_client or get_redis()
        self._fallback_counts: Dict[str, list] = {}  # In-memory fallback
    
    def _get_key(self, identifier: str, endpoint_type: str) -> str:
        """Generate Redis key for rate limit tracking"""
        return f"ratelimit:{endpoint_type}:{identifier}"
    
    def _sliding_window_check(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> tuple[bool, int, int]:
        """
        Check rate limit using sliding window algorithm.
        
        Returns:
            (allowed, remaining, reset_time)
        """
        now = time.time()
        window_start = now - window_seconds
        
        if self.redis:
            try:
                pipe = self.redis.pipeline()
                
                # Remove old entries outside window
                pipe.zremrangebyscore(key, 0, window_start)
                
                # Count requests in current window
                pipe.zcard(key)
                
                # Add current request
                pipe.zadd(key, {str(now): now})
                
                # Set key expiration
                pipe.expire(key, window_seconds + 1)
                
                results = pipe.execute()
                current_count = results[1]
                
                remaining = max(0, max_requests - current_count - 1)
                reset_time = int(now + window_seconds)
                
                if current_count >= max_requests:
                    # Remove the request we just added (rate limited)
                    self.redis.zrem(key, str(now))
                    return False, 0, reset_time
                
                return True, remaining, reset_time
                
            except RedisConnectionError as e:
                logger.warning(f"Redis error in rate limit check: {e}")
                return self._fallback_check(key, max_requests, window_seconds)
        else:
            return self._fallback_check(key, max_requests, window_seconds)
    
    def _fallback_check(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> tuple[bool, int, int]:
        """In-memory fallback when Redis is unavailable"""
        now = time.time()
        window_start = now - window_seconds
        
        # Clean old entries
        if key in self._fallback_counts:
            self._fallback_counts[key] = [
                t for t in self._fallback_counts[key] if t > window_start
            ]
        else:
            self._fallback_counts[key] = []
        
        current_count = len(self._fallback_counts[key])
        remaining = max(0, max_requests - current_count - 1)
        reset_time = int(now + window_seconds)
        
        if current_count >= max_requests:
            return False, 0, reset_time
        
        self._fallback_counts[key].append(now)
        return True, remaining, reset_time
    
    def check_rate_limit(
        self,
        request: Request,
        user: Optional[UserContext] = None,
        endpoint_type: str = "default"
    ) -> tuple[bool, Dict[str, Any]]:
        """
        Check if request is within rate limits.
        
        Returns:
            (allowed, headers_dict)
        """
        # Get identifier (user ID or IP)
        if user and user.user_id:
            identifier = f"user:{user.user_id}"
        else:
            forwarded = request.headers.get("X-Forwarded-For")
            ip = forwarded.split(",")[0].strip() if forwarded else (
                request.client.host if request.client else "unknown"
            )
            identifier = f"ip:{ip}"
        
        # Get rate limit for this user/endpoint
        max_requests, window_seconds = RateLimitTier.get_limit(user, endpoint_type)
        
        # Check rate limit
        key = self._get_key(identifier, endpoint_type)
        allowed, remaining, reset_time = self._sliding_window_check(
            key, max_requests, window_seconds
        )
        
        # Build response headers
        headers = {
            "X-RateLimit-Limit": str(max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(reset_time),
            "X-RateLimit-Window": str(window_seconds),
        }
        
        if not allowed:
            logger.warning(
                f"Rate limit exceeded: {identifier} on {endpoint_type} "
                f"({max_requests}/{window_seconds}s)"
            )
        
        return allowed, headers


# Global rate limiter instance
rate_limiter = RedisRateLimiter()


# ============================================================================
# FastAPI Dependency
# ============================================================================

def create_rate_limit_dependency(endpoint_type: str = "default"):
    """
    Create a FastAPI dependency for rate limiting.
    
    Usage:
        @router.get("/hazards")
        async def get_hazards(
            request: Request,
            _: None = Depends(create_rate_limit_dependency("hazards_read"))
        ):
            ...
    """
    async def rate_limit_check(
        request: Request,
        user: Optional[UserContext] = Depends(get_current_user_optional)
    ):
        allowed, headers = rate_limiter.check_rate_limit(request, user, endpoint_type)
        
        # Store headers for response middleware
        request.state.rate_limit_headers = headers
        
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests. Please try again later.",
                    "retry_after": int(headers["X-RateLimit-Reset"]) - int(time.time()),
                    "limit": headers["X-RateLimit-Limit"],
                    "window": headers["X-RateLimit-Window"],
                },
                headers=headers
            )
    
    return rate_limit_check


# Convenience dependencies for common endpoint types
RateLimitDefault = create_rate_limit_dependency("default")
RateLimitHazardsRead = create_rate_limit_dependency("hazards_read")
RateLimitHazardsNearby = create_rate_limit_dependency("hazards_nearby")
RateLimitClassify = create_rate_limit_dependency("classify")
RateLimitExtract = create_rate_limit_dependency("extract_locations")
RateLimitRSS = create_rate_limit_dependency("rss_process")
RateLimitCitizenReport = create_rate_limit_dependency("citizen_report")
RateLimitExport = create_rate_limit_dependency("export")
RateLimitSSE = create_rate_limit_dependency("sse_stream")


# ============================================================================
# Response Middleware for Headers
# ============================================================================

async def add_rate_limit_headers(request: Request, call_next):
    """
    Middleware to add rate limit headers to all responses.
    Must be added after rate limit check dependency runs.
    """
    response = await call_next(request)
    
    # Add rate limit headers if available
    if hasattr(request.state, "rate_limit_headers"):
        for key, value in request.state.rate_limit_headers.items():
            response.headers[key] = value
    
    return response


# ============================================================================
# Stats and Monitoring
# ============================================================================

async def get_rate_limit_stats() -> Dict[str, Any]:
    """Get rate limiting statistics for monitoring"""
    redis = get_redis()
    
    if redis:
        try:
            # Get all rate limit keys
            keys = redis.keys("ratelimit:*")
            
            stats = {
                "backend": "redis",
                "status": "healthy",
                "total_tracked_keys": len(keys),
                "sample_keys": keys[:10] if keys else [],
            }
            
            return stats
        except Exception as e:
            return {
                "backend": "redis",
                "status": "error",
                "error": str(e)
            }
    else:
        return {
            "backend": "memory",
            "status": "fallback",
            "warning": "Redis unavailable, using in-memory fallback"
        }
