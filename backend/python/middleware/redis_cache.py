"""
Redis Response Caching for High-Performance API
Security Focus: Availability (CIA Triad) - Fast response times

Implements intelligent caching for slow database queries:
- Analytics endpoints (stats, trends, regions, distribution)
- Activity logs
- Admin reports
- Hazard lists

Cache Strategies:
- TTL-based expiration
- Pattern-based invalidation
- Background refresh for hot data
- Compression for large payloads

Usage:
    from backend.python.middleware.redis_cache import cache_response, invalidate_pattern
    
    @cache_response(ttl=60, prefix="analytics")
    async def get_stats():
        return await expensive_query()
    
    # Invalidate when data changes
    await invalidate_pattern("analytics:*")
"""

import asyncio
import hashlib
import json
import logging
import os
import zlib
from datetime import datetime
from functools import wraps
from typing import Optional, Any, Callable, Union, List
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/2")  # DB 2 for caching
CACHE_PREFIX = "gaia:cache"
DEFAULT_TTL = 60  # 1 minute default
MAX_TTL = 3600  # 1 hour max
COMPRESSION_THRESHOLD = 1024  # Compress if > 1KB

# Cache TTLs for different data types (seconds)
CACHE_TTLS = {
    "analytics:stats": 30,        # Dashboard stats - refresh every 30s
    "analytics:trends": 120,      # Trend data - 2 minutes
    "analytics:regions": 180,     # Region data - 3 minutes (rarely changes)
    "analytics:distribution": 120, # Distribution - 2 minutes
    "analytics:alerts": 15,       # Recent alerts - 15 seconds
    "admin:activity": 30,         # Activity logs - 30 seconds
    "admin:audit": 60,            # Audit logs - 1 minute
    "admin:users": 60,            # User list - 1 minute
    "admin:triage": 30,           # Triage queue - 30 seconds
    "hazards:list": 15,           # Hazard list - 15 seconds (real-time important)
    "hazards:detail": 30,         # Single hazard - 30 seconds
    "hazards:nearby": 10,         # Nearby hazards - 10 seconds (location-sensitive)
    "rss:feeds": 60,              # RSS feeds - 1 minute
    "config:system": 300,         # System config - 5 minutes
}

# =============================================================================
# REDIS CONNECTION POOL
# =============================================================================

_redis_pool: Optional[aioredis.ConnectionPool] = None
_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    """
    Get Redis client with connection pooling.
    
    Returns:
        aioredis.Redis: Async Redis client
    """
    global _redis_pool, _redis_client
    
    if _redis_client is None:
        try:
            _redis_pool = aioredis.ConnectionPool.from_url(
                REDIS_URL,
                max_connections=20,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
            _redis_client = aioredis.Redis(connection_pool=_redis_pool)
            
            # Test connection
            await _redis_client.ping()
            logger.info(f"✓ Redis cache connected: {REDIS_URL}")
            
        except Exception as e:
            logger.error(f"Redis cache connection failed: {e}")
            _redis_client = None
            raise
    
    return _redis_client


async def close_redis():
    """Close Redis connection pool."""
    global _redis_pool, _redis_client
    
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
    
    if _redis_pool:
        await _redis_pool.disconnect()
        _redis_pool = None


# =============================================================================
# CACHE KEY GENERATION
# =============================================================================

def generate_cache_key(
    prefix: str,
    *args,
    **kwargs
) -> str:
    """
    Generate a unique cache key from prefix and arguments.
    
    Args:
        prefix: Cache key prefix (e.g., "analytics:stats")
        *args: Positional arguments to include in key
        **kwargs: Keyword arguments to include in key
        
    Returns:
        str: Unique cache key
    """
    # Build key components
    components = [CACHE_PREFIX, prefix]
    
    # Add positional args
    for arg in args:
        if arg is not None:
            components.append(str(arg))
    
    # Add sorted kwargs for deterministic keys
    for key in sorted(kwargs.keys()):
        value = kwargs[key]
        if value is not None:
            components.append(f"{key}={value}")
    
    # Join and hash if too long
    key = ":".join(components)
    
    if len(key) > 200:
        # Hash long keys
        hash_suffix = hashlib.md5(key.encode()).hexdigest()[:12]
        key = f"{CACHE_PREFIX}:{prefix}:{hash_suffix}"
    
    return key


# =============================================================================
# SERIALIZATION
# =============================================================================

def serialize_value(value: Any) -> str:
    """
    Serialize value for Redis storage with optional compression.
    
    Args:
        value: Any JSON-serializable value
        
    Returns:
        str: Serialized (and possibly compressed) value
    """
    json_str = json.dumps(value, default=str, separators=(',', ':'))
    
    # Compress large payloads
    if len(json_str) > COMPRESSION_THRESHOLD:
        compressed = zlib.compress(json_str.encode())
        # Prefix with 'Z:' to indicate compression
        return "Z:" + compressed.hex()
    
    return json_str


def deserialize_value(value: str) -> Any:
    """
    Deserialize value from Redis storage.
    
    Args:
        value: Serialized value from Redis
        
    Returns:
        Any: Deserialized Python object
    """
    if value.startswith("Z:"):
        # Decompress
        compressed = bytes.fromhex(value[2:])
        json_str = zlib.decompress(compressed).decode()
        return json.loads(json_str)
    
    return json.loads(value)


# =============================================================================
# CACHE OPERATIONS
# =============================================================================

async def get_cached(key: str) -> Optional[Any]:
    """
    Get value from cache.
    
    Args:
        key: Cache key
        
    Returns:
        Cached value or None if not found/expired
    """
    try:
        redis = await get_redis()
        value = await redis.get(key)
        
        if value:
            logger.debug(f"Cache HIT: {key}")
            return deserialize_value(value)
        
        logger.debug(f"Cache MISS: {key}")
        return None
        
    except Exception as e:
        logger.warning(f"Cache get error: {e}")
        return None


async def set_cached(
    key: str,
    value: Any,
    ttl: int = DEFAULT_TTL
) -> bool:
    """
    Set value in cache with TTL.
    
    Args:
        key: Cache key
        value: Value to cache
        ttl: Time-to-live in seconds
        
    Returns:
        bool: True if cached successfully
    """
    try:
        redis = await get_redis()
        serialized = serialize_value(value)
        
        await redis.setex(key, min(ttl, MAX_TTL), serialized)
        logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")
        return True
        
    except Exception as e:
        logger.warning(f"Cache set error: {e}")
        return False


async def delete_cached(key: str) -> bool:
    """
    Delete value from cache.
    
    Args:
        key: Cache key
        
    Returns:
        bool: True if deleted
    """
    try:
        redis = await get_redis()
        await redis.delete(key)
        logger.debug(f"Cache DELETE: {key}")
        return True
        
    except Exception as e:
        logger.warning(f"Cache delete error: {e}")
        return False


async def invalidate_pattern(pattern: str) -> int:
    """
    Invalidate all keys matching pattern.
    
    Args:
        pattern: Redis pattern (e.g., "analytics:*")
        
    Returns:
        int: Number of keys deleted
    """
    try:
        redis = await get_redis()
        full_pattern = f"{CACHE_PREFIX}:{pattern}"
        
        # Use SCAN for production-safe key iteration
        deleted = 0
        cursor = 0
        
        while True:
            cursor, keys = await redis.scan(cursor, match=full_pattern, count=100)
            
            if keys:
                await redis.delete(*keys)
                deleted += len(keys)
            
            if cursor == 0:
                break
        
        if deleted > 0:
            logger.info(f"Cache INVALIDATE: {pattern} ({deleted} keys)")
        
        return deleted
        
    except Exception as e:
        logger.warning(f"Cache invalidate error: {e}")
        return 0


# =============================================================================
# CACHE DECORATOR
# =============================================================================

def cache_response(
    ttl: Optional[int] = None,
    prefix: str = "api",
    key_builder: Optional[Callable] = None,
    condition: Optional[Callable] = None
):
    """
    Decorator to cache endpoint responses in Redis.
    
    Args:
        ttl: Cache TTL in seconds (uses CACHE_TTLS lookup if None)
        prefix: Cache key prefix
        key_builder: Custom function to build cache key
        condition: Function to determine if response should be cached
        
    Usage:
        @cache_response(prefix="analytics:stats")
        async def get_stats():
            return await expensive_query()
        
        @cache_response(ttl=60, prefix="hazards:list", 
                       key_builder=lambda **kw: f"page:{kw.get('page', 1)}")
        async def list_hazards(page: int = 1):
            return await db_query(page=page)
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                custom_key = key_builder(*args, **kwargs)
                cache_key = generate_cache_key(prefix, custom_key)
            else:
                cache_key = generate_cache_key(prefix, *args, **kwargs)
            
            # Try to get from cache
            cached = await get_cached(cache_key)
            if cached is not None:
                return cached
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Check condition before caching
            if condition and not condition(result):
                return result
            
            # Determine TTL
            cache_ttl = ttl
            if cache_ttl is None:
                cache_ttl = CACHE_TTLS.get(prefix, DEFAULT_TTL)
            
            # Cache result
            await set_cached(cache_key, result, cache_ttl)
            
            return result
        
        return wrapper
    return decorator


# =============================================================================
# CACHE-ASIDE HELPERS
# =============================================================================

async def get_or_set(
    key: str,
    fetch_func: Callable,
    ttl: int = DEFAULT_TTL
) -> Any:
    """
    Get from cache, or fetch and cache if missing.
    
    Args:
        key: Full cache key
        fetch_func: Async function to fetch data if cache miss
        ttl: Cache TTL
        
    Returns:
        Cached or freshly fetched data
    """
    # Try cache first
    cached = await get_cached(key)
    if cached is not None:
        return cached
    
    # Fetch fresh data
    data = await fetch_func()
    
    # Cache for future requests
    await set_cached(key, data, ttl)
    
    return data


async def refresh_cache(
    key: str,
    fetch_func: Callable,
    ttl: int = DEFAULT_TTL
) -> Any:
    """
    Force refresh cache with fresh data.
    
    Args:
        key: Full cache key
        fetch_func: Async function to fetch fresh data
        ttl: Cache TTL
        
    Returns:
        Fresh data
    """
    data = await fetch_func()
    await set_cached(key, data, ttl)
    return data


# =============================================================================
# CACHE STATS
# =============================================================================

async def get_cache_stats() -> dict:
    """
    Get cache statistics.
    
    Returns:
        dict: Cache statistics including memory, keys, hit rate
    """
    try:
        redis = await get_redis()
        
        # Get memory info
        info = await redis.info("memory")
        
        # Count cache keys
        cursor = 0
        key_count = 0
        while True:
            cursor, keys = await redis.scan(cursor, match=f"{CACHE_PREFIX}:*", count=1000)
            key_count += len(keys)
            if cursor == 0:
                break

        return {
            "backend": "redis",
            "status": "healthy",
            "used_memory": info.get("used_memory_human", "unknown"),
            "used_memory_peak": info.get("used_memory_peak_human", "unknown"),
            "total_keys": key_count,
            "prefix": f"{CACHE_PREFIX}:",
            "default_ttl": DEFAULT_TTL,
            "compression_threshold": COMPRESSION_THRESHOLD,
            "checked_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "backend": "redis",
            "status": "error",
            "error": str(e),
            "checked_at": datetime.utcnow().isoformat()
        }


async def clear_all_cache() -> int:
    """
    Clear all cache entries with GAIA prefix.
    
    Returns:
        int: Number of keys deleted
    """
    try:
        redis = await get_redis()
        
        # Scan and delete all cache keys
        cursor = 0
        deleted = 0
        
        while True:
            cursor, keys = await redis.scan(cursor, match=f"{CACHE_PREFIX}:*", count=1000)
            if keys:
                deleted += await redis.delete(*keys)
            if cursor == 0:
                break
        
        logger.info(f"Cleared {deleted} cache entries")
        return deleted
        
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise


# =============================================================================
# CACHE WARMING
# =============================================================================

async def warm_cache(endpoints: List[tuple]):
    """
    Pre-warm cache with data from specified endpoints.
    
    Args:
        endpoints: List of (key, fetch_func, ttl) tuples
    """
    logger.info(f"Warming cache with {len(endpoints)} endpoints...")
    
    for key, fetch_func, ttl in endpoints:
        try:
            await refresh_cache(key, fetch_func, ttl)
            logger.debug(f"Warmed cache: {key}")
        except Exception as e:
            logger.warning(f"Failed to warm cache {key}: {e}")
    
    logger.info("Cache warming complete")


# =============================================================================
# STARTUP/SHUTDOWN HOOKS
# =============================================================================

async def init_cache():
    """Initialize cache on application startup."""
    try:
        await get_redis()
        logger.info("✓ Redis cache initialized")
    except Exception as e:
        logger.warning(f"Redis cache initialization failed: {e} (continuing without cache)")


async def shutdown_cache():
    """Cleanup cache on application shutdown."""
    await close_redis()
    logger.info("Redis cache connection closed")
