# GAIA Backend Development - MCP Tools Guide

## Documentation Guidelines

**CRITICAL**: When creating documentation for backend work:

- **Implementation guides** → `docs/guides/BACKEND_*.md`
- **Setup documentation** → `docs/setup/DATABASE_*.md` or `docs/setup/API_*.md`
- **Security findings** → `docs/security/BACKEND_SECURITY_*.md`
- **Completion reports** → `docs/implementation/archive/*_COMPLETE.md`
- **Analysis documents** → `docs/research/*_ANALYSIS.md`

**NEVER** create `.md` files in:
- Project root (except MODULE_CHECKLIST.md, README.md, AGENTS.md)
- `backend/` directory (except this file and backend/AGENTS.md)

Always update `docs/README.md` when adding new documentation.

## Backend-Specific Context
You are working in the **backend** folder of the GAIA project, focusing on AI/ML pipeline, data processing, and API services.

**Tech Stack**:
- Python 3.11+ (FastAPI/Flask)
- Transformers (Hugging Face)
- spaCy/NLTK for preprocessing
- PostgreSQL + PostGIS (via Supabase)
- Docker containerized services

**Module Focus**:
- Core AI Pipeline (Climate-NLI, Geo-NER)
- RSS Aggregation (EDI-01)
- Citizen Report Processing (CR-02, CR-03, CR-04)
- Geospatial Validation (PostGIS)
- Data Quality & Governance (DQG-0x)
- API Endpoints (FastAPI)

## Primary MCP Tools for Backend

### 1. Hugging Face MCP - Model Discovery & Integration

#### When to Use
- Searching for Climate-NLI models (zero-shot classification)
- Finding Geo-NER models for Philippine locations
- Discovering disaster/hazard datasets
- Researching geospatial ML papers
- Getting model documentation and examples

#### Step-by-Step Workflow

**Step 1: Search for Models**
```bash
# Search for Climate-NLI models
@hf model_search query="climate natural language inference zero-shot" task="zero-shot-classification"

# Search for NER models
@hf model_search query="named entity recognition location geospatial" task="token-classification"

# Search for Philippine-specific models
@hf model_search query="Philippines disaster typhoon flood"
```

**Step 2: Get Model Details**
```bash
@hf hub_repo_details repo_id="climatebert/distilroberta-base-climate-f"
@hf hub_repo_details repo_id="dslim/bert-base-NER"
```

**Step 3: Search for Datasets**
```bash
@hf dataset_search query="Philippines disaster natural hazard climate"
@hf dataset_search query="named entity recognition locations"
```

**Step 4: Research Papers**
```bash
@hf paper_search query="zero-shot climate event classification"
@hf paper_search query="geospatial named entity recognition"
```

**Step 5: Get Documentation**
```bash
@hf doc_search query="transformers pipeline zero shot classification"
```

#### Example: Implementing Climate-NLI Model

```python
# 1. Search for appropriate models
@hf model_search query="climate zero-shot classification" task="zero-shot-classification"

# 2. Get model details and usage
@hf hub_repo_details repo_id="climatebert/distilroberta-base-climate-f"

# 3. Get documentation
@hf doc_search query="zero shot classification pipeline parameters"

# 4. Implement in backend/python/models/climate_nli.py
```

```python
"""
Climate-NLI Model for Hazard Classification
Uses zero-shot classification to detect hazard types from text.
"""

from transformers import pipeline
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)


class ClimateNLIClassifier:
    """Zero-shot classifier for climate/hazard events"""
    
    # Hazard categories for Philippine context
    HAZARD_LABELS = [
        "typhoon",
        "flood",
        "earthquake",
        "landslide",
        "volcanic eruption",
        "drought",
        "storm surge",
        "fire",
    ]
    
    def __init__(self, model_name: str = "facebook/bart-large-mnli"):
        """
        Initialize the climate-NLI classifier
        
        Args:
            model_name: Hugging Face model ID for zero-shot classification
        """
        logger.info(f"Loading Climate-NLI model: {model_name}")
        
        self.classifier = pipeline(
            "zero-shot-classification",
            model=model_name,
            device=-1  # CPU, use device=0 for GPU
        )
        
        logger.info("Climate-NLI model loaded successfully")
    
    def classify_hazard(
        self, 
        text: str, 
        candidate_labels: List[str] = None,
        multi_label: bool = False
    ) -> Dict[str, float]:
        """
        Classify hazard type from text
        
        Args:
            text: Input text (news article, citizen report)
            candidate_labels: List of hazard types to classify against
            multi_label: Whether to allow multiple hazard classifications
            
        Returns:
            Dictionary mapping hazard types to confidence scores
        """
        if candidate_labels is None:
            candidate_labels = self.HAZARD_LABELS
        
        try:
            # Run zero-shot classification
            result = self.classifier(
                text,
                candidate_labels=candidate_labels,
                multi_label=multi_label
            )
            
            # Format results
            classifications = {
                label: score
                for label, score in zip(result["labels"], result["scores"])
            }
            
            logger.debug(f"Classification results: {classifications}")
            return classifications
            
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            raise
    
    def get_top_hazard(self, text: str) -> Tuple[str, float]:
        """
        Get the most likely hazard type
        
        Args:
            text: Input text
            
        Returns:
            Tuple of (hazard_type, confidence_score)
        """
        classifications = self.classify_hazard(text)
        
        # Get highest confidence classification
        top_hazard = max(classifications.items(), key=lambda x: x[1])
        
        logger.info(f"Top hazard: {top_hazard[0]} ({top_hazard[1]:.2%} confidence)")
        return top_hazard


# Usage example
if __name__ == "__main__":
    classifier = ClimateNLIClassifier()
    
    # Test with sample text
    text = """
    Heavy rainfall in Metro Manila has caused severe flooding in several areas.
    Residents are evacuating low-lying communities as water levels continue to rise.
    """
    
    hazard_type, confidence = classifier.get_top_hazard(text)
    print(f"Detected: {hazard_type} (confidence: {confidence:.2%})")
```

```bash
# 5. Add dependencies to requirements.txt
docker-compose run backend pip install transformers torch

# 6. Test the model
docker-compose run backend pytest tests/python/unit/test_climate_nli.py
```

#### Example: Implementing Geo-NER Model

```bash
# 1. Search for NER models
@hf model_search query="named entity recognition multilingual" task="token-classification"

# 2. Get model details
@hf hub_repo_details repo_id="dslim/bert-base-NER"

# 3. Search for Philippine location datasets
@hf dataset_search query="Philippines locations cities provinces"

# 4. Implement in backend/python/models/geo_ner.py
```

```python
"""
Geo-NER Model for Philippine Location Extraction
Extracts location entities from text with focus on Philippine administrative divisions.
"""

from transformers import pipeline, AutoTokenizer, AutoModelForTokenClassification
from typing import List, Dict, Tuple
import re
import logging

logger = logging.getLogger(__name__)


class GeoNER:
    """Named Entity Recognition for Philippine locations"""
    
    def __init__(self, model_name: str = "dslim/bert-base-NER"):
        """
        Initialize Geo-NER model
        
        Args:
            model_name: Hugging Face model ID for NER
        """
        logger.info(f"Loading Geo-NER model: {model_name}")
        
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForTokenClassification.from_pretrained(model_name)
        
        self.ner_pipeline = pipeline(
            "ner",
            model=self.model,
            tokenizer=self.tokenizer,
            aggregation_strategy="simple"
        )
        
        logger.info("Geo-NER model loaded successfully")
    
    def extract_locations(self, text: str) -> List[Dict[str, any]]:
        """
        Extract location entities from text
        
        Args:
            text: Input text
            
        Returns:
            List of location entities with confidence scores
        """
        try:
            # Run NER
            entities = self.ner_pipeline(text)
            
            # Filter for location entities (LOC, GPE)
            locations = [
                {
                    "location": entity["word"],
                    "confidence": entity["score"],
                    "start": entity["start"],
                    "end": entity["end"]
                }
                for entity in entities
                if entity["entity_group"] in ["LOC", "GPE"]
            ]
            
            logger.debug(f"Extracted {len(locations)} locations")
            return locations
            
        except Exception as e:
            logger.error(f"Location extraction failed: {e}")
            raise
    
    def extract_philippine_locations(self, text: str) -> List[Dict[str, any]]:
        """
        Extract locations and validate against Philippine administrative divisions
        
        Args:
            text: Input text
            
        Returns:
            List of validated Philippine locations
        """
        # Extract all locations
        locations = self.extract_locations(text)
        
        # Filter for Philippine locations (to be validated against PostGIS)
        philippine_locations = []
        
        for loc in locations:
            location_name = loc["location"]
            
            # Pattern matching for Philippine locations
            if self._is_philippine_location(location_name):
                philippine_locations.append(loc)
                logger.debug(f"Philippine location detected: {location_name}")
        
        return philippine_locations
    
    def _is_philippine_location(self, location: str) -> bool:
        """
        Check if location name matches Philippine patterns
        
        Args:
            location: Location name
            
        Returns:
            True if likely Philippine location
        """
        # Common Philippine location patterns
        patterns = [
            r"Manila",
            r"Quezon City",
            r"Cebu",
            r"Davao",
            r"Luzon",
            r"Visayas",
            r"Mindanao",
            r"Region \d+",
            r"NCR",
            r".*\s+City$",
            r".*\s+Province$",
        ]
        
        for pattern in patterns:
            if re.search(pattern, location, re.IGNORECASE):
                return True
        
        return False
    
    def get_primary_location(self, text: str) -> Tuple[str, float]:
        """
        Get the most confident location mention
        
        Args:
            text: Input text
            
        Returns:
            Tuple of (location_name, confidence_score)
        """
        locations = self.extract_philippine_locations(text)
        
        if not locations:
            logger.warning("No Philippine locations detected")
            return None, 0.0
        
        # Get highest confidence location
        primary = max(locations, key=lambda x: x["confidence"])
        
        return primary["location"], primary["confidence"]


# Usage example
if __name__ == "__main__":
    ner = GeoNER()
    
    text = """
    Typhoon Rolly made landfall in Catanduanes province early Sunday morning.
    Heavy rainfall is expected in Metro Manila and surrounding areas.
    """
    
    locations = ner.extract_philippine_locations(text)
    print(f"Detected locations: {locations}")
    
    primary_location, confidence = ner.get_primary_location(text)
    print(f"Primary location: {primary_location} ({confidence:.2%} confidence)")
```

### 2. Supabase MCP - Database & Backend Infrastructure

#### When to Use
- Creating database schemas (hazards, users, reports)
- Executing geospatial queries (PostGIS)
- Applying migrations
- Deploying Edge Functions
- Managing authentication
- Storing AI model outputs
- Setting up real-time channels

#### Step-by-Step Workflow

**Step 1: Execute SQL Queries**
```bash
# Test connection
@supabase execute_sql "SELECT version(), PostGIS_version();"

# Query hazards with geospatial filter
@supabase execute_sql "
  SELECT id, hazard_type, location, confidence, timestamp
  FROM hazards
  WHERE ST_Within(
    coordinates,
    ST_MakeEnvelope(120.0, 14.0, 122.0, 15.0, 4326)
  )
  ORDER BY timestamp DESC
  LIMIT 10;
"
```

**Step 2: Apply Migrations**
```bash
# Create hazards table with PostGIS
@supabase apply_migration name="create_hazards_table" query="
  CREATE TABLE IF NOT EXISTS hazards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hazard_type VARCHAR(50) NOT NULL,
    location VARCHAR(255) NOT NULL,
    coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source VARCHAR(20) NOT NULL CHECK (source IN ('RSS', 'Citizen')),
    raw_text TEXT,
    processed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX idx_hazards_coordinates ON hazards USING GIST(coordinates);
  CREATE INDEX idx_hazards_timestamp ON hazards(created_at DESC);
  CREATE INDEX idx_hazards_type ON hazards(hazard_type);
"
```

**Step 3: Deploy Edge Functions**
```bash
# Deploy RSS aggregation function
@supabase deploy_edge_function name="rss-aggregator" files=[...]
```

**Step 4: Generate TypeScript Types**
```bash
@supabase generate_typescript_types
```

**Step 5: Get Security Advisors**
```bash
@supabase get_advisors type="security"
@supabase get_advisors type="performance"
```

#### Example: Complete Pipeline Integration

```python
"""
AI Pipeline Integration with Supabase
Processes text → extracts hazard + location → validates → stores
"""

import os
from supabase import create_client, Client
from datetime import datetime
from typing import Dict, Optional
import logging

from models.climate_nli import ClimateNLIClassifier
from models.geo_ner import GeoNER
from preprocessing.text_cleaner import TextPreprocessor

logger = logging.getLogger(__name__)


class HazardPipeline:
    """End-to-end pipeline for hazard detection and storage"""
    
    CONFIDENCE_THRESHOLD = 0.7  # Minimum confidence for automatic processing
    
    def __init__(self):
        """Initialize pipeline components"""
        # Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        self.supabase: Client = create_client(supabase_url, supabase_key)
        
        # AI models
        self.climate_nli = ClimateNLIClassifier()
        self.geo_ner = GeoNER()
        self.preprocessor = TextPreprocessor()
        
        logger.info("Hazard pipeline initialized")
    
    def process_text(
        self, 
        text: str, 
        source: str = "RSS"
    ) -> Optional[Dict]:
        """
        Process text through complete pipeline
        
        Args:
            text: Input text (news article, citizen report)
            source: Data source ('RSS' or 'Citizen')
            
        Returns:
            Dictionary with hazard information or None if processing fails
        """
        logger.info(f"Processing text from source: {source}")
        
        try:
            # Step 1: Preprocess text
            cleaned_text = self.preprocessor.clean(text)
            
            # Step 2: Extract hazard type (Climate-NLI)
            hazard_type, hazard_confidence = self.climate_nli.get_top_hazard(
                cleaned_text
            )
            
            # Step 3: Extract location (Geo-NER)
            location_name, location_confidence = self.geo_ner.get_primary_location(
                cleaned_text
            )
            
            if not location_name:
                logger.warning("No valid location detected")
                return None
            
            # Step 4: Validate location against Philippine boundaries (PostGIS)
            coordinates = self.validate_location(location_name)
            
            if not coordinates:
                logger.warning(f"Location not validated: {location_name}")
                return None
            
            # Step 5: Calculate combined confidence
            combined_confidence = (hazard_confidence + location_confidence) / 2
            
            # Step 6: Prepare hazard data
            hazard_data = {
                "hazard_type": hazard_type,
                "location": location_name,
                "coordinates": f"POINT({coordinates['lng']} {coordinates['lat']})",
                "confidence": combined_confidence,
                "source": source,
                "raw_text": text,
                "processed_at": datetime.utcnow().isoformat(),
            }
            
            # Step 7: Store in database or flag for triage
            if combined_confidence >= self.CONFIDENCE_THRESHOLD:
                result = self.store_hazard(hazard_data)
                logger.info(f"Hazard stored with ID: {result['id']}")
                return result
            else:
                result = self.flag_for_triage(hazard_data)
                logger.info(f"Hazard flagged for manual triage: {result['id']}")
                return result
            
        except Exception as e:
            logger.error(f"Pipeline processing failed: {e}")
            return None
    
    def validate_location(self, location_name: str) -> Optional[Dict]:
        """
        Validate location against Philippine administrative boundaries
        
        Args:
            location_name: Location name from NER
            
        Returns:
            Dictionary with lat, lng coordinates or None if invalid
        """
        try:
            # Query PostGIS for matching Philippine location
            result = self.supabase.rpc(
                "geocode_philippine_location",
                {"location_query": location_name}
            ).execute()
            
            if result.data and len(result.data) > 0:
                location = result.data[0]
                return {
                    "lat": location["latitude"],
                    "lng": location["longitude"],
                    "validated_name": location["name"]
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Location validation failed: {e}")
            return None
    
    def store_hazard(self, hazard_data: Dict) -> Dict:
        """
        Store validated hazard in database
        
        Args:
            hazard_data: Hazard information
            
        Returns:
            Stored hazard record
        """
        try:
            result = self.supabase.table("hazards").insert(hazard_data).execute()
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Failed to store hazard: {e}")
            raise
    
    def flag_for_triage(self, hazard_data: Dict) -> Dict:
        """
        Flag low-confidence hazard for manual review
        
        Args:
            hazard_data: Hazard information
            
        Returns:
            Triage record
        """
        try:
            triage_data = {
                **hazard_data,
                "status": "pending_review",
                "requires_validation": True
            }
            
            result = self.supabase.table("triage_queue").insert(
                triage_data
            ).execute()
            
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Failed to flag for triage: {e}")
            raise


# Usage example
if __name__ == "__main__":
    pipeline = HazardPipeline()
    
    # Process RSS article
    rss_text = """
    Typhoon Rolly (international name Goni) made landfall in Catanduanes 
    province early Sunday morning with maximum sustained winds of 225 km/h.
    Residents in Metro Manila and nearby provinces are advised to stay indoors.
    """
    
    result = pipeline.process_text(rss_text, source="RSS")
    print(f"Pipeline result: {result}")
```

```bash
# Create PostGIS geocoding function
@supabase apply_migration name="create_geocoding_function" query="
  CREATE OR REPLACE FUNCTION geocode_philippine_location(location_query TEXT)
  RETURNS TABLE (
    name TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    admin_level TEXT
  ) AS $$
  BEGIN
    RETURN QUERY
    SELECT 
      pb.name,
      ST_Y(ST_Centroid(pb.geom)) AS latitude,
      ST_X(ST_Centroid(pb.geom)) AS longitude,
      pb.admin_level
    FROM philippine_boundaries pb
    WHERE pb.name ILIKE '%' || location_query || '%'
    ORDER BY 
      CASE 
        WHEN pb.name ILIKE location_query THEN 1
        WHEN pb.name ILIKE location_query || '%' THEN 2
        ELSE 3
      END,
      similarity(pb.name, location_query) DESC
    LIMIT 1;
  END;
  $$ LANGUAGE plpgsql;
"
```

### 3. Context7 MCP - Documentation & Code Examples

#### When to Use
- Learning Transformers library APIs
- Understanding PostGIS functions
- Working with FastAPI/Flask
- Implementing Supabase Python SDK
- Using spaCy/NLTK for NLP

#### Step-by-Step Workflow

```bash
# Get Transformers documentation
@context7 resolve-library-id libraryName="transformers"
@context7 get-library-docs context7CompatibleLibraryID="/huggingface/transformers" topic="zero shot classification pipeline"

# Get PostGIS documentation
@context7 resolve-library-id libraryName="postgis"
@context7 get-library-docs context7CompatibleLibraryID="/postgis/postgis" topic="spatial relationships ST_Within"

# Get FastAPI documentation
@context7 resolve-library-id libraryName="fastapi"
@context7 get-library-docs context7CompatibleLibraryID="/tiangolo/fastapi" topic="dependency injection background tasks"

# Get Supabase Python SDK documentation
@context7 resolve-library-id libraryName="supabase-py"
@context7 get-library-docs context7CompatibleLibraryID="/supabase/supabase-py" topic="realtime subscriptions"
```

### 4. StackHawk MCP - API Security Testing

#### When to Use
- Before deploying API endpoints
- Testing RSS aggregation security
- Validating citizen submission endpoints
- Checking authentication/authorization
- Ensuring OWASP compliance

#### Step-by-Step Workflow

```bash
# Step 1: Set up StackHawk
@stackhawk setup app_name="GAIA-Backend-API" org_id="your-org-id"

# Step 2: Configure stackhawk.yml
```

```yaml
# backend/stackhawk.yml
app:
  applicationId: ${STACKHAWK_APP_ID}
  env: Development
  host: http://backend:8000

hawk:
  spider:
    base: true
  
# Test API endpoints
routes:
  - path: /api/hazards
    method: GET
  - path: /api/reports/submit
    method: POST
  - path: /api/auth/login
    method: POST

# Test authenticated endpoints
authentication:
  bearer:
    token: ${AUTH_TOKEN}
```

```bash
# Step 3: Run security scan
@stackhawk get-scan-instructions config_path="backend/stackhawk.yml"
docker-compose run backend hawk scan backend/stackhawk.yml

# Step 4: Review findings
@stackhawk get-app-findings config_path="backend/stackhawk.yml"

# Step 5: Search for specific vulnerabilities
@stackhawk search-vulnerabilities org_id="your-org-id" severity_filter="Critical"
```

## Backend-Specific Workflows

### Workflow 1: Complete AI Model Integration

```bash
# Step 1: Research models
@hf model_search query="zero-shot climate classification" task="zero-shot-classification"
@hf paper_search query="climate event detection NLP"

# Step 2: Get documentation
@hf doc_search query="transformers pipeline custom labels"
@context7 get-library-docs context7CompatibleLibraryID="/huggingface/transformers" topic="pipeline initialization"

# Step 3: Implement model (see Climate-NLI example above)

# Step 4: Test model
docker-compose run backend pytest tests/python/unit/test_climate_nli.py -v

# Step 5: Integrate with Supabase
@supabase apply_migration name="create_model_cache_table"

# Step 6: Security test
@stackhawk get-app-findings config_path="backend/stackhawk.yml"
```

### Workflow 2: Geospatial Data Processing

```bash
# Step 1: Get PostGIS documentation
@context7 get-library-docs context7CompatibleLibraryID="/postgis/postgis" topic="spatial indexes performance"

# Step 2: Create geospatial schema
@supabase apply_migration name="setup_philippine_boundaries" query="
  CREATE TABLE philippine_boundaries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    admin_level VARCHAR(50) NOT NULL,
    geom GEOGRAPHY(MULTIPOLYGON, 4326) NOT NULL
  );
  
  CREATE INDEX idx_boundaries_geom ON philippine_boundaries USING GIST(geom);
  CREATE INDEX idx_boundaries_name ON philippine_boundaries USING GIN(name gin_trgm_ops);
"

# Step 3: Load reference data (NAMRIA boundaries)
# backend/python/scripts/load_boundaries.py

# Step 4: Test geospatial queries
@supabase execute_sql "
  SELECT name, admin_level
  FROM philippine_boundaries
  WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(121.0, 14.6), 4326))
"

# Step 5: Implement validation function
# See geocode_philippine_location example above

# Step 6: Performance testing
@supabase get_advisors type="performance"
```

### Workflow 3: RSS Feed Aggregation with Edge Function

```bash
# Step 1: Get documentation
@context7 get-library-docs context7CompatibleLibraryID="/supabase/supabase" topic="edge functions deployment"

# Step 2: Create Edge Function
# backend/supabase/functions/rss-aggregator/index.ts
```

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Parser from "https://esm.sh/rss-parser@3.13.0";

const RSS_FEEDS = [
  "https://www.gmanetwork.com/news/rss/",
  "https://www.rappler.com/feed/",
  "https://newsinfo.inquirer.net/feed",
];

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const parser = new Parser();
    const allArticles = [];

    // Fetch from all RSS feeds
    for (const feedUrl of RSS_FEEDS) {
      try {
        const feed = await parser.parseURL(feedUrl);
        allArticles.push(...feed.items);
      } catch (error) {
        console.error(`Failed to fetch ${feedUrl}:`, error);
      }
    }

    // Process articles through AI pipeline
    for (const article of allArticles) {
      // Call Python backend for processing
      const response = await fetch(
        `${Deno.env.get("BACKEND_URL")}/api/process-text`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: article.content,
            source: "RSS",
            metadata: {
              title: article.title,
              url: article.link,
              published: article.pubDate,
            },
          }),
        }
      );

      const result = await response.json();
      console.log(`Processed article: ${article.title}`, result);
    }

    return new Response(
      JSON.stringify({ processed: allArticles.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

```bash
# Step 3: Deploy Edge Function
@supabase deploy_edge_function name="rss-aggregator" entrypoint_path="index.ts" files=[...]

# Step 4: Test function
curl -X POST https://your-project.supabase.co/functions/v1/rss-aggregator \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Step 5: Security test
@stackhawk get-app-findings
```

## Testing Checklist

### Before Committing Backend Code

1. **Unit Tests**
   ```bash
   docker-compose run backend pytest tests/python/unit/ -v --cov
   ```

2. **Integration Tests**
   ```bash
   docker-compose run backend pytest tests/python/integration/ -v
   ```

3. **Model Performance**
   - F1-score > 0.85 for Climate-NLI
   - Precision > 0.90 for Geo-NER
   - Time-to-Action < 5 minutes

4. **Geospatial Validation**
   - All coordinates within Philippine boundaries
   - PostGIS queries optimized (< 100ms)

5. **Security Scan**
   ```bash
   @stackhawk get-app-findings config_path="backend/stackhawk.yml"
   ```

6. **Database Migrations**
   ```bash
   @supabase list_migrations
   @supabase get_advisors type="security"
   ```

## Docker Commands Reference

```bash
# Start backend service
docker-compose up backend

# Install Python packages
docker-compose run backend pip install [package]

# Run tests
docker-compose run backend pytest tests/python/

# Apply migrations
docker-compose run backend python backend/python/scripts/migrate.py

# Run pipeline
docker-compose run backend python -m backend.python.pipeline.main

# Security scan
docker-compose run backend hawk scan backend/stackhawk.yml
```

## Common Pitfalls

1. **Don't hardcode credentials**: Use environment variables
   ```python
   # ❌ Wrong
   supabase_url = "https://project.supabase.co"
   
   # ✅ Correct
   supabase_url = os.getenv("SUPABASE_URL")
   ```

2. **Always validate geospatial data**: Check against PostGIS boundaries

3. **Don't skip confidence thresholds**: Route low-confidence to triage

4. **Always log AI model decisions**: For audit trail and debugging

5. **Don't forget to cache models**: Load once, reuse across requests

## Quick Reference

### MCP Tools Priority for Backend
1. **Hugging Face MCP** - Model discovery
2. **Supabase MCP** - Database operations
3. **Context7 MCP** - Documentation
4. **StackHawk MCP** - Security testing

### File Locations
- Models: `backend/python/models/`
- Pipeline: `backend/python/pipeline/`
- Preprocessing: `backend/python/preprocessing/`
- Edge Functions: `backend/supabase/functions/`
- Migrations: `backend/supabase/migrations/`
- Tests: `tests/python/`

### Environment Variables
```bash
# backend/.env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=
HUGGING_FACE_TOKEN=
CONFIDENCE_THRESHOLD=0.7
BACKEND_URL=http://backend:8000
```

---

**Next Steps**: See `.github/copilot-mcp-workflows.md` for full-stack integration patterns.
