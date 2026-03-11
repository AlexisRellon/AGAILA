"""
RSS Feed Processor for GAIA
Fetches and processes RSS feeds from Philippine news sources.
Integrates with Classifier and Geo-NER for hazard detection pipeline.
"""

import feedparser
import time
from datetime import datetime, timedelta, timezone
from dateutil import parser as date_parser
from bs4 import BeautifulSoup
import logging
import asyncio
from typing import Dict, List, Optional
import os

# Import AI models
from backend.python.models.classifier import classifier
from backend.python.models.geo_ner import geo_ner

# Note: Supabase integration will be added when connecting to database
# For now, this module processes RSS feeds and returns structured data

logger = logging.getLogger(__name__)


class RSSProcessor:
    """
    Process RSS feeds and extract environmental hazard information.
    Integrates Zero-Shot Classification and Geo-NER for hazard detection.
    """
    
    # Default Philippine news RSS feeds
    DEFAULT_FEEDS = [
        'https://data.gmanetwork.com/gno/rss/news/nation/feed.xml',
        'https://data.gmanetwork.com/gno/rss/news/metro/feed.xml',
        'https://www.rappler.com/nation/rss',
    ]
    
    def __init__(self, classification_threshold: float = 0.5):
        """
        Initialize RSS Processor.
        
        Args:
            classification_threshold: Minimum confidence for hazard classification
        """
        self.feeds = []
        self.classification_threshold = classification_threshold
        
    def set_feeds(self, feed_urls: List[str]):
        """Set the RSS feed URLs to process"""
        self.feeds = feed_urls
        logger.info(f"Set {len(feed_urls)} RSS feeds for processing")
    
    async def process_all_feeds(self) -> List[Dict]:
        """
        Process all configured RSS feeds asynchronously.
        
        Returns:
            list: Processing results for each feed
        """
        if not self.feeds:
            self.feeds = self.DEFAULT_FEEDS
            logger.info(f"Using default feeds: {len(self.feeds)} sources")
        
        results = []
        
        for feed_url in self.feeds:
            result = await self.process_feed(feed_url)
            results.append(result)
        
        return results
    
    async def process_feed(self, feed_url: str) -> Dict:
        """
        Process a single RSS feed.
        
        Args:
            feed_url: URL of the RSS feed
            
        Returns:
            dict: Processing results
                {
                    'feed_url': str,
                    'status': 'success' | 'error',
                    'items_processed': int,
                    'items_added': int,
                    'hazards_found': list,
                    'processing_time': float,
                    'error_message': str (optional)
                }
        """
        start_time = time.time()
        items_processed = 0
        items_added = 0
        hazards_found = []
        
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
                
                try:
                    # Extract content
                    content_data = self._extract_content(entry)
                    
                    # Skip if no content
                    if not content_data['text'].strip():
                        logger.debug(f"Skipping entry with no content: {entry.get('title', 'Unknown')}")
                        continue
                    
                    # Classify content (run in thread pool to avoid blocking event loop)
                    classification = await loop.run_in_executor(
                        None,
                        classifier.classify,
                        content_data['text'],
                        self.classification_threshold
                    )
                    
                    # Only process if classified as hazard
                    if classification['is_hazard']:
                        # Wildfire filter: if classified as fire, the classifier
                        # already validates it's a wildfire. Double-check by logging.
                        if classification.get('hazard_type') == 'fire':
                            logger.info(f"Fire article passed wildfire filter: {entry.get('title', 'Unknown')}")

                        # Extract locations (run in thread pool to avoid blocking event loop)
                        locations = await loop.run_in_executor(
                            None,
                            geo_ner.extract_locations,
                            content_data['text']
                        )
                        
                        # Only save if locations were found
                        if locations:
                            hazard_data = self._create_hazard_data(
                                entry,
                                content_data,
                                classification,
                                locations,
                                feed_url
                            )
                            
                            hazards_found.append(hazard_data)
                            items_added += 1
                            logger.info(f"Found hazard: {hazard_data['title']}")
                        else:
                            logger.debug(f"No locations found for: {entry.get('title', 'Unknown')}")
                    else:
                        logger.debug(f"Not classified as hazard: {entry.get('title', 'Unknown')}")
                        
                except Exception as e:
                    logger.error(f"Error processing entry {entry.get('link', 'unknown')}: {str(e)}")
                    continue
            
            # Calculate processing time
            processing_time = time.time() - start_time
            
            logger.info(f"Completed processing {feed_url}: {items_added}/{items_processed} hazards found")
            
            return {
                'feed_url': feed_url,
                'status': 'success',
                'items_processed': items_processed,
                'items_added': items_added,
                'hazards_found': hazards_found,
                'processing_time': processing_time
            }
            
        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = str(e)
            
            logger.error(f"Error processing feed {feed_url}: {error_msg}")
            
            return {
                'feed_url': feed_url,
                'status': 'error',
                'error_message': error_msg,
                'items_processed': items_processed,
                'items_added': items_added,
                'hazards_found': hazards_found,
                'processing_time': processing_time
            }
    
    def _extract_content(self, entry: feedparser.FeedParserDict) -> Dict:
        """
        Extract and clean content from RSS entry.
        
        Args:
            entry: feedparser entry object
            
        Returns:
            dict: Extracted content
                {
                    'title': str,
                    'description': str,
                    'content': str,
                    'text': str (combined for analysis)
                }
        """
        # Get title
        title = entry.get('title', '')
        
        # Get description/summary
        description = entry.get('summary', '') or entry.get('description', '')
        
        # Get full content if available
        content = ''
        if hasattr(entry, 'content'):
            content = entry.content[0].value if entry.content else ''
        
        # Clean HTML from content
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
        Remove HTML tags and clean text.
        
        Args:
            html_text: HTML text to clean
            
        Returns:
            str: Cleaned text
        """
        if not html_text:
            return ''
        
        soup = BeautifulSoup(html_text, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        return text
    
    def _create_hazard_data(
        self,
        entry: feedparser.FeedParserDict,
        content_data: Dict,
        classification: Dict,
        locations: List[Dict],
        feed_url: str
    ) -> Dict:
        """
        Create hazard data structure from processed entry.
        
        Args:
            entry: RSS entry
            content_data: Extracted content
            classification: Classification result
            locations: Extracted locations
            feed_url: Source feed URL
            
        Returns:
            dict: Hazard data ready for database insertion
        """
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
        
        # Build hazard data structure
        hazard_data = {
            'title': content_data['title'],
            'description': content_data['description'],
            'content': content_data['content'],
            'url': entry.get('link', ''),
            'hazard_type': classification['hazard_type'],
            'classification_score': classification['score'],
            'source': feed_url,
            'published_date': published_date.isoformat() if published_date else None,
            'locations': locations,
            'processed_at': datetime.utcnow().isoformat()
        }
        
        return hazard_data


# Global RSS processor instance (FastAPI pattern - reuse across requests)
rss_processor = RSSProcessor()
