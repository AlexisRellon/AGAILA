"""
RSS Feed Processor for GAIA - Enhanced with Database Integration
Fetches and processes RSS feeds from Philippine news sources.
Integrates with Classifier, Geo-NER, and Supabase database.

Module: RSS-08 (Backend Integration)
Database: Supabase PostgreSQL with gaia.hazards table
Security: Input sanitization, duplicate detection, content hashing, URL validation
"""

import feedparser
import time
import hashlib
from datetime import datetime, timedelta, timezone
from dateutil import parser as date_parser
from bs4 import BeautifulSoup
import logging
import asyncio
from typing import Dict, List, Optional, Tuple
import os
import re
from urllib.parse import urlparse, parse_qs, urlencode

# Import AI models
from backend.python.models.classifier import classifier
from backend.python.models.geo_ner import geo_ner

# Import Supabase client
from backend.python.lib.supabase_client import supabase

logger = logging.getLogger(__name__)


class RSSProcessorEnhanced:
    """
    Enhanced RSS Feed Processor with database integration.
    Processes RSS feeds and stores hazards in Supabase with duplicate detection.
    
    Security Features:
    - URL validation (blocks localhost, private IPs)
    - Content hash generation for duplicate detection
    - Input sanitization (HTML cleaning)
    - Philippine boundary validation
    
    Duplicate Detection Strategies:
    1. Exact URL match (fastest)
    2. Content hash match (within time window)
    3. Geographic + temporal proximity (5km radius, configurable time window)
    """
    
    # Default Philippine news RSS feeds
    
    # Cache for system config thresholds (refreshed per processing session)
    _confidence_threshold_rss = None
    _confidence_threshold_citizen = None
    DEFAULT_FEEDS = [
        'https://www.gmanetwork.com/news/rss/news/',
        'https://www.gmanetwork.com/news/rss/publicaffairs/',
        'https://newsinfo.inquirer.net/category/regions/feed',
        'https://www.rappler.com/nation/rss',
    ]
    
    def __init__(self, classification_threshold: float = 0.5, duplicate_time_window_hours: int = 48):
        """
        Initialize Enhanced RSS Processor.
        
        Args:
            classification_threshold: Minimum confidence for hazard classification (default: 0.5)
            duplicate_time_window_hours: Time window for duplicate detection (default: 48 hours)
        """
        self.feeds = []
        self.classification_threshold = classification_threshold
        self.duplicate_time_window = duplicate_time_window_hours
        
        # Statistics tracking
        self.stats = {
            'total_processed': 0,
            'total_stored': 0,
            'duplicates_detected': 0,
            'errors': 0
        }
        
        logger.info(f"Initialized Enhanced RSS Processor (threshold: {classification_threshold}, "
                   f"duplicate_window: {duplicate_time_window_hours}h)")
    
    def set_feeds(self, feed_urls: List[str]):
        """
        Set the RSS feed URLs to process.
        Validates URLs before storing.
        
        Args:
            feed_urls: List of RSS feed URLs
        """
        validated_feeds = [url for url in feed_urls if self._validate_url(url)]
        self.feeds = validated_feeds
        logger.info(f"Set {len(validated_feeds)}/{len(feed_urls)} valid RSS feeds")
    
    def _get_confidence_thresholds(self) -> Tuple[float, float]:
        """
        Fetch confidence thresholds from system_config table.
        Uses cached values if available for performance.
        
        Returns:
            tuple: (rss_threshold, citizen_threshold)
        """
        try:
            # Return cached values if available
            if self._confidence_threshold_rss is not None and self._confidence_threshold_citizen is not None:
                return self._confidence_threshold_rss, self._confidence_threshold_citizen
            
            # Fetch from database
            response = supabase.schema('gaia').from_('system_config').select('config_key, config_value').in_('config_key', ['confidence_threshold_rss', 'confidence_threshold_citizen']).execute()
            
            if response.data:
                for config in response.data:
                    if config['config_key'] == 'confidence_threshold_rss':
                        self._confidence_threshold_rss = float(config['config_value'])
                    elif config['config_key'] == 'confidence_threshold_citizen':
                        self._confidence_threshold_citizen = float(config['config_value'])
                
                logger.info(f"Fetched confidence thresholds: RSS={self._confidence_threshold_rss}, Citizen={self._confidence_threshold_citizen}")
            
            # Use defaults if not found
            if self._confidence_threshold_rss is None:
                self._confidence_threshold_rss = 0.70
                logger.warning(f"Using default RSS threshold: {self._confidence_threshold_rss}")
            if self._confidence_threshold_citizen is None:
                self._confidence_threshold_citizen = 0.50
                logger.warning(f"Using default citizen threshold: {self._confidence_threshold_citizen}")
            
            return self._confidence_threshold_rss, self._confidence_threshold_citizen
            
        except Exception as e:
            logger.error(f"Error fetching confidence thresholds: {str(e)}")
            # Fallback to defaults
            return 0.70, 0.50
    
    async def process_all_feeds(self) -> List[Dict]:
        """
        Process all configured RSS feeds asynchronously.
        
        Returns:
            list: Processing results for each feed with statistics
        """
        if not self.feeds:
            self.feeds = self.DEFAULT_FEEDS
            logger.info(f"Using default feeds: {len(self.feeds)} sources")
        
        # Reset statistics
        self.stats = {
            'total_processed': 0,
            'total_stored': 0,
            'duplicates_detected': 0,
            'errors': 0
        }
        
        # Track normalized titles within this batch to catch cross-feed duplicates
        self._batch_seen_titles: set = set()
        
        results = []
        
        for feed_url in self.feeds:
            result = await self.process_feed(feed_url)
            results.append(result)
        
        logger.info(f"RSS Processing Complete - Processed: {self.stats['total_processed']}, "
                   f"Stored: {self.stats['total_stored']}, "
                   f"Duplicates: {self.stats['duplicates_detected']}, "
                   f"Errors: {self.stats['errors']}")
        
        return results
    
    async def process_feed(self, feed_url: str) -> Dict:
        """
        Process a single RSS feed with database integration.
        
        Args:
            feed_url: URL of the RSS feed
            
        Returns:
            dict: Processing results
                {
                    'feed_url': str,
                    'status': 'success' | 'error',
                    'items_processed': int,
                    'items_added': int,
                    'duplicates_detected': int,
                    'hazards_saved': list[dict],
                    'processing_time': float,
                    'error_message': str (optional)
                }
        """
        start_time = time.time()
        items_processed = 0
        items_added = 0
        duplicates_detected = 0
        hazards_saved = []
        
        logger.info(f"Processing RSS feed: {feed_url}")
        
        try:
            # Parse RSS feed (run in thread pool to avoid blocking)
            loop = asyncio.get_event_loop()
            feed = await loop.run_in_executor(None, feedparser.parse, feed_url)
            
            if feed.bozo:
                logger.warning(f"Feed parsing warning for {feed_url}: {feed.bozo_exception}")
            
            # Process each entry
            for entry in feed.entries:
                items_processed += 1
                self.stats['total_processed'] += 1
                
                try:
                    # Extract content
                    content_data = self._extract_content(entry)
                    
                    # Skip if no content
                    if not content_data['text'].strip():
                        logger.debug(f"Skipping entry with no content: {entry.get('title', 'Unknown')}")
                        continue
                    
                    # Classify content
                    classification = classifier.classify(
                        content_data['text'],
                        threshold=self.classification_threshold
                    )
                    
                    # Only process if classified as hazard
                    if classification['is_hazard']:
                        # Extract locations
                        locations = geo_ner.extract_locations(content_data['text'])
                        
                        # Only save if locations were found
                        if locations:
                            # Map classifier type to DB type for dedup
                            _type_map = {
                                'flooding': 'flood', 'fire': 'fire',
                                'earthquake': 'earthquake', 'typhoon': 'typhoon',
                                'landslide': 'landslide', 'volcanic eruption': 'volcanic_eruption',
                                'drought': 'drought', 'tsunami': 'tsunami',
                                'storm surge': 'storm_surge', 'tornado': 'tornado',
                            }
                            db_hazard_type = _type_map.get(
                                (classification.get('hazard_type') or '').lower(), 'other'
                            )

                            # Check for duplicates before saving
                            is_duplicate, duplicate_id = await self._check_duplicate(
                                entry.get('link', ''),
                                content_data,
                                locations[0] if locations else None,
                                hazard_type=db_hazard_type
                            )
                            
                            if is_duplicate:
                                logger.info(f"Duplicate detected: {entry.get('title', 'Unknown')} (matches {duplicate_id})")
                                duplicates_detected += 1
                                self.stats['duplicates_detected'] += 1
                                continue
                            
                            # Save to database
                            hazard_id = await self._save_hazard_to_db(
                                entry,
                                content_data,
                                classification,
                                locations,
                                feed_url
                            )
                            
                            if hazard_id:
                                hazard_summary = {
                                    'id': hazard_id,
                                    'title': content_data['title'],
                                    'hazard_type': classification['hazard_type'],
                                    'confidence_score': classification['score'],
                                    'location': locations[0] if locations else None
                                }
                                hazards_saved.append(hazard_summary)
                                items_added += 1
                                self.stats['total_stored'] += 1
                                
                                # Track title in batch set to prevent cross-feed duplicates
                                if hasattr(self, '_batch_seen_titles') and content_data.get('title'):
                                    self._batch_seen_titles.add(' '.join(content_data['title'].lower().split()))
                                
                                logger.info(f"✓ Saved hazard: {content_data['title']} (ID: {hazard_id})")
                            else:
                                logger.error(f"✗ Failed to save hazard: {entry.get('title', 'Unknown')}")
                                self.stats['errors'] += 1
                        else:
                            logger.debug(f"No locations found for: {entry.get('title', 'Unknown')}")
                    else:
                        logger.debug(f"Not classified as hazard: {entry.get('title', 'Unknown')}")
                        
                except Exception as e:
                    logger.error(f"Error processing entry {entry.get('link', 'unknown')}: {str(e)}")
                    self.stats['errors'] += 1
                    continue
            
            # Calculate processing time
            processing_time = time.time() - start_time
            
            logger.info(f"Completed {feed_url}: {items_added}/{items_processed} hazards saved "
                       f"({duplicates_detected} duplicates)")
            
            return {
                'feed_url': feed_url,
                'status': 'success',
                'items_processed': items_processed,
                'items_added': items_added,
                'duplicates_detected': duplicates_detected,
                'hazards_saved': hazards_saved,
                'processing_time': processing_time
            }
            
        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = str(e)
            
            logger.error(f"Error processing feed {feed_url}: {error_msg}")
            self.stats['errors'] += 1
            
            return {
                'feed_url': feed_url,
                'status': 'error',
                'error_message': error_msg,
                'items_processed': items_processed,
                'items_added': items_added,
                'duplicates_detected': duplicates_detected,
                'hazards_saved': hazards_saved,
                'processing_time': processing_time
            }
    
    def _extract_content(self, entry: feedparser.FeedParserDict) -> Dict:
        """
        Extract and clean content from RSS entry.
        
        Args:
            entry: feedparser entry object
            
        Returns:
            dict: Extracted content with sanitized HTML
        """
        # Get title
        title = entry.get('title', '')
        
        # Get description/summary
        description = entry.get('summary', '') or entry.get('description', '')
        
        # Get full content if available
        content = ''
        if hasattr(entry, 'content'):
            content = entry.content[0].value if entry.content else ''
        
        # Clean HTML from content (security: remove tags)
        description_clean = self._clean_html(description)
        content_clean = self._clean_html(content)
        
        # Combine for analysis (title has most important keywords)
        full_text = f"{title}. {description_clean} {content_clean}".strip()
        
        return {
            'title': title,
            'description': description_clean,
            'content': content_clean,
            'text': full_text
        }
    
    def _clean_html(self, html_text: str) -> str:
        """
        Remove HTML tags and clean text (security: prevent XSS).
        
        Args:
            html_text: HTML text to clean
            
        Returns:
            str: Sanitized plain text
        """
        if not html_text:
            return ''
        
        # Parse and extract text only
        soup = BeautifulSoup(html_text, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        return text
    
    def _generate_content_hash(self, content_data: Dict) -> str:
        """
        Generate SHA-256 hash of content for duplicate detection.
        
        Args:
            content_data: Extracted content dict
            
        Returns:
            str: SHA-256 hash (64 characters)
        """
        # Combine title and description for hashing
        combined_text = f"{content_data['title']}{content_data['description']}"
        
        # Normalize: lowercase, remove extra whitespace
        normalized = ' '.join(combined_text.lower().split())
        
        # Generate hash
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    
    def _validate_url(self, url: str) -> bool:
        """
        Validate RSS feed URL for security.
        Blocks localhost, private IPs, and invalid schemes.
        
        Args:
            url: URL to validate
            
        Returns:
            bool: True if valid and safe, False otherwise
        """
        if not url:
            return False
        
        try:
            parsed = urlparse(url)
            
            # Must have scheme and netloc
            if not parsed.scheme or not parsed.netloc:
                return False
            
            # Only allow http/https
            if parsed.scheme not in ['http', 'https']:
                logger.warning(f"Blocked non-HTTP scheme: {url}")
                return False
            
            # Block localhost and private IPs (security)
            blocked_hosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1']
            if any(blocked in parsed.netloc.lower() for blocked in blocked_hosts):
                logger.warning(f"Blocked localhost URL: {url}")
                return False
            
            # Block private IP ranges (basic check)
            if re.match(r'^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\.', parsed.netloc):
                logger.warning(f"Blocked private IP: {url}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"URL validation error: {str(e)}")
            return False
    
    def _normalize_url(self, url: str) -> str:
        """
        Normalize URL for deduplication by stripping tracking parameters
        so the same article with different UTM tags is caught as a duplicate.
        """
        if not url:
            return ''
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            tracking_params = {
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid',
            }
            filtered_params = {k: v for k, v in params.items() if k.lower() not in tracking_params}
            clean_query = urlencode(filtered_params, doseq=True)
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if clean_query:
                clean_url += f"?{clean_query}"
            return clean_url.rstrip('/')
        except Exception:
            return url

    def _normalize_title_for_dedup(self, title: str) -> str:
        """
        Aggressively normalize title for fuzzy deduplication.
        Strips common prefixes, punctuation, and extra whitespace.
        """
        if not title:
            return ''
        normalized = ' '.join(title.lower().split())
        normalized = re.sub(
            r'^(?:breaking|look|just\s+in|update|updated|watch|read|live|alert)\s*:\s*',
            '', normalized
        )
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = ' '.join(normalized.split())
        return normalized

    def _titles_are_similar(self, title1: str, title2: str, threshold: float = 0.65) -> bool:
        """
        Check if two titles are similar enough to be duplicates using
        Jaccard word-overlap similarity.
        """
        if not title1 or not title2:
            return False
        words1 = set(self._normalize_title_for_dedup(title1).split())
        words2 = set(self._normalize_title_for_dedup(title2).split())
        if len(words1) < 3 or len(words2) < 3:
            return False
        intersection = words1 & words2
        union = words1 | words2
        similarity = len(intersection) / len(union) if union else 0
        return similarity >= threshold

    async def _check_duplicate(
        self,
        url: str,
        content_data: Dict,
        location: Optional[Dict],
        hazard_type: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if hazard already exists in database using multiple strategies.
        
        Strategies:
        1. Exact URL match + normalized URL match (fastest, most reliable)
        2. Exact article title match within time window
        3. Content hash match within time window
        4. Fuzzy title similarity match within time window
        5. Geographic + temporal proximity (5km radius, same hazard type)
        
        Args:
            url: Article URL
            content_data: Extracted content
            location: Primary location from Geo-NER
            hazard_type: Classified hazard type (for geographic proximity filtering)
            
        Returns:
            tuple: (is_duplicate: bool, duplicate_id: str | None)
        """
        try:
            time_threshold = datetime.utcnow() - timedelta(hours=self.duplicate_time_window)

            # Strategy 1: Check exact URL (fastest)
            if url:
                response = supabase.schema('gaia').from_('hazards').select('id').eq('source_url', url).limit(1).execute()
                if response.data:
                    return True, response.data[0]['id']

                # Strategy 1b: Check normalized URL (strips tracking params)
                normalized_url = self._normalize_url(url)
                if normalized_url and normalized_url != url:
                    response = supabase.schema('gaia').from_('hazards').select('id, source_url') \
                        .gte('detected_at', time_threshold.isoformat()) \
                        .eq('source_type', 'rss') \
                        .limit(500) \
                        .execute()
                    if response.data:
                        for row in response.data:
                            if self._normalize_url(row.get('source_url', '')) == normalized_url:
                                return True, row['id']
            
            # Strategy 2: Check exact article title (no time window - exact title = always duplicate)
            if content_data.get('title'):
                normalized_title = ' '.join(content_data['title'].lower().split())
                
                # Check in-memory batch set first (catches same-batch duplicates across feeds)
                if hasattr(self, '_batch_seen_titles') and normalized_title in self._batch_seen_titles:
                    logger.info(f"Batch-level duplicate title: '{normalized_title[:60]}'")
                    return True, None
                
                response = supabase.schema('gaia').from_('hazards') \
                    .select('id') \
                    .eq('source_title', normalized_title) \
                    .limit(1) \
                    .execute()
                
                if response.data:
                    return True, response.data[0]['id']
            
            # Strategy 3: Check content hash within time window
            content_hash = self._generate_content_hash(content_data)
            
            response = supabase.schema('gaia').from_('hazards') \
                .select('id') \
                .eq('content_hash', content_hash) \
                .gte('detected_at', time_threshold.isoformat()) \
                .limit(1) \
                .execute()
            
            if response.data:
                return True, response.data[0]['id']

            # Strategy 4: Fuzzy title similarity within time window
            if content_data.get('title') and len(content_data['title']) > 15:
                response = supabase.schema('gaia').from_('hazards') \
                    .select('id, source_title') \
                    .gte('detected_at', time_threshold.isoformat()) \
                    .eq('source_type', 'rss') \
                    .limit(300) \
                    .execute()

                if response.data:
                    for row in response.data:
                        existing_title = row.get('source_title', '')
                        if existing_title and self._titles_are_similar(content_data['title'], existing_title):
                            logger.info(f"Fuzzy title match: '{content_data['title'][:60]}' ~ '{existing_title[:60]}'")
                            return True, row['id']
            
            # Strategy 5: Location + time window + same hazard type (within 5km radius)
            if location and location.get('latitude') and location.get('longitude'):
                try:
                    response = supabase.schema('gaia').rpc(
                        'get_nearby_hazards',
                        {
                            'ref_lat': location['latitude'],
                            'ref_lng': location['longitude'],
                            'radius_km': 5.0,
                            'time_window_hours': self.duplicate_time_window
                        }
                    ).execute()
                    
                    if response.data:
                        for nearby in response.data:
                            nearby_type = nearby.get('hazard_type', '')
                            if hazard_type and nearby_type == hazard_type:
                                return True, nearby.get('hazard_id') or nearby.get('id')
                except Exception as rpc_err:
                    logger.warning(f"Geographic dedup RPC failed: {rpc_err}")
            
            return False, None
            
        except Exception as e:
            logger.error(f"Duplicate check error: {str(e)}", exc_info=True)
            return False, None
    
    async def _save_hazard_to_db(
        self,
        entry: feedparser.FeedParserDict,
        content_data: Dict,
        classification: Dict,
        locations: List[Dict],
        feed_url: str
    ) -> Optional[str]:
        """
        Save hazard to Supabase gaia.hazards table.
        
        Args:
            entry: RSS entry
            content_data: Extracted content
            classification: Classification result
            locations: Extracted locations
            feed_url: Source feed URL
            
        Returns:
            str: Hazard UUID if successful, None otherwise
        """
        try:
            # Parse published date (timezone-aware; default to PHT for Philippine feeds)
            PHT = timezone(timedelta(hours=8))
            published_date = None
            if hasattr(entry, 'published') and entry.published:
                try:
                    parsed = date_parser.parse(entry.published)
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=PHT)
                    published_date = parsed
                except Exception:
                    pass
            if published_date is None and hasattr(entry, 'published_parsed') and entry.published_parsed:
                published_date = datetime(*entry.published_parsed[:6], tzinfo=PHT)
            
            # Use primary location (first one with coordinates)
            primary_location = None
            for loc in locations:
                if loc.get('latitude') and loc.get('longitude'):
                    primary_location = loc
                    break
            
            if not primary_location:
                logger.error(f"No valid location coordinates for: {content_data['title']}")
                return None
            
            # Validate coordinates are within Philippines
            lat = primary_location['latitude']
            lng = primary_location['longitude']
            
            if not (4.0 <= lat <= 22.0 and 116.0 <= lng <= 127.0):
                logger.warning(f"Location outside Philippines for: {content_data['title']}")
                return None
            
            # Generate content hash for duplicate detection
            content_hash = self._generate_content_hash(content_data)
            
            # Map classifier output to database enum values
            hazard_type_mapping = {
                'flooding': 'flood',
                'fire': 'fire',
                'earthquake': 'earthquake',
                'typhoon': 'typhoon',
                'landslide': 'landslide',
                'volcanic eruption': 'volcanic_eruption',
                'drought': 'drought',
                'tsunami': 'tsunami',
                'storm surge': 'storm_surge',
                'tornado': 'tornado',
                'other': 'other'  # Explicit mapping for other category
            }
            db_hazard_type = hazard_type_mapping.get(
                classification['hazard_type'].lower(),
                'other'  # Default if not found
            )
            
            # Fetch confidence thresholds and determine auto-validation
            rss_threshold, _ = self._get_confidence_thresholds()
            confidence_score = classification['score']
            auto_validated = confidence_score >= rss_threshold
            
            if auto_validated:
                logger.info(f"Auto-validating hazard (confidence: {confidence_score:.4f} >= threshold: {rss_threshold})")
            
            # Normalize title for consistent duplicate detection (lowercase, remove extra whitespace)
            normalized_title = ' '.join(content_data['title'].lower().split()) if content_data.get('title') else ''
            
            # Build hazard data for database
            hazard_data = {
                'hazard_type': db_hazard_type,
                'severity': None,  # Could be derived from classification score
                'status': 'active',
                'location': f'POINT({lng} {lat})',  # PostGIS geometry (longitude first!)
                'latitude': lat,
                'longitude': lng,
                'location_name': primary_location.get('location_name', ''),
                'admin_division': primary_location.get('region', '') or primary_location.get('province', '') or primary_location.get('city', ''),
                'confidence_score': confidence_score,
                'model_version': classifier.get_active_model(),
                'source_type': 'rss',
                'source_url': entry.get('link', ''),
                'source_title': normalized_title,  # Store normalized for duplicate detection
                'source_content': content_data['text'][:1000],  # Limit to 1000 chars
                'source_published_at': published_date.isoformat() if published_date else None,
                'validated': auto_validated,  # Auto-validate if above threshold
                'validated_at': datetime.utcnow().isoformat() if auto_validated else None,
                'validation_notes': f'Auto-validated (confidence {confidence_score:.4f} >= {rss_threshold})' if auto_validated else None,
                'detected_at': datetime.utcnow().isoformat(),
                'content_hash': content_hash,
                'source': feed_url  # Track which feed it came from
            }
            
            # Insert into database
            response = supabase.schema('gaia').from_('hazards').insert(hazard_data).execute()
            
            if response.data and len(response.data) > 0:
                hazard_id = response.data[0]['id']
                logger.info(f"Database insert successful: {hazard_id}")
                return hazard_id
            else:
                logger.error(f"Database insert returned no data")
                return None
            
        except Exception as e:
            logger.error(f"Error saving hazard to database: {str(e)}", exc_info=True)
            return None
    
    def get_statistics(self) -> Dict:
        """
        Get processing statistics.
        
        Returns:
            dict: Statistics with totals and percentages
        """
        total = self.stats['total_processed']
        if total == 0:
            duplicate_rate = 0
            error_rate = 0
        else:
            duplicate_rate = (self.stats['duplicates_detected'] / total) * 100
            error_rate = (self.stats['errors'] / total) * 100
        
        return {
            **self.stats,
            'duplicate_rate_percent': round(duplicate_rate, 2),
            'error_rate_percent': round(error_rate, 2)
        }


# Global enhanced RSS processor instance
rss_processor_enhanced = RSSProcessorEnhanced()
