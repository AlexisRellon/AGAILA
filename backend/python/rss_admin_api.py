"""
RSS Feed Management API
Module: RSS-08 (Backend Integration)
Provides admin endpoints for RSS feed management, processing, and monitoring.

Security:
- Admin-only access (requires Master Admin or Validator role)
- Input validation and sanitization
- Rate limiting on processing endpoints
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request, Response, status, Depends, BackgroundTasks
from pydantic import BaseModel, HttpUrl, Field, validator

# Import security middleware
from slowapi import Limiter
from backend.python.middleware.rate_limiter import limiter

# Import Supabase client
from backend.python.lib.supabase_client import supabase

# Import enhanced RSS processor
from backend.python.pipeline.rss_processor_enhanced import rss_processor_enhanced

# Import ActivityLogger for comprehensive activity tracking  
from backend.python.middleware.activity_logger import ActivityLogger

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
    """RSS feed response model"""
    id: str
    feed_url: str
    feed_name: str
    feed_category: Optional[str]
    is_active: bool
    priority: int
    fetch_interval_minutes: int
    last_fetched_at: Optional[datetime]
    last_successful_fetch: Optional[datetime]
    total_fetches: int
    total_errors: int
    total_hazards_found: int


class ProcessRSSRequest(BaseModel):
    """Request model for triggering RSS processing"""
    feed_ids: Optional[List[str]] = Field(None, description="Specific feed IDs to process (all active if omitted)")


class ProcessingLogResponse(BaseModel):
    """Response model for processing logs"""
    id: str
    feed_url: str
    status: str
    items_processed: int
    items_added: int
    duplicates_detected: int
    errors_count: int
    processing_time_seconds: float
    error_message: Optional[str]
    processed_at: datetime


class RSSStatisticsResponse(BaseModel):
    """RSS statistics response"""
    total_feeds: int
    active_feeds: int
    total_hazards_found: int
    last_24h_runs: int
    last_24h_hazards: int
    last_24h_avg_processing_time: float
    last_24h_success_rate: float
    overall_success_rate: float


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/feeds", response_model=List[RSSFeedResponse])
@limiter.limit("30/minute")
async def list_rss_feeds(
    request: Request,
    response: Response,
    is_active: Optional[bool] = None
):
    """
    List all RSS feeds with statistics.
    
    Query Parameters:
    - is_active: Filter by active status (optional)
    
    Returns list of RSS feeds with metadata and statistics.
    """
    try:
        query = supabase.schema('gaia').table('rss_feeds').select('*')
        
        if is_active is not None:
            query = query.eq('is_active', is_active)
        
        query = query.order('priority', desc=False).order('feed_name', desc=False)
        
        result = query.execute()
        
        return result.data
        
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
    feed: RSSFeedCreate
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
    feed: RSSFeedUpdate
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
    feed_id: str
):
    """
    Delete an RSS feed configuration.
    
    Requires: Master Admin role
    Rate Limited: 10 requests per minute
    
    Note: This will also delete all associated processing logs (CASCADE).
    """
    try:
        result = supabase.schema('gaia').table('rss_feeds').delete().eq('id', feed_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS feed not found"
            )
        
        logger.info(f"Deleted RSS feed: {feed_id}")
        
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
    background_tasks: BackgroundTasks,
    process_request: ProcessRSSRequest = ProcessRSSRequest()
):
    """
    Trigger RSS feed processing in the background.
    
    Requires: Master Admin or Validator role
    Rate Limited: 5 requests per minute (AI/ML intensive)
    
    Query Parameters:
    - feed_ids: Optional list of feed IDs to process (processes all active feeds if omitted)
    
    **IMPORTANT**: This endpoint returns immediately and processes feeds in the background
    to prevent blocking other API requests. Check processing status via logs or database.
    
    Returns confirmation that processing has started.
    """
    try:
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
        feed_urls = [feed['feed_url'] for feed in feeds]
        feeds_count = len(feeds)
        
        logger.info(f"Scheduling background processing for {feeds_count} RSS feeds...")
        
        # Define background processing function
        async def process_feeds_background():
            """Process feeds asynchronously in the background."""
            try:
                logger.info(f"[Background] Starting RSS processing for {feeds_count} feeds...")
                
                # Process feeds using enhanced processor
                rss_processor_enhanced.set_feeds(feed_urls)
                results = await rss_processor_enhanced.process_all_feeds()
                
                # Save processing logs to database
                for result in results:
                    log_data = {
                        'feed_url': result['feed_url'],
                        'status': result['status'],
                        'items_processed': result.get('items_processed', 0),
                        'items_added': result.get('items_added', 0),
                        'duplicates_detected': result.get('duplicates_detected', 0),
                        'errors_count': 1 if result['status'] == 'error' else 0,
                        'processing_time_seconds': result.get('processing_time', 0),
                        'error_message': result.get('error_message'),
                        'hazard_ids': [h['id'] for h in result.get('hazards_saved', [])],
                        'processed_by': 'manual'
                    }
                    
                    # Insert log (trigger will update feed stats)
                    supabase.schema('gaia').table('rss_processing_logs').insert(log_data).execute()
                
                # Get statistics
                stats = rss_processor_enhanced.get_statistics()
                
                logger.info(f"[Background] RSS processing complete: {stats['total_stored']} hazards saved, "
                           f"{stats['duplicates_detected']} duplicates detected")
                
            except Exception as e:
                logger.error(f"[Background] RSS processing error: {str(e)}", exc_info=True)
        
        # Add to background tasks (non-blocking)
        background_tasks.add_task(process_feeds_background)
        
        # Return immediately with processing started confirmation
        return {
            'status': 'processing',
            'message': 'RSS feed processing started in background',
            'feeds_count': feeds_count,
            'feeds': [{'id': f['id'], 'name': f['feed_name']} for f in feeds],
            'note': 'Processing happens in background. Check logs or statistics for results.'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting RSS feed processing: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start RSS processing: {str(e)}"
        )


@router.get("/logs", response_model=List[ProcessingLogResponse])
@limiter.limit("30/minute")
async def get_processing_logs(
    request: Request,
    response: Response,
    feed_url: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """
    Get RSS processing logs with filtering.
    
    Query Parameters:
    - feed_url: Filter by specific feed URL
    - status_filter: Filter by status ('success', 'error', 'partial')
    - limit: Number of logs to return (default: 50, max: 100)
    - offset: Pagination offset
    
    Returns historical processing logs.
    """
    try:
        # Validate limit
        if limit > 100:
            limit = 100
        
        query = supabase.schema('gaia').table('rss_processing_logs').select('*')
        
        if feed_url:
            query = query.eq('feed_url', feed_url)
        
        if status_filter:
            query = query.eq('status', status_filter)
        
        query = query.order('processed_at', desc=True).limit(limit).offset(offset)
        
        result = query.execute()
        
        return result.data
        
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
    response: Response
):
    """
    Get comprehensive RSS feed statistics.
    
    Returns:
    - Total feeds count
    - Active feeds count
    - Total hazards found
    - Last 24 hours performance metrics
    - Overall success rate
    """
    try:
        # Get feed counts
        feeds_result = supabase.schema('gaia').table('rss_feeds').select('id, is_active, total_hazards_found').execute()
        
        total_feeds = len(feeds_result.data)
        active_feeds = len([f for f in feeds_result.data if f['is_active']])
        total_hazards_found = sum(f['total_hazards_found'] for f in feeds_result.data)
        
        # Get last 24h statistics
        time_threshold = datetime.utcnow() - timedelta(hours=24)
        logs_24h_result = supabase.schema('gaia').table('rss_processing_logs') \
            .select('*') \
            .gte('processed_at', time_threshold.isoformat()) \
            .execute()
        
        logs_24h = logs_24h_result.data
        
        last_24h_runs = len(logs_24h)
        last_24h_hazards = sum(log['items_added'] for log in logs_24h)
        last_24h_avg_processing_time = sum(log['processing_time_seconds'] for log in logs_24h) / max(last_24h_runs, 1)
        last_24h_success_count = len([log for log in logs_24h if log['status'] == 'success'])
        last_24h_success_rate = (last_24h_success_count / max(last_24h_runs, 1)) * 100
        
        # Overall success rate
        all_logs_result = supabase.schema('gaia').table('rss_processing_logs').select('status').execute()
        all_logs = all_logs_result.data
        
        total_logs = len(all_logs)
        success_logs = len([log for log in all_logs if log['status'] == 'success'])
        overall_success_rate = (success_logs / max(total_logs, 1)) * 100
        
        return RSSStatisticsResponse(
            total_feeds=total_feeds,
            active_feeds=active_feeds,
            total_hazards_found=total_hazards_found,
            last_24h_runs=last_24h_runs,
            last_24h_hazards=last_24h_hazards,
            last_24h_avg_processing_time=round(last_24h_avg_processing_time, 2),
            last_24h_success_rate=round(last_24h_success_rate, 2),
            overall_success_rate=round(overall_success_rate, 2)
        )
        
    except Exception as e:
        logger.error(f"Error retrieving RSS statistics: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve RSS statistics: {str(e)}"
        )


@router.get("/feeds/{feed_id}/test")
@limiter.limit("3/minute")
async def test_rss_feed(
    request: Request,
    response: Response,
    feed_id: str
):
    """
    Test a single RSS feed without saving to database.
    
    Requires: Master Admin role
    Rate Limited: 3 requests per minute
    
    Returns preview of what would be processed from the feed.
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
        
        logger.info(f"Testing RSS feed: {feed['feed_name']} ({feed_url})")
        
        # Process feed without saving (using regular processor for testing)
        from backend.python.pipeline.rss_processor import rss_processor
        rss_processor.set_feeds([feed_url])
        results = await rss_processor.process_all_feeds()
        
        if results:
            result = results[0]
            return {
                'feed_name': feed['feed_name'],
                'feed_url': feed_url,
                'test_result': result,
                'preview': result.get('hazards_found', [])[:5]  # Show first 5 hazards
            }
        else:
            return {
                'feed_name': feed['feed_name'],
                'feed_url': feed_url,
                'error': 'No results returned from feed test'
            }
        
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
    article_id: str
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
            .select('id') \
            .eq('id', article_id) \
            .eq('source_type', 'rss') \
            .execute()
        
        if not check_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="RSS article not found"
            )
        
        # Delete the article
        result = supabase.schema('gaia').table('hazards') \
            .delete() \
            .eq('id', article_id) \
            .eq('source_type', 'rss') \
            .execute()
        
        logger.info(f"Deleted RSS article: {article_id}")
        
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
    delete_request: BulkDeleteRequest
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
            .select('id') \
            .in_('id', ids) \
            .eq('source_type', 'rss') \
            .execute()
        
        found_ids = [item['id'] for item in check_result.data]
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
        
        logger.info(f"Bulk deleted {deleted_count} RSS articles")
        
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