"""
Celery Worker Configuration for GAIA RSS Feed Processing
Module: RSS-08 (Backend Integration)

Handles background RSS feed processing on a schedule:
- Default: Every 5 minutes
- Configurable via RSS_UPDATE_INTERVAL environment variable

Usage:
    celery -A celery_worker worker --loglevel=info --pool=solo
    celery -A celery_worker beat --loglevel=info
"""

import os
import logging
from celery import Celery
from celery.schedules import crontab
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Get configuration from environment
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
RSS_UPDATE_INTERVAL_MINUTES = int(os.getenv('RSS_UPDATE_INTERVAL_MINUTES', '5'))

# Initialize Celery application
celery_app = Celery(
    'gaia_rss_worker',
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

# Configure Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    task_soft_time_limit=3000,  # 50 minutes soft limit
    worker_prefetch_multiplier=1,  # Only fetch one task at a time
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks (prevent memory leaks)
)

# Configure periodic tasks
celery_app.conf.beat_schedule = {
    'process-rss-feeds-periodic': {
        'task': 'celery_worker.process_rss_feeds_task',
        'schedule': crontab(minute=f'*/{RSS_UPDATE_INTERVAL_MINUTES}'),  # Every N minutes
        'options': {
            'expires': RSS_UPDATE_INTERVAL_MINUTES * 60 - 10,  # Expire before next run
        }
    },
}

logger.info(f"Celery configured: RSS feeds will be processed every {RSS_UPDATE_INTERVAL_MINUTES} minutes")


# ============================================================================
# CELERY TASKS
# ============================================================================

@celery_app.task(name='celery_worker.process_rss_feeds_task', bind=True)
def process_rss_feeds_task(self):
    """
    Background task to process RSS feeds.
    Runs on schedule (default: every 5 minutes).
    
    Returns:
        dict: Processing results and statistics
    """
    logger.info(f"Starting RSS feed processing (Task ID: {self.request.id})")
    
    try:
        # Import here to avoid circular dependencies
        from backend.python.lib.supabase_client import supabase
        from backend.python.pipeline.rss_processor_enhanced import rss_processor_enhanced
        import asyncio
        
        # Find or create job record for this task
        job_id = None
        try:
            # Try to find existing job with this task_id
            jobs = supabase.schema('gaia').table('rss_processing_jobs') \
                .select('*') \
                .eq('status', 'running') \
                .order('started_at', desc=True) \
                .limit(1) \
                .execute()
            
            if jobs.data:
                job_id = jobs.data[0]['id']
                logger.info(f"Found existing job record: {job_id}")
            else:
                # No existing job found - create one for auto-processing (Celery Beat)
                # This happens when task is triggered automatically, not via API
                logger.info("No existing job record found - creating new job for auto-processing")
                job_data = {
                    'started_by': '00000000-0000-0000-0000-000000000000',  # System user UUID
                    'started_by_email': 'system@gaia.local',
                    'status': 'running',
                    'total_feeds': 0,  # Will be updated when feeds are fetched
                    'processed_feeds': 0,
                    'hazards_detected': 0,
                    'errors_encountered': 0,
                    'processing_details': {
                        'task_id': self.request.id,
                        'triggered_by': 'celery_beat_auto'
                    }
                }
                job_result = supabase.schema('gaia').table('rss_processing_jobs').insert(job_data).execute()
                if job_result.data:
                    job_id = job_result.data[0]['id']
                    logger.info(f"Created new job record: {job_id}")
        except Exception as job_err:
            logger.warning(f"Could not find or create job record: {job_err}")
        
        # Get active feeds from database
        feeds_result = supabase.schema('gaia').table('rss_feeds') \
            .select('*') \
            .eq('is_active', True) \
            .order('priority', desc=False) \
            .execute()
        
        if not feeds_result.data:
            logger.warning("No active RSS feeds found in database")
            # Update job status if exists
            if job_id:
                supabase.schema('gaia').table('rss_processing_jobs') \
                    .update({
                        'status': 'completed',
                        'completed_at': datetime.utcnow().isoformat(),
                        'error_message': 'No active feeds configured'
                    }) \
                    .eq('id', job_id) \
                    .execute()
            return {
                'status': 'skipped',
                'message': 'No active feeds configured',
                'processed_at': datetime.utcnow().isoformat()
            }
        
        feeds = feeds_result.data
        total_feeds = len(feeds)
        logger.info(f"Processing {total_feeds} active RSS feeds...")
        
        # Update job with total feeds
        if job_id:
            supabase.schema('gaia').table('rss_processing_jobs') \
                .update({'total_feeds': total_feeds}) \
                .eq('id', job_id) \
                .execute()
        
        # Extract feed URLs
        feed_urls = [feed['feed_url'] for feed in feeds]
        
        # Process feeds using enhanced processor (run async function in sync context)
        rss_processor_enhanced.set_feeds(feed_urls)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        results = loop.run_until_complete(rss_processor_enhanced.process_all_feeds())
        loop.close()
        
        # Calculate statistics
        total_hazards = 0
        total_errors = 0
        processed_count = 0
        
        # Save processing logs to database
        for result in results:
            processed_count += 1
            items_added = result.get('items_added', 0)
            total_hazards += items_added
            
            if result['status'] == 'error':
                total_errors += 1
            
            log_data = {
                'feed_url': result['feed_url'],
                'status': result['status'],
                'items_processed': result.get('items_processed', 0),
                'items_added': items_added,
                'duplicates_detected': result.get('duplicates_detected', 0),
                'errors_count': 1 if result['status'] == 'error' else 0,
                'processing_time_seconds': result.get('processing_time', 0),
                'error_message': result.get('error_message'),
                'hazard_ids': [h['id'] for h in result.get('hazards_saved', [])],
                'processed_by': 'celery'
            }
            
            # Insert log (trigger will update feed stats)
            supabase.schema('gaia').table('rss_processing_logs').insert(log_data).execute()
            
            # Update job progress
            if job_id:
                supabase.schema('gaia').table('rss_processing_jobs') \
                    .update({
                        'processed_feeds': processed_count,
                        'hazards_detected': total_hazards,
                        'errors_encountered': total_errors
                    }) \
                    .eq('id', job_id) \
                    .execute()
        
        # Get statistics
        stats = rss_processor_enhanced.get_statistics()
        
        logger.info(f"RSS processing complete: {stats['total_stored']} hazards saved, "
                   f"{stats['duplicates_detected']} duplicates detected")
        
        # Update job as completed
        if job_id:
            supabase.schema('gaia').table('rss_processing_jobs') \
                .update({
                    'status': 'completed',
                    'completed_at': datetime.utcnow().isoformat(),
                    'processed_feeds': processed_count,
                    'hazards_detected': total_hazards,
                    'errors_encountered': total_errors,
                    'processing_details': {
                        'statistics': stats,
                        'task_id': self.request.id
                    }
                }) \
                .eq('id', job_id) \
                .execute()
        
        return {
            'status': 'completed',
            'feeds_processed': len(results),
            'hazards_detected': total_hazards,
            'statistics': stats,
            'processed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in RSS processing task: {str(e)}", exc_info=True)
        
        # Update job as failed
        try:
            from backend.python.lib.supabase_client import supabase
            jobs = supabase.schema('gaia').table('rss_processing_jobs') \
                .select('id') \
                .eq('status', 'running') \
                .order('started_at', desc=True) \
                .limit(1) \
                .execute()
            
            if jobs.data:
                supabase.schema('gaia').table('rss_processing_jobs') \
                    .update({
                        'status': 'failed',
                        'completed_at': datetime.utcnow().isoformat(),
                        'error_message': str(e)
                    }) \
                    .eq('id', jobs.data[0]['id']) \
                    .execute()
        except Exception as update_err:
            logger.error(f"Failed to update job status: {update_err}")
        
        # Retry task up to 3 times with exponential backoff
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries), max_retries=3)


@celery_app.task(name='celery_worker.process_single_feed_task', bind=True)
def process_single_feed_task(self, feed_id: str):
    """
    Process a single RSS feed by ID.
    Used for manual/on-demand processing.
    
    Args:
        feed_id: UUID of the feed to process
        
    Returns:
        dict: Processing results
    """
    logger.info(f"Processing single feed: {feed_id} (Task ID: {self.request.id})")
    
    try:
        from backend.python.lib.supabase_client import supabase
        from backend.python.pipeline.rss_processor_enhanced import rss_processor_enhanced
        import asyncio
        
        # Get feed from database
        feed_result = supabase.schema('gaia').table('rss_feeds').select('*').eq('id', feed_id).execute()
        
        if not feed_result.data:
            logger.error(f"Feed not found: {feed_id}")
            return {
                'status': 'error',
                'message': f'Feed not found: {feed_id}'
            }
        
        feed = feed_result.data[0]
        feed_url = feed['feed_url']
        
        logger.info(f"Processing feed: {feed['feed_name']} ({feed_url})")
        
        # Process feed
        rss_processor_enhanced.set_feeds([feed_url])
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        results = loop.run_until_complete(rss_processor_enhanced.process_all_feeds())
        loop.close()
        
        # Save processing log
        if results:
            result = results[0]
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
                'processed_by': f'manual_{feed_id}'
            }
            
            supabase.schema('gaia').table('rss_processing_logs').insert(log_data).execute()
            
            return result
        else:
            return {
                'status': 'error',
                'message': 'No results returned'
            }
        
    except Exception as e:
        logger.error(f"Error processing single feed: {str(e)}", exc_info=True)
        raise self.retry(exc=e, countdown=30, max_retries=2)


# ============================================================================
# CELERY EVENTS
# ============================================================================

@celery_app.task(name='celery_worker.test_celery_connection')
def test_celery_connection():
    """
    Test task to verify Celery is working.
    
    Returns:
        dict: Test result with timestamp
    """
    logger.info("Celery connection test task executed")
    return {
        'status': 'success',
        'message': 'Celery worker is operational',
        'timestamp': datetime.utcnow().isoformat()
    }


if __name__ == '__main__':
    # Run worker directly (for development)
    # In production, use: celery -A celery_worker worker --loglevel=info
    logger.info("Starting Celery worker...")
    celery_app.worker_main([
        'worker',
        '--loglevel=info',
        '--concurrency=2',
        '--pool=solo',  # Use solo pool for Windows compatibility
    ])
