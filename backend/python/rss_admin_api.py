"""
RSS Feed Management API
Module: RSS-08 (Backend Integration)
Provides admin endpoints for RSS feed management, processing, and monitoring.

Security:
- Admin-only access (requires Master Admin or Validator role)
- Input validation and sanitization
- Rate limiting on processing endpoints
"""

import asyncio
import os
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request, Response, status, Depends, Query
from pydantic import BaseModel, HttpUrl, Field, validator


def _sanitize_for_log(value: object) -> str:
    """Sanitize untrusted values before logging to prevent log injection."""
    return str(value).replace("\r", "").replace("\n", "")

# Import security middleware
from slowapi import Limiter
from backend.python.middleware.rate_limiter import limiter

# Import Supabase client
from backend.python.lib.supabase_client import supabase

# NOTE: RSS processing is now offloaded to Celery workers (separate container)
# This prevents blocking the main API event loop during ML inference
# The rss_processor_enhanced is imported in celery_worker.py instead

# Import ActivityLogger for comprehensive activity tracking  
from backend.python.middleware.activity_logger import ActivityLogger

# Import RBAC for admin-only access and audit logging
from backend.python.middleware.rbac import require_admin, UserContext, log_admin_action

# Import Redis caching for performance
from backend.python.middleware.redis_cache import (
    get_or_set,
    generate_cache_key,
    invalidate_pattern,
    CACHE_TTLS,
)

logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/admin/rss", tags=["RSS Management"])


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class RSSFeedCreate(BaseModel):
    """Model for creating a new RSS feed"""
    feed_url: HttpUrl = Field(..., description="RSS feed URL")
    feed_name: str = Field(..., min_length=1, max_length=255, description="Display name for the feed")
    feed_category: Optional[str] = Field(None, max_length=100, description="Category (e.g., 'National News', 'Regional')")
    priority: int = Field(1, ge=1, le=10, description="Priority level (1-10, higher = more frequent)")
    fetch_interval_minutes: int = Field(5, ge=1, le=1440, description="How often to fetch (1-1440 minutes)")
    is_active: bool = Field(True, description="Whether feed is active")
    
    @validator('feed_url')
    def validate_feed_url(cls, v):
        """Ensure feed URL is HTTP/HTTPS only"""
        url_str = str(v)
        if not url_str.startswith(('http://', 'https://')):
            raise ValueError('Feed URL must use HTTP or HTTPS protocol')
        # Block localhost and private IPs
        if any(blocked in url_str.lower() for blocked in ['localhost', '127.0.0.1', '0.0.0.0', '::1']):
            raise ValueError('Localhost URLs are not allowed')
        return v


class RSSFeedUpdate(BaseModel):
    """Model for updating an existing RSS feed"""
    feed_name: Optional[str] = Field(None, min_length=1, max_length=255)
    feed_category: Optional[str] = Field(None, max_length=100)
    priority: Optional[int] = Field(None, ge=1, le=10)
    fetch_interval_minutes: Optional[int] = Field(None, ge=1, le=1440)
    is_active: Optional[bool] = None


class RSSFeedResponse(BaseModel):
    """RSS feed response model - matches gaia.rss_feeds schema"""
    id: str
    feed_url: str
    feed_name: str
    feed_category: Optional[str] = None
    language: Optional[str] = "en"
    country: Optional[str] = "PH"
    is_active: bool = True
    priority: int = 1
    fetch_interval_minutes: int = 5
    last_fetched_at: Optional[datetime] = None
    last_successful_fetch: Optional[datetime] = None
    last_error_at: Optional[datetime] = None
    last_error_message: Optional[str] = None
    total_fetches: int = 0
    total_errors: int = 0
    total_hazards_found: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None


class ProcessRSSRequest(BaseModel):
    """Request model for triggering RSS processing"""
    feed_ids: Optional[List[str]] = Field(None, description="Specific feed IDs to process (all active if omitted)")


class ProcessingLogResponse(BaseModel):
    """Response model for a single processing log"""
    id: str
    feed_id: Optional[str] = None
    feed_url: str
    status: str
    items_processed: int
    items_added: int
    duplicates_detected: int
    processing_time_seconds: float
    error_details: Optional[dict] = None
    hazard_ids: Optional[List[str]] = None
    processed_at: datetime


class ProcessingLogsResponse(BaseModel):
    """Response model for processing logs with pagination - matches frontend expectation"""
    logs: List[ProcessingLogResponse]
    total: int
    page: int = 1
    pages: int = 1
    limit: int = 50
    has_next: bool = False
    has_prev: bool = False


class RSSStatisticsResponse(BaseModel):
    """RSS statistics response - matches frontend RSSStatistics type"""
    total_feeds: int
    active_feeds: int
    total_hazards_found: int
    last_24h_hazards: int
    last_24h_processing_time_avg: float  # Renamed to match frontend
    last_24h_success_rate: float
    duplicate_detection_rate: float  # Added to match frontend
    feeds_with_errors: int  # Added to match frontend


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/feeds", response_model=List[RSSFeedResponse])
@limiter.limit("30/minute")
async def list_rss_feeds(
    request: Request,
    response: Response,
    is_active: Optional[bool] = None,
    current_user: UserContext = Depends(require_admin),
):
    """
    List all RSS feeds with statistics.

    Query Parameters:
    - is_active: Filter by active status (optional)

    Returns list of RSS feeds with metadata and statistics.
    """
    try:
        cache_key = generate_cache_key("rss:feeds", "list", is_active=is_active)

        async def fetch_feeds():
            query = supabase.schema('gaia').table('rss_feeds').select('*')
            if is_active is not None:
                query = query.eq('is_active', is_active)
            query = query.order('priority', desc=False).order('feed_name', desc=False)
            return query.execute().data

        return await get_or_set(cache_key, fetch_feeds, ttl=CACHE_TTLS.get("rss:feeds", 60))

    except Exception as e:
        logger.error(f"Error listing RSS feeds: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve RSS feeds: {str(e)}"
        )


@router.post("/feeds", response_model=RSSFeedResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_rss_feed(
    request: Request,
    response: Response,
    feed: RSSFeedCreate,
    current_user: UserContext = Depends(require_admin),
):
    """
    Create a new RSS feed configuration.
    
    Requires: Master Admin role
    Rate Limited: 10 requests per minute
    """
    try:
        # Check if feed URL already exists
        existing = supabase.schema('gaia').table('rss_feeds') \
            .select('id') \
            .eq('feed_url', str(feed.feed_url)) \
            .execute()
        
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="RSS feed with this URL already exists"
            )
        
        # Insert new feed
        feed_data = {
            'feed_url': str(feed.feed_url),
            'feed_name': feed.feed_name,
            'feed_category': feed.feed_category,
            'priority': feed.priority,
            'fetch_interval_minutes': feed.fetch_interval_minutes,
            'is_active': feed.is_active
        }
        
        result = supabase.schema('gaia').table('rss_feeds').insert(feed_data).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create RSS feed"
            )
        
        logger.info(f"Created new RSS feed: {feed.feed_name} ({feed.feed_url})")

        # Invalidate RSS feeds cache so the new feed is visible immediately
        await invalidate_pattern("rss:feeds:*")

        # Log activity for audit trail (FP-04 Activity Monitor)
        try:
            await ActivityLogger.log_activity(
                user_context=current_user,
                action="RSS_FEED_ADDED",
                request=request,
                resource_type="rss_feeds",
                resource_id=result.data[0]['id'],
                details={
                    "feed_name": feed.feed_name,
                    "feed_url": str(feed.feed_url),
                    "category": feed.feed_category
                }
            )
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")

        # Log to audit_logs for Audit Logs viewer (AC-01)
        try:
            await log_admin_action(
                user=current_user,
                action="rss_feed_added",
                action_description=f"Added RSS feed: {feed.feed_name} ({feed.feed_url})",
                resource_type="rss_feeds",
                resource_id=result.data[0]['id'],
                old_values={},
                new_values={
                    "feed_id": result.data[0]['id'],
                    "feed_name": feed.feed_name,
                    "feed_url": str(feed.feed_url),
                    "category": feed.feed_category,
                    "is_active": feed.is_active,
                },
                request=request,
                event_type="RSS_FEED_ADDED",
            )
        except Exception as log_error:
            logger.warning(f"Failed to log audit: {log_error}")
        
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating RSS feed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create RSS feed: {str(e)}"
        )


@router.patch("/feeds/{feed_id}", response_model=RSSFeedResponse)
@limiter.limit("20/minute")
async def update_rss_feed(
    request: Request,
    response: Response,
    feed_id: str,
    feed: RSSFeedUpdate,
    current_user: UserContext = Depends(require_admin),
):
    """
    Update an existing RSS feed configuration.
    
    Requires: Master Admin role
    Rate Limited: 20 requests per minute
    """
    try:
        # Build update data (only include provided fields)
        update_data = {k: v for k, v in feed.dict(exclude_unset=True).items() if v is not None}
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update"
            )
        
        # Fetch current feed state before updating for audit trail
        existing_feed = supabase.schema('gaia').table('rss_feeds') \
            .select('*') \
            .eq('id', feed_id) \
            .execute()
        
        if not existing_feed.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS feed not found"
            )
        
        old_feed = existing_feed.data[0]
        old_values = {k: old_feed.get(k) for k in update_data.keys()}
        
        # Detect is_active status change for dedicated audit event
        status_changed = (
            'is_active' in update_data
            and old_feed.get('is_active') != update_data['is_active']
        )
        
        # Update feed
        result = supabase.schema('gaia').table('rss_feeds') \
            .update(update_data) \
            .eq('id', feed_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS feed not found"
            )
        
        logger.info(f"Updated RSS feed: {feed_id}")

        # Invalidate RSS feeds cache so the change is reflected immediately
        await invalidate_pattern("rss:feeds:*")

        # Log activity for audit trail (FP-04 Activity Monitor)
        try:
            await ActivityLogger.log_activity(
                user_context=current_user,
                action="RSS_FEED_UPDATED",
                request=request,
                resource_type="rss_feeds",
                resource_id=feed_id,
                details={
                    "updated_fields": list(update_data.keys()),
                    "feed_name": result.data[0].get('feed_name')
                }
            )
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")

        # Log to audit_logs for Audit Logs viewer (AC-01)
        try:
            await log_admin_action(
                user=current_user,
                action="rss_feed_updated",
                action_description=f"Updated RSS feed {result.data[0].get('feed_name')}: {', '.join(update_data.keys())}",
                resource_type="rss_feeds",
                resource_id=feed_id,
                old_values=old_values,
                new_values=update_data,
                request=request,
                event_type="RSS_FEED_UPDATED",
            )
        except Exception as log_error:
            logger.warning(f"Failed to log audit: {log_error}")

        # If is_active was toggled, emit a dedicated RSS_FEED_STATUS_CHANGED audit event
        if status_changed:
            previous_status = old_feed.get('is_active')
            new_status = update_data['is_active']
            try:
                await log_admin_action(
                    user=current_user,
                    action="rss_feed_status_changed",
                    action_description=(
                        f"{'Activated' if new_status else 'Deactivated'} RSS feed: "
                        f"{result.data[0].get('feed_name')}"
                    ),
                    resource_type="rss_feeds",
                    resource_id=feed_id,
                    old_values={"feed_id": feed_id, "is_active": previous_status},
                    new_values={"feed_id": feed_id, "is_active": new_status},
                    request=request,
                    event_type="RSS_FEED_STATUS_CHANGED",
                )
            except Exception as log_error:
                logger.warning(f"Failed to log status change audit: {log_error}")
        
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating RSS feed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update RSS feed: {str(e)}"
        )


@router.delete("/feeds/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def delete_rss_feed(
    request: Request,
    response: Response,
    feed_id: str,
    current_user: UserContext = Depends(require_admin),
):
    """
    Delete an RSS feed configuration.
    
    Requires: Master Admin role
    Rate Limited: 10 requests per minute
    
    Note: This will also delete all associated processing logs (CASCADE).
    """
    try:
        # Get full feed info before deleting for audit trail
        feed_info = supabase.schema('gaia').table('rss_feeds') \
            .select('feed_name, feed_url, feed_category, is_active, priority') \
            .eq('id', feed_id).execute()
        
        if not feed_info.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS feed not found"
            )
        
        feed_snapshot = feed_info.data[0]
        feed_name = feed_snapshot.get('feed_name', 'Unknown')
        feed_url = feed_snapshot.get('feed_url', 'Unknown')
        
        result = supabase.schema('gaia').table('rss_feeds').delete().eq('id', feed_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS feed not found"
            )
        
        logger.info(f"Deleted RSS feed: {feed_id}")

        # Invalidate RSS feeds cache so the deletion is reflected immediately
        await invalidate_pattern("rss:feeds:*")

        # Log activity for audit trail (FP-04 Activity Monitor)
        try:
            await ActivityLogger.log_activity(
                user_context=current_user,
                action="RSS_FEED_REMOVED",
                request=request,
                resource_type="rss_feeds",
                resource_id=feed_id,
                details={
                    "feed_name": feed_name,
                    "feed_url": feed_url
                }
            )
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")

        # Log to audit_logs for Audit Logs viewer (AC-01)
        try:
            await log_admin_action(
                user=current_user,
                action="rss_feed_removed",
                action_description=f"Removed RSS feed: {feed_name} ({feed_url})",
                resource_type="rss_feeds",
                resource_id=feed_id,
                old_values={
                    "feed_id": feed_id,
                    "feed_name": feed_name,
                    "feed_url": feed_url,
                    "feed_category": feed_snapshot.get('feed_category'),
                    "is_active": feed_snapshot.get('is_active'),
                },
                new_values={},
                request=request,
                event_type="RSS_FEED_REMOVED",
            )
        except Exception as log_error:
            logger.warning(f"Failed to log audit: {log_error}")
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting RSS feed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete RSS feed: {str(e)}"
        )


@router.post("/process")
@limiter.limit("5/minute")
async def process_rss_feeds(
    request: Request,
    response: Response,
    process_request: ProcessRSSRequest = ProcessRSSRequest(),
    current_user: UserContext = Depends(require_admin),
):
    """
    Trigger RSS feed processing via Celery worker (non-blocking).
    
    Requires: Master Admin or Validator role
    Rate Limited: 5 requests per minute (AI/ML intensive)
    
    Query Parameters:
    - feed_ids: Optional list of feed IDs to process (processes all active feeds if omitted)
    
    **IMPORTANT**: This endpoint dispatches processing to Celery workers running in a separate
    container. This prevents blocking the main API and ensures other requests remain responsive.
    Check processing status via /admin/rss/task/{task_id} or /admin/rss/current-job.
    
    Returns confirmation that processing has been queued.
    """
    try:
        # Check if there's already a running job
        running_jobs = supabase.schema('gaia').table('rss_processing_jobs') \
            .select('*') \
            .eq('status', 'running') \
            .execute()
        
        if running_jobs.data and len(running_jobs.data) > 0:
            running_job = running_jobs.data[0]
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    'message': 'RSS processing is already in progress',
                    'job_id': running_job['id'],
                    'started_at': running_job['started_at'],
                    'started_by': running_job['started_by_email'],
                    'progress': {
                        'processed': running_job.get('processed_feeds', 0),
                        'total': running_job.get('total_feeds', 0)
                    }
                }
            )
        
        # Get feeds to process
        if process_request.feed_ids:
            # Process specific feeds
            feeds_query = supabase.schema('gaia').table('rss_feeds') \
                .select('*') \
                .in_('id', process_request.feed_ids) \
                .execute()
        else:
            # Process all active feeds
            feeds_query = supabase.schema('gaia').table('rss_feeds') \
                .select('*') \
                .eq('is_active', True) \
                .order('priority', desc=False) \
                .execute()
        
        if not feeds_query.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No feeds found to process"
            )
        
        feeds = feeds_query.data
        feeds_count = len(feeds)
        
        logger.info(f"Dispatching RSS processing to Celery for {feeds_count} feeds...")
        
        # Import Celery task - dispatch to separate worker process (NON-BLOCKING)
        # This runs in a completely separate container/process and won't block the API
        try:
            from backend.python.celery_worker import process_rss_feeds_task
            
            # Dispatch task asynchronously to Celery worker
            # apply_async() returns immediately without waiting for result
            task_result = process_rss_feeds_task.apply_async()
            task_id = task_result.id
            
            # Create job record in database for tracking (user from require_admin)
            user_id = current_user.user_id
            user_email = current_user.email
            
            job_data = {
                'started_by': user_id,
                'started_by_email': user_email,
                'status': 'running',
                'total_feeds': feeds_count,
                'processed_feeds': 0,
                'hazards_detected': 0,
                'errors_encountered': 0,
                'processing_details': {
                    'task_id': task_id,
                    'feed_ids': [f['id'] for f in feeds]
                }
            }
            
            job_result = supabase.schema('gaia').table('rss_processing_jobs').insert(job_data).execute()
            job_id = job_result.data[0]['id'] if job_result.data else None
            
            # Log activity for audit trail (FP-04 Activity Monitor)
            try:
                await ActivityLogger.log_activity(
                    user_context=current_user,
                    action="RSS_PROCESSING_STARTED",
                    request=request,
                    resource_type="rss_feeds",
                    resource_id=job_id,
                    details={
                        "task_id": task_id,
                        "feeds_count": feeds_count,
                        "feed_ids": [f['id'] for f in feeds],
                    }
                )
            except Exception as log_error:
                logger.warning(f"Failed to log activity: {log_error}")

            # Log to audit_logs for Audit Logs viewer (AC-01)
            try:
                await log_admin_action(
                    user=current_user,
                    action="rss_processing_started",
                    action_description=f"Started RSS processing: {feeds_count} feed(s)",
                    resource_type="rss_feeds",
                    resource_id=job_id,
                    old_values={},
                    new_values={"task_id": task_id, "feeds_count": feeds_count},
                    request=request,
                    event_type="RSS_PROCESSING_STARTED",
                )
            except Exception as log_error:
                logger.warning(f"Failed to log audit: {log_error}")
            
            logger.info(f"RSS processing task dispatched to Celery: Task ID = {task_id}, Job ID = {job_id}")
            
            return {
                'status': 'queued',
                'message': 'RSS feed processing dispatched to Celery worker',
                'task_id': task_id,
                'job_id': job_id,
                'feeds_count': feeds_count,
                'feeds': [{'id': f['id'], 'name': f['feed_name']} for f in feeds],
                'note': 'Processing runs in Celery worker (separate container). Check /admin/rss/current-job for status.'
            }
            
        except ImportError as ie:
            logger.error(f"Celery import failed: {str(ie)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Celery worker not available. Ensure Redis and Celery containers are running."
            )
        except Exception as celery_error:
            logger.error(f"Celery dispatch failed: {str(celery_error)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to dispatch to Celery: {str(celery_error)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting RSS feed processing: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start RSS processing: {str(e)}"
        )


@router.get("/current-job")
@limiter.limit("60/minute")
async def get_current_processing_job(
    request: Request,
    response: Response
):
    """
    Get the current RSS processing job status.
    
    Returns the currently running job (if any) or the most recent completed job.
    This is useful for the frontend to show processing status and disable the button.
    """
    try:
        # First check for running jobs
        running_jobs = supabase.schema('gaia').table('rss_processing_jobs') \
            .select('*') \
            .eq('status', 'running') \
            .order('started_at', desc=True) \
            .limit(1) \
            .execute()
        
        if running_jobs.data and len(running_jobs.data) > 0:
            job = running_jobs.data[0]
            return {
                'has_running_job': True,
                'job': job,
                'status': 'running',
                'progress': {
                    'processed': job.get('processed_feeds', 0),
                    'total': job.get('total_feeds', 0),
                    'hazards': job.get('hazards_detected', 0),
                    'errors': job.get('errors_encountered', 0)
                }
            }
        
        # No running job, get most recent completed job
        recent_jobs = supabase.schema('gaia').table('rss_processing_jobs') \
            .select('*') \
            .neq('status', 'running') \
            .order('completed_at', desc=True) \
            .limit(1) \
            .execute()
        
        if recent_jobs.data and len(recent_jobs.data) > 0:
            job = recent_jobs.data[0]
            return {
                'has_running_job': False,
                'job': job,
                'status': job.get('status', 'idle'),
                'last_completed_at': job.get('completed_at')
            }
        
        return {
            'has_running_job': False,
            'job': None,
            'status': 'idle',
            'message': 'No processing jobs found'
        }
        
    except Exception as e:
        logger.error(f"Error getting current job status: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get current job status: {str(e)}"
        )


@router.get("/logs", response_model=ProcessingLogsResponse)
@limiter.limit("30/minute")
async def get_processing_logs(
    request: Request,
    response: Response,
    feed_url: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=500, description="Number of logs to return (max: 500)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)")
):
    """
    Get RSS processing logs with filtering and pagination.
    
    Query Parameters:
    - feed_url: Filter by specific feed URL
    - status: Filter by status ('success', 'error', 'partial')
    - limit: Number of logs per page (default: 50, max: 500)
    - offset: Pagination offset (alternative to page)
    - page: Page number (1-indexed, alternative to offset)
    
    Returns:
    - logs: List of processing log entries
    - total: Total count of matching logs (for pagination)
    - page: Current page number
    - pages: Total number of pages
    - has_next: Whether there are more pages
    - has_prev: Whether there are previous pages
    """
    try:
        # Calculate offset from page if page > 1 and offset not explicitly set
        if page > 1 and offset == 0:
            offset = (page - 1) * limit
        
        # Build base query for counting with exact count
        count_query = supabase.schema('gaia').table('rss_processing_logs').select('id', count='exact', head=True)
        
        if feed_url:
            count_query = count_query.eq('feed_url', feed_url)
        
        if status_filter:
            count_query = count_query.eq('status', status_filter)
        
        count_result = count_query.execute()
        total = count_result.count if count_result.count is not None else 0
        
        # Build query for actual data
        query = supabase.schema('gaia').table('rss_processing_logs').select('*')
        
        if feed_url:
            query = query.eq('feed_url', feed_url)
        
        if status_filter:
            query = query.eq('status', status_filter)
        
        # Use range for proper pagination (offset-based)
        query = query.order('processed_at', desc=True).range(offset, offset + limit - 1)
        
        result = query.execute()
        
        # Calculate pagination info
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        current_page = (offset // limit) + 1
        
        return {
            "logs": result.data,
            "total": total,
            "page": current_page,
            "pages": total_pages,
            "limit": limit,
            "has_next": current_page < total_pages,
            "has_prev": current_page > 1
        }
        
    except Exception as e:
        logger.error(f"Error retrieving processing logs: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve processing logs: {str(e)}"
        )


@router.get("/statistics", response_model=RSSStatisticsResponse)
@limiter.limit("30/minute")
async def get_rss_statistics(
    request: Request,
    response: Response,
    current_user: UserContext = Depends(require_admin),
):
    """
    Get comprehensive RSS feed statistics.

    Returns:
    - Total feeds count
    - Active feeds count
    - Total hazards found
    - Last 24 hours performance metrics
    - Duplicate detection rate
    - Feeds with errors count
    """
    try:
        cache_key = generate_cache_key("rss:feeds", "statistics")

        async def fetch_statistics():
            time_threshold = datetime.utcnow() - timedelta(hours=24)

            # Run all independent queries concurrently instead of serially
            (
                feeds_result,
                hazards_result,
                logs_24h_result,
                hazards_24h_result,
                all_logs_result,
            ) = await asyncio.gather(
                asyncio.to_thread(
                    lambda: supabase.schema('gaia').table('rss_feeds')
                        .select('id, is_active, total_hazards_found, total_errors')
                        .execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema('gaia').table('hazards')
                        .select('id', count='exact', head=True)
                        .eq('source_type', 'rss')
                        .execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema('gaia').table('rss_processing_logs')
                        .select('*')
                        .gte('processed_at', time_threshold.isoformat())
                        .execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema('gaia').table('hazards')
                        .select('id', count='exact', head=True)
                        .eq('source_type', 'rss')
                        .gte('created_at', time_threshold.isoformat())
                        .execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.schema('gaia').table('rss_processing_logs')
                        .select('items_processed, duplicates_detected')
                        .execute()
                ),
            )

            total_feeds = len(feeds_result.data)
            active_feeds = len([f for f in feeds_result.data if f['is_active']])
            feeds_with_errors = len([f for f in feeds_result.data if (f.get('total_errors') or 0) > 0])

            total_hazards_found = hazards_result.count or 0

            logs_24h = logs_24h_result.data

            last_24h_runs = len(logs_24h)
            last_24h_avg_processing_time = sum(log.get('processing_time_seconds', 0) or 0 for log in logs_24h) / max(last_24h_runs, 1)
            last_24h_success_count = len([log for log in logs_24h if log.get('status') == 'success'])
            # Return as decimal (0-1 range) - frontend multiplies by 100 for display
            last_24h_success_rate = last_24h_success_count / max(last_24h_runs, 1)

            last_24h_hazards = hazards_24h_result.count or 0

            all_logs = all_logs_result.data

            total_processed = sum(log.get('items_processed', 0) or 0 for log in all_logs)
            total_duplicates = sum(log.get('duplicates_detected', 0) or 0 for log in all_logs)
            # Return as decimal (0-1 range) - frontend multiplies by 100 for display
            duplicate_detection_rate = total_duplicates / max(total_processed, 1)

            return {
                "total_feeds": total_feeds,
                "active_feeds": active_feeds,
                "total_hazards_found": total_hazards_found,
                "last_24h_hazards": last_24h_hazards,
                "last_24h_processing_time_avg": round(last_24h_avg_processing_time, 2),
                "last_24h_success_rate": round(last_24h_success_rate, 4),
                "duplicate_detection_rate": round(duplicate_detection_rate, 4),
                "feeds_with_errors": feeds_with_errors,
            }

        data = await get_or_set(cache_key, fetch_statistics, ttl=CACHE_TTLS.get("rss:feeds", 60))
        return RSSStatisticsResponse(**data)

    except Exception as e:
        logger.error(f"Error retrieving RSS statistics: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve RSS statistics: {str(e)}"
        )


@router.get("/feed-performance")
@limiter.limit("30/minute")
async def get_feed_performance(
    request: Request,
    response: Response,
    current_user: UserContext = Depends(require_admin),
):
    """
    Get hazard counts per feed for charting.

    Returns list of feeds with their actual hazard counts from the hazards table.
    """
    try:
        cache_key = generate_cache_key("rss:feeds", "feed-performance")

        async def fetch_performance():
            # Get all active feeds
            feeds_result = await asyncio.to_thread(
                lambda: supabase.schema('gaia').table('rss_feeds')
                    .select('id, feed_name, feed_url, total_fetches')
                    .eq('is_active', True)
                    .execute()
            )

            feeds = feeds_result.data
            if not feeds:
                return []

            feed_urls = [f['feed_url'] for f in feeds]

            # Single aggregated query instead of one query per feed (eliminates N+1)
            all_hazards_result = await asyncio.to_thread(
                lambda: supabase.schema('gaia').table('hazards')
                    .select('source')
                    .eq('source_type', 'rss')
                    .in_('source', feed_urls)
                    .execute()
            )

            # Build count map in Python
            hazard_counts: dict = {}
            for row in (all_hazards_result.data or []):
                src = row.get('source')
                if src:
                    hazard_counts[src] = hazard_counts.get(src, 0) + 1

            performance_data = []
            for feed in feeds:
                performance_data.append({
                    'id': feed['id'],
                    'name': feed['feed_name'],
                    'feed_url': feed['feed_url'],
                    'hazards': hazard_counts.get(feed['feed_url'], 0),
                    'fetches': feed.get('total_fetches', 0) or 0
                })

            # Sort by hazards descending
            performance_data.sort(key=lambda x: x['hazards'], reverse=True)
            return performance_data

        return await get_or_set(cache_key, fetch_performance, ttl=CACHE_TTLS.get("rss:feeds", 60))

    except Exception as e:
        logger.error(f"Error retrieving feed performance: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve feed performance: {str(e)}"
        )


@router.get("/feeds/{feed_id}/test")
@limiter.limit("3/minute")
async def test_rss_feed(
    request: Request,
    response: Response,
    feed_id: str
):
    """
    Test a single RSS feed via Celery worker.
    
    Requires: Master Admin role
    Rate Limited: 3 requests per minute
    
    **NOTE**: This dispatches to Celery to prevent blocking the API.
    For immediate preview, check the feed URL directly in a browser.
    
    Returns task_id for tracking processing status.
    """
    try:
        # Get feed
        feed_result = supabase.schema('gaia').table('rss_feeds').select('*').eq('id', feed_id).execute()
        
        if not feed_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS feed not found"
            )
        
        feed = feed_result.data[0]
        feed_url = feed['feed_url']
        
        logger.info(f"Testing RSS feed via Celery: {feed['feed_name']} ({feed_url})")
        
        # Dispatch to Celery worker to prevent blocking
        try:
            from backend.python.celery_worker import process_single_feed_task
            
            # Dispatch single feed test task
            task_result = process_single_feed_task.apply_async(args=[feed_id])
            
            return {
                'status': 'queued',
                'task_id': task_result.id,
                'feed_name': feed['feed_name'],
                'feed_url': feed_url,
                'message': 'Feed test dispatched to Celery worker. Use /admin/rss/task/{task_id} to check status.'
            }
            
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Celery not available. Ensure Redis and Celery containers are running."
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing RSS feed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to test RSS feed: {str(e)}"
        )


# ============================================================================
# RSS ARTICLES (HAZARDS) ENDPOINTS
# ============================================================================

class RSSArticleResponse(BaseModel):
    """RSS article (hazard) response model"""
    id: str
    hazard_type: str
    severity: Optional[str]
    status: str
    location_name: Optional[str]
    admin_division: Optional[str]
    latitude: float
    longitude: float
    confidence_score: float
    model_version: Optional[str]
    source_type: str
    source_url: Optional[str]
    source_title: Optional[str]
    source_content: Optional[str]
    source_published_at: Optional[datetime]
    source: Optional[str]
    validated: bool
    validated_at: Optional[datetime]
    validation_notes: Optional[str]
    detected_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]


class BulkDeleteRequest(BaseModel):
    """Request model for bulk deleting articles"""
    ids: List[str] = Field(..., description="List of article IDs to delete", min_items=1, max_items=100)


@router.get("/articles", response_model=List[RSSArticleResponse])
@limiter.limit("30/minute")
async def list_rss_articles(
    request: Request,
    response: Response,
    hazard_type: Optional[str] = None,
    validated: Optional[bool] = None,
    source: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0
):
    """
    List all RSS articles (hazards from RSS sources) with filtering.
    
    Query Parameters:
    - hazard_type: Filter by hazard type (e.g., 'typhoon', 'flood')
    - validated: Filter by validation status
    - source: Filter by source feed URL
    - limit: Number of articles to return (optional, returns all if not specified, max: 1000)
    - offset: Pagination offset
    
    Returns list of RSS articles with metadata.
    """
    try:
        query = supabase.schema('gaia').table('hazards') \
            .select('*') \
            .eq('source_type', 'rss')
        
        if hazard_type:
            query = query.eq('hazard_type', hazard_type)
        
        if validated is not None:
            query = query.eq('validated', validated)
        
        if source:
            query = query.eq('source', source)
        
        query = query.order('created_at', desc=True)
        
        # Apply limit only if specified (cap at 1000 for safety)
        if limit is not None:
            if limit > 1000:
                limit = 1000
            query = query.limit(limit)
        
        if offset > 0:
            query = query.offset(offset)
        
        result = query.execute()
        
        return result.data
        
    except Exception as e:
        logger.error(f"Error listing RSS articles: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve RSS articles: {str(e)}"
        )


@router.get("/articles/count")
@limiter.limit("30/minute")
async def count_rss_articles(
    request: Request,
    response: Response,
    hazard_type: Optional[str] = None,
    validated: Optional[bool] = None,
    source: Optional[str] = None
):
    """
    Get the total count of RSS articles matching filters.
    
    Query Parameters:
    - hazard_type: Filter by hazard type
    - validated: Filter by validation status
    - source: Filter by source feed URL
    
    Returns count of matching articles.
    """
    try:
        query = supabase.schema('gaia').table('hazards') \
            .select('id', count='exact') \
            .eq('source_type', 'rss')
        
        if hazard_type:
            query = query.eq('hazard_type', hazard_type)
        
        if validated is not None:
            query = query.eq('validated', validated)
        
        if source:
            query = query.eq('source', source)
        
        result = query.execute()
        
        return {'count': result.count or 0}
        
    except Exception as e:
        logger.error(f"Error counting RSS articles: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to count RSS articles: {str(e)}"
        )


@router.delete("/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def delete_rss_article(
    request: Request,
    response: Response,
    article_id: str,
    current_user: UserContext = Depends(require_admin)
):
    """
    Delete a single RSS article.
    
    Requires: Master Admin or Validator role
    Rate Limited: 20 requests per minute
    
    Only deletes articles with source_type='rss' for safety.
    """
    try:
        # First verify the article exists and is an RSS article
        check_result = supabase.schema('gaia').table('hazards') \
            .select('id, title, source') \
            .eq('id', article_id) \
            .eq('source_type', 'rss') \
            .execute()
        
        if not check_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS article not found"
            )
            
        old_data = check_result.data[0]
        
        # Delete the article
        result = supabase.schema('gaia').table('hazards') \
            .delete() \
            .eq('id', article_id) \
            .eq('source_type', 'rss') \
            .execute()
        
        safe_article_id = article_id.replace('\r', '').replace('\n', '')
        logger.info(f"Deleted RSS article: {safe_article_id} by {current_user.email}")
        
        # Log admin action
        await log_admin_action(
            user=current_user,
            action="rss_article_deleted",
            action_description=f"Deleted RSS article '{old_data.get('title', 'Unknown')}'",
            resource_type="hazards",
            resource_id=article_id,
            old_values=old_data,
            new_values=None,
            request=request,
            event_type="RSS_ARTICLE_DELETED"
        )

        # Invalidate hazards cache since an article (hazard) was deleted
        await invalidate_pattern("hazards:*")

        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting RSS article: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete RSS article: {str(e)}"
        )


@router.post("/articles/bulk-delete", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def bulk_delete_rss_articles(
    request: Request,
    response: Response,
    delete_request: BulkDeleteRequest,
    current_user: UserContext = Depends(require_admin)
):
    """
    Bulk delete multiple RSS articles.
    
    Requires: Master Admin role
    Rate Limited: 10 requests per minute
    
    Only deletes articles with source_type='rss' for safety.
    Maximum 100 articles per request.
    """
    try:
        ids = delete_request.ids
        
        # First verify all articles exist and are RSS articles
        check_result = supabase.schema('gaia').table('hazards') \
            .select('id, title') \
            .in_('id', ids) \
            .eq('source_type', 'rss') \
            .execute()
        
        found_ids = [item['id'] for item in check_result.data]
        titles = [item.get('title', 'Unknown') for item in check_result.data]
        not_found_ids = [id for id in ids if id not in found_ids]
        
        if not found_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No valid RSS articles found to delete"
            )
        
        # Delete the articles
        result = supabase.schema('gaia').table('hazards') \
            .delete() \
            .in_('id', found_ids) \
            .eq('source_type', 'rss') \
            .execute()
        
        deleted_count = len(result.data) if result.data else 0

        logger.info(f"Bulk deleted {deleted_count} RSS articles by {current_user.email}")
        
        # Log admin action
        await log_admin_action(
            user=current_user,
            action="rss_articles_bulk_deleted",
            action_description=f"Bulk deleted {deleted_count} RSS articles.",
            resource_type="hazards",
            resource_id="multiple",
            old_values={"deleted_ids": found_ids, "deleted_titles": titles},
            new_values=None,
            request=request,
            event_type="RSS_ARTICLES_BULK_DELETED"
        )

        # Invalidate hazards cache since articles (hazards) were deleted
        await invalidate_pattern("hazards:*")
        
        return {
            'deleted_count': deleted_count,
            'deleted_ids': found_ids,
            'not_found_ids': not_found_ids
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk deleting RSS articles: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk delete RSS articles: {str(e)}"
        )


class ArticleUpdateRequest(BaseModel):
    """Request model for updating an article"""
    status: Optional[str] = Field(None, description="Status: 'active', 'resolved', 'archived'")
    validated: Optional[bool] = Field(None, description="Validation status")
    validation_notes: Optional[str] = Field(None, description="Notes from validator")
    hazard_type: Optional[str] = Field(None, description="Hazard type override")
    severity: Optional[str] = Field(None, description="Severity: 'low', 'medium', 'high', 'critical'")


@router.patch("/articles/{article_id}", response_model=RSSArticleResponse)
@limiter.limit("30/minute")
async def update_rss_article(
    request: Request,
    response: Response,
    article_id: str,
    update_data: ArticleUpdateRequest,
    current_user: UserContext = Depends(require_admin)
):
    """
    Update an RSS article's status, validation, or other fields.
    
    Requires: Master Admin or Validator role
    Rate Limited: 30 requests per minute
    
    Fields that can be updated:
    - status: 'active', 'resolved', 'archived'
    - validated: true/false
    - validation_notes: text notes from validator
    - hazard_type: override detected hazard type
    - severity: 'low', 'medium', 'high', 'critical'
    """
    try:
        # Verify article exists
        check_result = supabase.schema('gaia').table('hazards') \
            .select('*') \
            .eq('id', article_id) \
            .eq('source_type', 'rss') \
            .execute()
        
        if not check_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS article not found"
            )
            
        old_data = check_result.data[0]
        
        # Build update dict with only provided fields
        update_dict = {}
        if update_data.status is not None:
            if update_data.status not in ['active', 'resolved', 'archived']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid status. Must be 'active', 'resolved', or 'archived'"
                )
            update_dict['status'] = update_data.status
            
        if update_data.validated is not None:
            update_dict['validated'] = update_data.validated
            if update_data.validated:
                update_dict['validated_at'] = datetime.utcnow().isoformat()
            else:
                update_dict['validated_at'] = None
                
        if update_data.validation_notes is not None:
            update_dict['validation_notes'] = update_data.validation_notes
            
        if update_data.hazard_type is not None:
            update_dict['hazard_type'] = update_data.hazard_type
            
        if update_data.severity is not None:
            if update_data.severity not in ['low', 'medium', 'high', 'critical']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid severity. Must be 'low', 'medium', 'high', or 'critical'"
                )
            update_dict['severity'] = update_data.severity
        
        if not update_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No update fields provided"
            )
        
        update_dict['updated_at'] = datetime.utcnow().isoformat()
        
        # Perform update
        result = supabase.schema('gaia').table('hazards') \
            .update(update_dict) \
            .eq('id', article_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Update failed"
            )
            
        updated_data = result.data[0]
        
        safe_article_id = _sanitize_for_log(article_id)
        safe_user_email = _sanitize_for_log(current_user.email)
        logger.info(f"Updated RSS article {safe_article_id} by {safe_user_email}: {list(update_dict.keys())}")
        
        # Log admin action
        await log_admin_action(
            user=current_user,
            action="rss_article_updated",
            action_description=f"Updated RSS article fields: {', '.join(update_dict.keys())}",
            resource_type="hazards",
            resource_id=article_id,
            old_values={k: old_data.get(k) for k in update_dict.keys() if k in old_data},
            new_values=update_dict,
            request=request,
            event_type="RSS_ARTICLE_UPDATED"
        )

        # Invalidate hazards cache since an article (hazard) was updated
        await invalidate_pattern("hazards:*")

        return updated_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating RSS article: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update RSS article: {str(e)}"
        )


@router.post("/articles/{article_id}/validate", response_model=RSSArticleResponse)
@limiter.limit("30/minute")
async def validate_rss_article(
    request: Request,
    response: Response,
    article_id: str,
    current_user: UserContext = Depends(require_admin),
    validation_notes: Optional[str] = None
):
    """
    Quick validate an RSS article (mark as validated=true).
    
    Requires: Master Admin or Validator role
    Rate Limited: 30 requests per minute
    
    This is a convenience endpoint for quickly validating articles.
    Use PATCH /articles/{id} for more complex updates.
    """
    try:
        # Verify article exists
        check_result = supabase.schema('gaia').table('hazards') \
            .select('*') \
            .eq('id', article_id) \
            .eq('source_type', 'rss') \
            .execute()
        
        if not check_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS article not found"
            )
        
        # Build update
        update_dict = {
            'validated': True,
            'validated_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if validation_notes:
            update_dict['validation_notes'] = validation_notes
        
        # Perform update
        result = supabase.schema('gaia').table('hazards') \
            .update(update_dict) \
            .eq('id', article_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Validation failed"
            )
        
        updated_data = result.data[0]
        
        safe_article_id = article_id.replace('\r', '').replace('\n', '')
        safe_user_email = str(current_user.email).replace('\r', '').replace('\n', '')
        logger.info(f"Validated RSS article {safe_article_id} by {safe_user_email}")
        
        # Log admin action
        await log_admin_action(
            user=current_user,
            action="rss_article_validated",
            action_description=f"Quick validated RSS article",
            resource_type="hazards",
            resource_id=article_id,
            old_values={'validated': check_result.data[0].get('validated')},
            new_values={'validated': True, 'validation_notes': validation_notes},
            request=request,
            event_type="RSS_ARTICLE_VALIDATED"
        )
        
        return updated_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating RSS article: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate RSS article: {str(e)}"
        )


# ============================================================================
# CELERY TASK STATUS ENDPOINT
# ============================================================================

@router.get("/task/{task_id}")
@limiter.limit("60/minute")
async def get_task_status(
    request: Request,
    response: Response,
    task_id: str
):
    """
    Get the status of an RSS processing Celery task.
    
    Returns task state and result (if completed).
    Useful for polling the status of "Process Now" operations.
    """
    try:
        from backend.python.celery_worker import celery_app
        
        # Get task result from Celery
        result = celery_app.AsyncResult(task_id)
        
        task_status = {
            'task_id': task_id,
            'state': result.state,
            'ready': result.ready(),
            'successful': result.successful() if result.ready() else None,
        }
        
        # Include result if task is complete
        if result.ready():
            if result.successful():
                task_status['result'] = result.result
            else:
                # Task failed
                task_status['error'] = str(result.result) if result.result else 'Unknown error'
        
        # Include progress info if available
        if result.state == 'PROGRESS':
            task_status['progress'] = result.info
        
        return task_status
        
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Celery not available. Ensure Redis and Celery containers are running."
        )
    except Exception as e:
        logger.error(f"Error getting task status: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task status: {str(e)}"
        )