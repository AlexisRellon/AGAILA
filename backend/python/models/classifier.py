"""
Zero-Shot Classification Module for GAIA
Enhanced for Philippine Environmental Hazard Detection with False Positive Filtering.

This module implements a multi-stage classification approach:
1. Pre-filtering: Keyword/pattern-based rejection of non-hazard content
2. Event Detection: Is this an ACTIVE hazard event vs. project/planning/general news?
3. Hazard Typing: Classification into specific hazard categories
4. Philippine Geo-Validation: Ensures hazard is occurring IN the Philippines

Key Features:
- High precision filtering to exclude infrastructure projects, advisories, planning announcements
- Philippine-specific location validation
- Confidence score adjustments based on context signals
- Robust false positive detection for construction, development, research content
"""

from transformers import pipeline
import logging
import os
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class ClimateNLIClassifier:
    """
    Enhanced Zero-shot text classifier for Philippine environmental hazards.

    Implements robust model fallback hierarchy for reliability:
    1. Primary: MoritzLaurer/deberta-v3-base-zeroshot-v1.1-all-33 (robust zero-shot, 184M params)
    2. Secondary: facebook/bart-large-mnli (industry standard NLI, 407M params)
    3. Tertiary: climatebert/distilroberta-base-climate-detector (climate text, 82M params)
    4. Multilingual: joeddav/xlm-roberta-large-xnli (Tagalog/Spanish support, 561M params)

    Enhanced with:
    - Multi-stage classification (event detection → hazard typing)
    - False positive filtering for infrastructure/projects/advisories
    - Philippine geo-relevance validation
    - Confidence score adjustments based on context
    """

    # Model fallback hierarchy
    MODEL_FALLBACKS = [
        'MoritzLaurer/deberta-v3-base-zeroshot-v1.1-all-33',  # Primary: best zero-shot
        'facebook/bart-large-mnli',  # Secondary: industry standard NLI
        'climatebert/distilroberta-base-climate-detector',  # Tertiary
        'joeddav/xlm-roberta-large-xnli'  # Fallback: multilingual
    ]

    # Hazard categories for Zero-Shot Classification
    HAZARD_CATEGORIES = [
        'flooding',
        'fire',
        'earthquake',
        'typhoon',
        'landslide',
        'volcanic eruption',
        'drought',
        'tsunami',
        'storm surge',
        'tornado'
    ]

    # =========================================================================
    # FALSE POSITIVE EXCLUSION PATTERNS
    # These patterns identify content that should NOT be classified as hazards
    # =========================================================================

    # Infrastructure & Construction Projects (high-priority exclusion)
    INFRASTRUCTURE_PATTERNS = [
        # Flood control construction
        r'\b(?:flood\s+control|anti-flood|floodway)\s+(?:project|construction|infrastructure|facility|system|program)\b',
        r'\b(?:construct(?:ion|ing|ed)?|build(?:ing)?|develop(?:ment|ing)?)\s+(?:of\s+)?(?:flood|drainage|dike|seawall|levee)\b',
        r'\bflood\s+(?:mitigation|prevention|protection)\s+(?:project|infrastructure|program|initiative)\b',

        # Road and infrastructure development
        r'\b(?:road|highway|bridge|overpass|underpass)\s+(?:widening|construction|project|development|improvement)\b',
        r'\b(?:widening|expansion|extension)\s+(?:of\s+)?(?:road|highway|bridge)\b',
        r'\binfrastructure\s+(?:project|development|program|improvement)\b',

        # General construction
        r'\b(?:groundbreaking|inaugurat(?:ion|ed)|ribbon[- ]cutting|turnover)\s+(?:ceremony|of)\b',
        r'\b(?:project|program)\s+(?:launch(?:ed)?|inaugurat(?:ion|ed)|complet(?:ion|ed))\b',
        r'\bbid(?:ding|s)?\s+(?:for|of)\s+(?:project|construction|infrastructure)\b',
        r'\bcontract\s+(?:award(?:ed)?|sign(?:ed|ing)?)\s+(?:for|of)\b',
    ]

    # Government Planning & Policy Announcements
    PLANNING_PATTERNS = [
        r'\b(?:proposed|planned|upcoming|scheduled)\s+(?:project|construction|development|program)\b',
        r'\b(?:planning|feasibility)\s+(?:study|phase|stage)\b',
        r'\bbudget\s+(?:allocat(?:ion|ed)|approv(?:al|ed))\s+(?:for|of)\b',
        r'\b(?:memorandum|executive)\s+order\b',
        r'\b(?:policy|ordinance|resolution)\s+(?:approv(?:al|ed)|pass(?:ed)?|enact(?:ed)?)\b',
        r'\bmaster\s+plan\b',
        r'\b(?:DPWH|DENR|DILG|LGU|NDRRMC)\s+(?:announc(?:es?|ed)|plans?|proposes?)\b',
    ]

    # Advisories & Warnings (not actual events)
    ADVISORY_PATTERNS = [
        r'\b(?:preemptive|precautionary|voluntary)\s+evacuation\b',
        r'\b(?:signal|warning)\s+(?:number|no\.?)\s+\d+\s+(?:raised|hoisted|declared)\b',
        r'\bweather\s+(?:advisory|bulletin|forecast|outlook)\b',
        r'\b(?:pagasa|phivolcs)\s+(?:advis(?:es|ory)|warn(?:s|ing)|bulletin)\b',
        r'\bclass(?:es)?\s+(?:suspension|suspended)\b',
        r'\bwork\s+(?:suspension|suspended)\b',
        r'\b(?:alert|warning)\s+level\s+(?:raised|lowered|remains?)\b',
    ]

    # Historical References & Past Events
    HISTORICAL_PATTERNS = [
        r'\b(?:anniversary|commemoration|memorial)\s+(?:of|for)\b',
        r'\byears?\s+(?:ago|since|after)\b',
        r'\b(?:in|during|back\s+in)\s+(?:19|20)\d{2}\b',
        r'\bhistor(?:y|ical|ically)\b',
        r'\b(?:deadliest|worst|strongest)\s+(?:ever|recorded|in\s+history)\b',
        r'\bremember(?:ing|s)?\s+(?:the|those|victims)\b',
    ]

    # Research, Studies & Reports
    RESEARCH_PATTERNS = [
        r'\b(?:study|research|survey|report)\s+(?:shows?|reveals?|finds?|suggests?)\b',
        r'\b(?:according\s+to|based\s+on)\s+(?:a\s+)?(?:study|research|report|data)\b',
        r'\bscientists?\s+(?:say|warn|predict|study)\b',
        r'\b(?:climate\s+change|global\s+warming)\s+(?:study|research|impact|effect)\b',
        r'\brisk\s+(?:assessment|analysis|mapping|study)\b',
    ]

    # Prevention & Preparedness Programs
    PREVENTION_PATTERNS = [
        r'\b(?:disaster|hazard)\s+(?:preparedness|readiness|training|drill|exercise)\b',
        r'\b(?:evacuation|rescue|relief)\s+(?:drill|exercise|simulation|training)\b',
        r'\b(?:awareness|education)\s+(?:campaign|program|drive|seminar)\b',
        r'\bcapacity\s+building\b',
        r'\b(?:early\s+warning|monitoring)\s+system\b',
        r'\brisk\s+reduction\s+(?:program|initiative|effort)\b',
    ]

    # General Non-Hazard News
    NON_HAZARD_PATTERNS = [
        r'\b(?:tourism|travel|vacation|holiday)\s+(?:advisory|guide|destination)\b',
        r'\b(?:economy|economic|business)\s+(?:impact|effect|recovery)\b',
        r'\b(?:donation|aid|relief)\s+(?:distribution|delivery|drive)\b',
        r'\brehabilitation\s+(?:program|effort|project)\b',
        r'\b(?:insurance|claims?)\s+(?:payout|processing|settlement)\b',
    ]

    # =========================================================================
    # MAN-MADE / URBAN FIRE EXCLUSION PATTERNS
    # Fire reports that are NOT wildfires: residential, building, industrial,
    # arson, BFP operational reports, electrical fires, etc.
    # =========================================================================

    MAN_MADE_FIRE_PATTERNS = [
        # Residential/Building fires
        r'\b(?:house|home|apartment|condo|residential|building|warehouse|factory|market|mall|store|shop|office|hotel|hospital|school|church|dormitor(?:y|ies))\s+(?:fire|on\s+fire|caught\s+fire)\b',
        r'\bfire\s+(?:hit|struck|gutted|razed|destroyed|engulfed|swept)\s+(?:a\s+)?(?:\d+\s+)?(?:house|home|building|warehouse|factory|market|mall|store|shop|office|hotel)\b',
        r'\b(?:house|building|apartment|warehouse|factory|market|mall|store|shop|office)\s+(?:was\s+)?(?:gutted|razed|destroyed|engulfed)\s+(?:by\s+)?fire\b',

        # BFP (Bureau of Fire Protection) operational reports
        r'\bBFP\b',
        r'\bBureau\s+of\s+Fire\s+Protection\b',
        r'\b(?:fire\s+(?:alarm|truck|engine|department|station|marshal|investigator|volunteer))\b',
        r'\b(?:1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth)\s+alarm\b',
        r'\b(?:task\s+force)\s+(?:alpha|bravo|charlie|delta|echo)\b',
        r'\b(?:firefighter|fireman|firemen|fire\s+brigade)\b',

        # Arson/intentional fire
        r'\b(?:arson(?:ist)?|incendiary)\b',
        r'\bintentional(?:ly)?\s+(?:set|started)\s+(?:the\s+)?fire\b',

        # Electrical/structural fire causes
        r'\b(?:electrical|short\s+circuit|faulty\s+wiring|overloaded|overheating)\s+(?:fire|caused?\s+(?:the\s+)?fire)\b',
        r'\b(?:LPG|gas\s+tank|stove|candle|cigarette)\s+(?:caused?|started?|triggered?)\s+(?:the\s+)?fire\b',

        # Urban fire context
        r'\b(?:fire\s+broke\s+out|fire\s+erupted|fire\s+started)\s+(?:in|at|inside)\s+(?:a\s+)?(?:house|home|building|apartment|factory|warehouse|slum|squatter|shanty)\b',

        # Fire response / investigation (urban fire context)
        r'\bfire\s+(?:investigation|investigator|scene|victim|survivor)\b',
        r'\bfire\s+(?:insurance|claim|damage\s+assessment)\b',

        # Residential area fires
        r'\bfire\s+(?:in|at|hit|struck)\s+(?:a\s+)?(?:subdivision|village|compound|slum|squatter|settlement|barangay)\b',
    ]

    # =========================================================================
    # WILDFIRE / NATURAL FIRE POSITIVE INDICATORS
    # At least one must match to confirm wildfire context when hazard_type=fire
    # =========================================================================

    WILDFIRE_INDICATORS = [
        r'\b(?:wildfire|wild\s+fire|forest\s+fire|brush\s+fire|grass\s+fire|bush\s+fire|wildland\s+fire|grassfire)\b',
        r'\b(?:forest|mountain|grassland|hill(?:side)?|woodland|vegetation|timberland|sierra|watershed)\s+(?:fire|on\s+fire|ablaze|burning|burned|burnt)\b',
        r'\b(?:fire)\s+(?:in|at|on|near|across|through|swept|spread(?:ing|s)?|rag(?:es?|ed|ing))\b.*\b(?:forest|mountain|grassland|hill(?:side)?|sierra|watershed|national\s+park|protected\s+area|woodland|reserve|timberland)\b',
        r'\b(?:hectares?|acres?)\s+(?:of\s+)?(?:forest|grassland|vegetation|land|trees?|timber)\s+(?:burned|burnt|destroyed|razed|affected|consumed)\b',
        r'\b(?:kaingin|slash.and.burn|open\s+burning)\b.*\b(?:spread|uncontrolled|out\s+of\s+control)\b',
        r'\bDENR\b.*\b(?:fire|burning|burned|burnt)\b',
        r'\b(?:fire)\b.*\b(?:Mt\.|Mount|mountain)\s+[A-Z]\w+\b',
        r'\b(?:fire)\s+(?:spread(?:ing|s)?|rag(?:es?|ed|ing))\s+(?:in|across|through)\s+(?:the\s+)?(?:forest|mountain|grassland|hillside|woodland)\b',
    ]

    # =========================================================================
    # UNRELATED NEWS CATEGORIES (Crime, Politics, Sports, Entertainment, etc.)
    # These patterns identify content that is NOT about environmental hazards
    # =========================================================================

    # Crime & Violence News (NOT environmental hazards)
    CRIME_PATTERNS = [
        # Murder, killing, homicide
        r'\b(?:murder(?:ed|er|s)?|homicide|slay(?:ing|s)?|slain|assassinat(?:ed?|ion))\b',
        r'\b(?:shot\s+(?:and\s+)?(?:killed|dead)|gunned\s+down|stabbed|hacked)\b',
        r'\b(?:kill(?:ed|ing|er|s)?\s+(?:in|at|by)\s+(?:his|her|their|the)\s+(?:house|home|residence))\b',
        r'\b(?:body|bodies|corpse|remains)\s+(?:found|discovered|recovered)\b',

        # Police/Investigation
        r'\b(?:police|cop(?:s)?|PNP|NBI|CIDG)\s+(?:prob(?:ed?|ing)|investigat(?:e|ion|ing)|arrest(?:ed)?)\b',
        r'\b(?:paraffin|ballistic|forensic)\s+(?:test|examination|analysis)\b',
        r'\b(?:suspect(?:s|ed)?|perpetrator|assailant|gunman|hitman)\b',
        r'\b(?:arrest(?:ed)?|apprehend(?:ed)?|nabbed|collared)\s+(?:for|in|over)\b',
        r'\b(?:criminal|crime)\s+(?:case|investigation|charges?|complaint)\b',
        r'\b(?:warrant|subpoena|summons)\s+(?:issued|served)\b',
        r'\b(?:bail|arraign(?:ed|ment)|plead(?:ed)?|trial|verdict|sentenced)\b',

        # Violence indicators
        r'\b(?:fired\s+(?:his|her|their)\s+(?:service\s+)?(?:weapon|gun|firearm))\b',
        r'\b(?:ambush(?:ed)?|attack(?:ed)?|assault(?:ed)?)\s+(?:by|on)\b',
        r'\b(?:robbery|hold-?up|carjack(?:ing)?|kidnap(?:ping|ped)?)\b',
        r'\b(?:drug\s+(?:bust|raid|operation|den|pusher|lord))\b',

        # Victims of crime (not natural disasters)
        r'\b(?:village|barangay)\s+(?:chief|captain|chairman)\s+(?:shot|killed|slain)\b',
        r'\b(?:shot|killed|murdered)\s+(?:in|at|inside)\s+(?:his|her|their)\s+(?:house|home|office)\b',
    ]

    # Politics & Government News (not disasters)
    POLITICS_PATTERNS = [
        r'\b(?:election|campaign|candidat(?:e|es|ure)|ballot|voting|poll(?:s)?)\b',
        r'\b(?:senat(?:e|or)|congress(?:man|woman)?|representative|mayor|governor)\s+(?:says?|said|announces?)\b',
        r'\b(?:political|party|coalition|opposition|administration)\b',
        r'\b(?:impeach(?:ment)?|corruption|plunder|graft|bribery)\b',
        r'\b(?:hearing|session|committee|legislation|bill|law)\s+(?:on|for|about)\b',
        r'\b(?:filed|faces?|charged\s+with)\s+(?:case|complaint|charges?)\b',
    ]

    # Sports News
    SPORTS_PATTERNS = [
        r'\b(?:basketball|volleyball|boxing|football|soccer|tennis|badminton)\b',
        r'\b(?:PBA|UAAP|NCAA|NBA|FIFA|Olympics|SEA\s+Games)\b',
        r'\b(?:championship|tournament|finals?|playoffs?|match|game|bout)\b',
        r'\b(?:player|athlete|coach|team)\s+(?:wins?|loses?|defeats?|beats?)\b',
        r'\b(?:score(?:d|s)?|goal(?:s)?|points?|championship)\b',
    ]

    # Entertainment & Celebrity News
    ENTERTAINMENT_PATTERNS = [
        r'\b(?:actor|actress|celebrity|singer|artist|performer)\b',
        r'\b(?:movie|film|concert|show|drama|teleserye|series)\b',
        r'\b(?:awards?|premiere|red\s+carpet|showbiz|entertainment)\b',
        r'\b(?:wedding|engagement|relationship|breakup|scandal)\b',
    ]

    # Business & Economy News (not disasters)
    BUSINESS_PATTERNS = [
        r'\b(?:stock|shares?|market|trading|index|peso|dollar)\s+(?:up|down|rises?|falls?|drops?)\b',
        r'\b(?:company|corporation|firm|business)\s+(?:announces?|reports?|launches?)\b',
        r'\b(?:merger|acquisition|IPO|investment|profit|revenue|earnings)\b',
        r'\b(?:CEO|CFO|executive|board|shareholders?)\b',
    ]

    # Health/Medical News (not environmental)
    HEALTH_PATTERNS = [
        r'\b(?:COVID|coronavirus|pandemic|vaccine|vaccination|booster)\b',
        r'\b(?:hospital|clinic|patient|doctor|nurse|medical)\s+(?:staff|personnel|facility)\b',
        r'\b(?:disease|illness|outbreak|cases?)\s+(?:reported|confirmed|detected)\b',
        r'\b(?:dengue|measles|flu|influenza|virus)\s+(?:cases?|outbreak|alert)\b',
    ]

    # =========================================================================
    # ENVIRONMENTAL HAZARD KEYWORDS (Semantic Validation)
    # Text MUST contain at least one of these to be considered hazard-related
    # =========================================================================

    HAZARD_KEYWORDS = [
        # Weather/Storm hazards
        r'\b(?:flood(?:ing|ed|s|waters?)?|flash\s+flood|inundat(?:ed?|ion))\b',
        r'\b(?:typhoon|storm|cyclone|monsoon|habagat|bagyo)\b',
        r'\b(?:rain(?:fall|s)?|downpour|deluge|precipitation)\b',
        r'\b(?:wind(?:s)?|gust(?:s)?|gale)\b',
        r'\b(?:storm\s+surge|tidal\s+wave|high\s+(?:tide|waves?))\b',

        # Geological hazards
        r'\b(?:earthquake|quake|tremor|seismic|magnitude|aftershock)\b',
        r'\b(?:landslide|mudslide|rockslide|soil\s+erosion|ground\s+(?:collapse|subsidence))\b',
        r'\b(?:volcano|volcanic|eruption|lava|pyroclastic|ashfall|lahar)\b',
        r'\b(?:tsunami|tidal\s+wave)\b',
        r'\b(?:sinkhole|ground\s+fissure)\b',

        # Fire hazards - WILDFIRE ONLY (man-made/urban fires excluded by separate filter)
        r'\b(?:wildfire|wild\s+fire|forest\s+fire|brush\s+fire|grass\s+fire|bush\s+fire|wildland\s+fire|grassfire)\b',
        r'\b(?:fire)\s+(?:in|on|at|near)\s+(?:the\s+)?(?:forest|mountain|grassland|hill|woodland|watershed|park|reserve|sierra)\b',
        r'\b(?:forest|mountain|grassland|hillside|woodland|vegetation)\s+(?:fire|ablaze|burning|burned|burnt)\b',
        r'\b(?:kaingin|slash.and.burn)\b',

        # Water/Climate hazards
        r'\b(?:drought|dry\s+spell|water\s+shortage|el\s+niño)\b',
        r'\b(?:tornado|waterspout|funnel\s+cloud)\b',
        r'\b(?:heatwave|heat\s+(?:wave|index)|extreme\s+heat)\b',

        # Hazardous materials
        r'\b(?:oil\s+spill|chemical\s+(?:spill|leak)|toxic|hazardous\s+(?:material|waste))\b',
        r'\b(?:pollution|contamination|gas\s+leak)\b',

        # Disaster response terms (environmental context)
        r'\b(?:evacuation\s+(?:center|site)|relief\s+(?:goods|operations?))\b',
        r'\b(?:NDRRMC|PAGASA|PHIVOLCS|MDRRMO|BDRRMC)\b',
        r'\b(?:calamity|disaster)\s+(?:area|zone|response|fund)\b',
        r'\b(?:state\s+of\s+(?:calamity|emergency))\b',
        r'\b(?:search\s+and\s+rescue|SAR|rescue\s+operations?)\b',
        r'\b(?:water\s+level|river\s+(?:overflow|burst)|dam\s+(?:release|overflow))\b',
    ]

    # =========================================================================
    # POSITIVE HAZARD EVENT INDICATORS
    # These patterns indicate an ACTUAL ongoing or recent hazard event
    # =========================================================================

    ACTIVE_HAZARD_INDICATORS = [
        # Immediate/ongoing events
        r'\b(?:hit(?:s|ting)?|struck|strikes?|slams?|batters?|ravages?)\b',
        r'\b(?:swept|sweeps?|inundat(?:es?|ed|ing)|submerge[ds]?|engulf(?:s|ed)?)\b',
        r'\b(?:trigger(?:s|ed)?|caus(?:es?|ed|ing))\s+(?:flood|landslide|evacuation|damage)\b',
        # Volcanic-specific phrasing (PHIVOLCS bulletins, phreatic eruptions)
        r'\b(?:phreatic|phreato\s*magmatic|phreatomagmatic)\s+eruption(?:s)?\b',
        r'\bhad\s+\d+\s+(?:minor\s+)?(?:phreatic\s+)?eruption(?:s)?\b',
        r'\b(?:destroy(?:s|ed)?|damag(?:es?|ed|ing)|devastat(?:es?|ed|ing))\b',
        r'\b(?:kill(?:s|ed)?|injur(?:es?|ed)|wound(?:s|ed)?|trap(?:s|ped)?)\b',
        r'\b(?:displac(?:es?|ed)|strand(?:s|ed)?|rescues?d?|evacuate[ds]?)\b',

        # Current state indicators
        r'\b(?:currently|now|still|remain(?:s)?)\s+(?:flood(?:ed|ing)?|burning|raging|active)\b',
        r'\b(?:ongoing|continuing|worsening|intensifying)\s+(?:flood|fire|eruption|storm)\b',
        r'\bas\s+of\s+(?:today|now|this\s+morning|press\s+time)\b',
        r'\b(?:earlier\s+today|this\s+morning|last\s+night|overnight)\b',

        # Casualty/damage reports
        r'\b(?:death|casualt(?:y|ies)|fatalit(?:y|ies)|victim(?:s)?)\s+(?:toll|count|reported)\b',
        r'\b(?:damage(?:s)?|loss(?:es)?)\s+(?:estimated|reported|worth|amounting)\b',
        r'\b(?:P|PHP|₱)\s*[\d,]+\s*(?:million|billion|worth)\s+(?:of\s+)?damage\b',

        # Emergency response
        r'\b(?:rescue|search\s+and\s+rescue|evacuation)\s+(?:operation(?:s)?|ongoing|underway)\b',
        r'\b(?:emergency|disaster)\s+(?:responders?|response|situation|declared)\b',
        r'\bstate\s+of\s+(?:emergency|calamity)\s+(?:declared|imposed)\b',
    ]

    # =========================================================================
    # PHILIPPINE LOCATION INDICATORS
    # Patterns that confirm the event is occurring IN the Philippines
    # =========================================================================

    PHILIPPINE_INDICATORS = [
        # Major cities and regions
        r'\b(?:Metro\s+Manila|NCR|National\s+Capital\s+Region)\b',
        r'\b(?:Quezon\s+City|Manila|Makati|Cebu|Davao|Zamboanga|Cagayan\s+de\s+Oro)\b',
        r'\b(?:Luzon|Visayas|Mindanao)\b',
        r'\b(?:CALABARZON|MIMAROPA|Bicol|CAR|Cordillera)\b',

        # Provinces (common ones)
        r'\b(?:Cavite|Laguna|Batangas|Rizal|Bulacan|Pampanga|Pangasinan)\b',
        r'\b(?:Cebu|Bohol|Leyte|Samar|Negros|Iloilo|Palawan)\b',
        r'\b(?:Davao|Cotabato|Zamboanga|Bukidnon|Misamis)\b',

        # Philippine-specific terms
        r'\b(?:barangay|brgy\.?|municipality|poblacion)\b',
        r'\b(?:PAGASA|PHIVOLCS|NDRRMC|DSWD|DILG|OCD)\b',
        r'\b(?:Philippines?|Filipino|Pilipino|Pilipinas)\b',
        r'\b(?:LGU|local\s+government\s+unit)\b',

        # Philippine weather systems
        r'\b(?:habagat|amihan|hanging\s+amihan|hanging\s+habagat)\b',
        r'\bsignal\s+(?:number|no\.?)\s*#?\s*[1-5]\b',
        r'\b(?:Mayon|Taal|Pinatubo|Kanlaon|Bulusan)\s+(?:volcano|Volcano)?\b',
    ]

    def __init__(self, fallback_models: List[str] = None, cache_dir: str = None):
        """
        Initialize the enhanced classifier with fallback hierarchy.

        Args:
            fallback_models: List of model names to try in order
            cache_dir: Directory to cache downloaded models
        """
        self.fallback_models = fallback_models or self.MODEL_FALLBACKS
        self.cache_dir = cache_dir or os.getenv('HF_CACHE_DIR', '/app/models/cache')
        self.model = None
        self.active_model = None
        self.categories = self.HAZARD_CATEGORIES

        # Compile regex patterns for efficiency
        self._compile_patterns()

    def _compile_patterns(self):
        """Pre-compile regex patterns for better performance."""
        self._infrastructure_re = [re.compile(p, re.IGNORECASE) for p in self.INFRASTRUCTURE_PATTERNS]
        self._planning_re = [re.compile(p, re.IGNORECASE) for p in self.PLANNING_PATTERNS]
        self._advisory_re = [re.compile(p, re.IGNORECASE) for p in self.ADVISORY_PATTERNS]
        self._historical_re = [re.compile(p, re.IGNORECASE) for p in self.HISTORICAL_PATTERNS]
        self._research_re = [re.compile(p, re.IGNORECASE) for p in self.RESEARCH_PATTERNS]
        self._prevention_re = [re.compile(p, re.IGNORECASE) for p in self.PREVENTION_PATTERNS]
        self._non_hazard_re = [re.compile(p, re.IGNORECASE) for p in self.NON_HAZARD_PATTERNS]
        self._man_made_fire_re = [re.compile(p, re.IGNORECASE) for p in self.MAN_MADE_FIRE_PATTERNS]
        self._wildfire_indicators_re = [re.compile(p, re.IGNORECASE) for p in self.WILDFIRE_INDICATORS]
        self._active_hazard_re = [re.compile(p, re.IGNORECASE) for p in self.ACTIVE_HAZARD_INDICATORS]
        self._philippine_re = [re.compile(p, re.IGNORECASE) for p in self.PHILIPPINE_INDICATORS]

        # Unrelated news categories
        self._crime_re = [re.compile(p, re.IGNORECASE) for p in self.CRIME_PATTERNS]
        self._politics_re = [re.compile(p, re.IGNORECASE) for p in self.POLITICS_PATTERNS]
        self._sports_re = [re.compile(p, re.IGNORECASE) for p in self.SPORTS_PATTERNS]
        self._entertainment_re = [re.compile(p, re.IGNORECASE) for p in self.ENTERTAINMENT_PATTERNS]
        self._business_re = [re.compile(p, re.IGNORECASE) for p in self.BUSINESS_PATTERNS]
        self._health_re = [re.compile(p, re.IGNORECASE) for p in self.HEALTH_PATTERNS]

        # Hazard keyword validation
        self._hazard_keywords_re = [re.compile(p, re.IGNORECASE) for p in self.HAZARD_KEYWORDS]

    def load_model(self):
        """
        Load the zero-shot classification model with automatic fallback.
        Uses caching to avoid re-downloading in Docker containers.
        """
        if self.model is None:
            logger.info(f"Cache directory: {self.cache_dir}")
            os.makedirs(self.cache_dir, exist_ok=True)

            last_error = None
            for model_name in self.fallback_models:
                try:
                    logger.info(f"Attempting to load model: {model_name}")
                    self.model = pipeline(
                        "zero-shot-classification",
                        model=model_name,
                        cache_dir=self.cache_dir
                    )
                    self.active_model = model_name
                    logger.info(f"✓ Zero-shot model loaded successfully: {model_name}")
                    logger.info(f"  Configured with {len(self.categories)} hazard categories")
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(f"Failed to load {model_name}: {str(e)}")
                    continue

            if self.model is None:
                raise RuntimeError(f"Could not load any model. Last error: {str(last_error)}")

    def _check_exclusion_patterns(self, text: str) -> Tuple[bool, str, float]:
        """
        Check if text matches any exclusion patterns (false positive detection).

        Returns:
            Tuple of (should_exclude, exclusion_reason, penalty_score)
        """
        text_lower = text.lower()

        # Infrastructure & Construction (highest priority exclusion)
        for pattern in self._infrastructure_re:
            if pattern.search(text):
                match = pattern.search(text).group()
                logger.debug(f"Infrastructure pattern matched: {match}")
                return True, f"infrastructure_project: {match}", 0.0

        # Planning & Policy
        for pattern in self._planning_re:
            if pattern.search(text):
                match = pattern.search(text).group()
                logger.debug(f"Planning pattern matched: {match}")
                return True, f"planning_announcement: {match}", 0.0

        # Historical references (significant penalty but not full exclusion)
        historical_matches = sum(1 for p in self._historical_re if p.search(text))
        if historical_matches >= 2:
            return True, "historical_reference", 0.0

        # Research & Studies
        for pattern in self._research_re:
            if pattern.search(text):
                match = pattern.search(text).group()
                return True, f"research_study: {match}", 0.0

        # Prevention Programs
        for pattern in self._prevention_re:
            if pattern.search(text):
                match = pattern.search(text).group()
                return True, f"prevention_program: {match}", 0.0

        # Non-hazard news
        for pattern in self._non_hazard_re:
            if pattern.search(text):
                match = pattern.search(text).group()
                return True, f"non_hazard_news: {match}", 0.0

        # Advisories - partial penalty (could still be relevant if event is happening)
        advisory_matches = sum(1 for p in self._advisory_re if p.search(text))
        if advisory_matches >= 2:
            # Multiple advisory patterns without active hazard indicators = likely just advisory
            active_matches = sum(1 for p in self._active_hazard_re if p.search(text))
            if active_matches == 0:
                return True, "advisory_only", 0.0

        return False, "", 1.0

    def _check_unrelated_news(self, text: str) -> Tuple[bool, str]:
        """
        Check if text is about unrelated news categories (crime, politics, sports, etc.).

        Returns:
            Tuple of (is_unrelated, category)
        """
        # Crime news - highest priority exclusion
        crime_matches = sum(1 for p in self._crime_re if p.search(text))
        if crime_matches >= 2:
            # Strong crime indicators - definitely not environmental hazard
            return True, "crime_news"

        # Check for specific crime context that rules out hazards
        text_lower = text.lower()
        crime_context = [
            'shot and killed', 'gunned down', 'murder', 'homicide', 'slay',
            'paraffin test', 'ballistic', 'suspect', 'arrested', 'perpetrator',
            'police investigation', 'criminal case', 'filed charges', 'warrant',
            'hitman', 'assassin', 'ambush', 'drug bust', 'robbery', 'kidnap'
        ]
        crime_context_count = sum(1 for term in crime_context if term in text_lower)
        if crime_context_count >= 1:
            return True, "crime_news"

        # Politics news
        politics_matches = sum(1 for p in self._politics_re if p.search(text))
        if politics_matches >= 2:
            return True, "politics_news"

        # Sports news
        sports_matches = sum(1 for p in self._sports_re if p.search(text))
        if sports_matches >= 2:
            return True, "sports_news"

        # Entertainment news
        entertainment_matches = sum(1 for p in self._entertainment_re if p.search(text))
        if entertainment_matches >= 2:
            return True, "entertainment_news"

        # Business news (without disaster context)
        business_matches = sum(1 for p in self._business_re if p.search(text))
        if business_matches >= 2:
            return True, "business_news"

        # Health news (not environmental)
        health_matches = sum(1 for p in self._health_re if p.search(text))
        if health_matches >= 2:
            return True, "health_news"

        return False, ""

    def _validate_hazard_keywords(self, text: str) -> Tuple[bool, int]:
        """
        Validate that text contains at least one environmental hazard keyword.
        This is a semantic validation to ensure the content is actually about hazards.

        Returns:
            Tuple of (has_hazard_keywords, keyword_count)
        """
        keyword_count = sum(1 for p in self._hazard_keywords_re if p.search(text))

        # Require at least ONE hazard keyword for the text to be considered
        has_keywords = keyword_count >= 1

        return has_keywords, keyword_count

    def _check_active_hazard_signals(self, text: str) -> Tuple[int, float]:
        """
        Check for active hazard event indicators.

        Returns:
            Tuple of (match_count, confidence_boost)
        """
        match_count = sum(1 for p in self._active_hazard_re if p.search(text))

        # Calculate confidence boost based on number of matches
        if match_count >= 4:
            boost = 0.15  # Strong evidence of active event
        elif match_count >= 2:
            boost = 0.10  # Moderate evidence
        elif match_count >= 1:
            boost = 0.05  # Some evidence
        else:
            boost = -0.10  # No active event indicators - reduce confidence

        return match_count, boost

    def _check_philippine_relevance(self, text: str) -> Tuple[bool, int]:
        """
        Check if the hazard is occurring in the Philippines.

        Returns:
            Tuple of (is_philippine_relevant, indicator_count)
        """
        match_count = sum(1 for p in self._philippine_re if p.search(text))

        # Require at least one Philippine indicator for geo-relevance
        is_relevant = match_count >= 1

        return is_relevant, match_count

    def _is_wildfire(self, text: str) -> bool:
        """
        Determine if a fire-classified article is about wildfire (natural fire)
        vs man-made/urban fire. Only wildfire reports should be accepted by the
        RSS pipeline. Uses a two-signal approach: man-made indicators vs wildfire
        indicators.

        Returns:
            True if the fire is a wildfire/natural fire, False if man-made/urban/ambiguous
        """
        man_made_matches = sum(1 for p in self._man_made_fire_re if p.search(text))
        wildfire_matches = sum(1 for p in self._wildfire_indicators_re if p.search(text))

        logger.debug(
            f"Wildfire check: man_made_signals={man_made_matches}, wildfire_signals={wildfire_matches}"
        )

        # Clear wildfire with no man-made indicators
        if wildfire_matches >= 1 and man_made_matches == 0:
            return True

        # Man-made indicators with no wildfire context
        if man_made_matches >= 1 and wildfire_matches == 0:
            return False

        # Both present: wildfire signals must strictly outnumber man-made
        if wildfire_matches > man_made_matches:
            return True

        # Ambiguous or no indicators → reject (conservative: avoid false positives)
        return False

    def _detect_hazard_context(self, text: str) -> Dict:
        """
        Analyze text for ENVIRONMENTAL hazard context clues.
        Uses more specific patterns to avoid matching crime/non-hazard content.

        Returns:
            Dict with context analysis results
        """
        text_lower = text.lower()

        # More specific patterns for environmental hazard context
        context = {
            # Casualties from natural disasters (not crimes)
            'has_casualties': bool(re.search(
                r'\b(?:dead|died|killed|drowned|buried)\s+(?:in|by|due\s+to|from)\s+'
                r'(?:flood|landslide|typhoon|earthquake|fire|storm|eruption|collapse)\b',
                text_lower
            )) or bool(re.search(
                r'\b(?:flood|landslide|typhoon|earthquake|fire|storm|eruption)\s+'
                r'(?:kill(?:s|ed)?|claim(?:s|ed)?)\s+(?:\d+|several|many)\b',
                text_lower
            )) or bool(re.search(
                r'\b(?:death\s+toll|casualties|fatalities)\s+(?:from|due\s+to|in)\s+'
                r'(?:flood|landslide|typhoon|earthquake|fire|storm)\b',
                text_lower
            )),

            # Environmental damage (not crime scenes)
            'has_damage': bool(re.search(
                r'\b(?:houses?|homes?|buildings?|bridges?|roads?|infrastructure)\s+'
                r'(?:destroyed|damaged|collapsed|swept\s+away|washed\s+out|submerged|burned)\b',
                text_lower
            )) or bool(re.search(
                r'\b(?:flood(?:waters?)?|landslide|fire|storm|typhoon)\s+'
                r'(?:destroy(?:s|ed)?|damag(?:es?|ed)|devastat(?:es?|ed))\b',
                text_lower
            )),

            # Displacement from disasters
            'has_displacement': bool(re.search(
                r'\b(?:evacuat(?:ed?|ion)|displaced|stranded|homeless|affected\s+famil)\b',
                text_lower
            )) and bool(re.search(
                r'\b(?:flood|typhoon|fire|storm|landslide|volcano|earthquake)\b',
                text_lower
            )),

            # Emergency response to disasters (not crime response)
            'has_emergency_response': bool(re.search(
                r'\b(?:rescue\s+(?:team|operation|effort)|search\s+and\s+rescue|relief\s+(?:operation|goods))\b',
                text_lower
            )) or bool(re.search(
                r'\b(?:NDRRMC|MDRRMO|BDRRMC|coast\s+guard|BFP|firefighter)\b',
                text_lower
            )),

            # Current/ongoing event
            'is_current': bool(re.search(
                r'\b(?:today|now|currently|ongoing|this\s+morning|last\s+night|earlier\s+today|as\s+of)\b',
                text_lower
            )),

            # Weather systems
            'has_weather_system': bool(re.search(
                r'\b(?:typhoon|storm|monsoon|habagat|low\s+pressure|tropical\s+depression|PAGASA)\b',
                text_lower
            )),

            # Water/river conditions
            'has_water_conditions': bool(re.search(
                r'\b(?:water\s+level|river\s+(?:overflow|rose|rising)|dam\s+(?:release|overflow)|floodwaters?)\b',
                text_lower
            )),

            # Geological activity
            'has_geological': bool(re.search(
                r'\b(?:magnitude|aftershock|tremor|PHIVOLCS|seismic|volcanic|eruption|lava|ashfall)\b',
                text_lower
            )),
        }

        # Calculate context score (0.0 - 1.0) - only count environmental hazard signals
        positive_signals = sum(1 for v in context.values() if v)
        context['signal_count'] = positive_signals
        context['context_score'] = min(1.0, positive_signals * 0.12)

        return context

    def classify(self, text: str, threshold: float = 0.5) -> Dict:
        """
        Enhanced classification with multi-stage filtering for Philippine hazards.

        This method implements:
        1. Pre-filtering: Exclude infrastructure projects, planning, research, etc.
        2. Philippine geo-relevance check
        3. Active hazard event detection
        4. Zero-shot hazard type classification
        5. Confidence adjustment based on context

        Args:
            text: Text to classify (article content, citizen report, etc.)
            threshold: Minimum confidence threshold (0.0-1.0)

        Returns:
            dict: Classification result with enhanced metadata
                {
                    'hazard_type': 'flooding',
                    'score': 0.87,
                    'is_hazard': True,
                    'all_scores': {...},
                    'raw_score': 0.82,  # Before adjustments
                    'exclusion_check': {'excluded': False, 'reason': ''},
                    'philippine_relevant': True,
                    'active_event_signals': 3,
                    'context': {...}
                }
        """
        if self.model is None:
            self.load_model()

        # Empty text check
        if not text or not text.strip():
            return self._empty_result()

        # Truncate very long text for efficiency (keep first 1500 chars)
        text_truncated = text[:1500] if len(text) > 1500 else text

        try:
            # ===== STAGE 1: Pre-filtering (Exclusion Patterns) =====
            should_exclude, exclusion_reason, _ = self._check_exclusion_patterns(text_truncated)

            if should_exclude:
                logger.info(f"Excluded by pre-filter: {exclusion_reason}")
                return {
                    'hazard_type': None,
                    'score': 0.0,
                    'is_hazard': False,
                    'all_scores': {},
                    'raw_score': 0.0,
                    'exclusion_check': {'excluded': True, 'reason': exclusion_reason},
                    'philippine_relevant': False,
                    'active_event_signals': 0,
                    'context': {}
                }

            # ===== STAGE 1.5: Unrelated News Check (Crime, Politics, Sports, etc.) =====
            is_unrelated, unrelated_category = self._check_unrelated_news(text_truncated)

            if is_unrelated:
                logger.info(f"Excluded as unrelated news: {unrelated_category}")
                return {
                    'hazard_type': None,
                    'score': 0.0,
                    'is_hazard': False,
                    'all_scores': {},
                    'raw_score': 0.0,
                    'exclusion_check': {'excluded': True, 'reason': f"unrelated_{unrelated_category}"},
                    'philippine_relevant': False,
                    'active_event_signals': 0,
                    'context': {}
                }

            # ===== STAGE 1.75: Hazard Keyword Validation =====
            has_hazard_keywords, keyword_count = self._validate_hazard_keywords(text_truncated)

            if not has_hazard_keywords:
                logger.info(f"Excluded: No environmental hazard keywords found in text")
                return {
                    'hazard_type': None,
                    'score': 0.0,
                    'is_hazard': False,
                    'all_scores': {},
                    'raw_score': 0.0,
                    'exclusion_check': {'excluded': True, 'reason': 'no_hazard_keywords'},
                    'philippine_relevant': False,
                    'active_event_signals': 0,
                    'context': {},
                    'hazard_keyword_count': 0
                }

            # ===== STAGE 2: Philippine Geo-Relevance Check =====
            is_ph_relevant, ph_indicator_count = self._check_philippine_relevance(text_truncated)

            if not is_ph_relevant:
                logger.debug(f"No Philippine location indicators found")
                # Don't immediately exclude - could still be relevant if hazard terms present
                # But apply a confidence penalty later

            # ===== STAGE 3: Active Hazard Event Detection =====
            active_signal_count, confidence_boost = self._check_active_hazard_signals(text_truncated)

            # ===== STAGE 4: Context Analysis =====
            context = self._detect_hazard_context(text_truncated)

            # ===== STAGE 5: Zero-Shot Classification =====
            result = self.model(text_truncated, self.categories, multi_label=False)

            top_label = result['labels'][0]
            raw_score = result['scores'][0]
            all_scores = dict(zip(result['labels'], result['scores']))

            # ===== STAGE 6: Confidence Adjustment =====
            adjusted_score = raw_score

            # Apply active hazard boost/penalty
            adjusted_score += confidence_boost

            # Apply context boost
            adjusted_score += context['context_score'] * 0.5  # Up to 0.075 boost

            # Apply Philippine relevance penalty if not relevant
            if not is_ph_relevant:
                adjusted_score -= 0.15
                logger.debug(f"Applied Philippine relevance penalty: -0.15")
            elif ph_indicator_count >= 3:
                adjusted_score += 0.05  # Strong Philippine presence boost

            # Clamp to valid range
            adjusted_score = max(0.0, min(1.0, adjusted_score))

            # ===== STAGE 7: Final Decision =====
            is_hazard = adjusted_score >= threshold and is_ph_relevant

            # Additional validation: If no active hazard signals and low context, reject
            if is_hazard and active_signal_count == 0 and context['signal_count'] < 2:
                # Allow clear volcanic bulletin-style reports (e.g., PHIVOLCS minor phreatic eruptions)
                volcanic_bulletin = bool(re.search(r'\bPHIVOLCS\b', text_truncated, re.IGNORECASE)) and bool(
                    re.search(r'\b(volcano|eruption|phreatic)\b', text_truncated, re.IGNORECASE)
                )
                if not volcanic_bulletin:
                    logger.info(
                        f"Rejected: Low active hazard signals ({active_signal_count}) and context ({context['signal_count']})"
                    )
                    is_hazard = False

            # Wildfire-only filter: reject man-made/urban fires, accept only wildfires
            if is_hazard and top_label == 'fire':
                is_wildfire_event = self._is_wildfire(text_truncated)
                if not is_wildfire_event:
                    logger.info(
                        f"Rejected: Fire classified but not wildfire (likely man-made/urban fire)"
                    )
                    is_hazard = False

            logger.info(
                f"Classification: {top_label} | "
                f"raw={raw_score:.3f} → adjusted={adjusted_score:.3f} | "
                f"is_hazard={is_hazard} | "
                f"PH={is_ph_relevant} | "
                f"active_signals={active_signal_count}"
            )

            return {
                'hazard_type': top_label if is_hazard else None,
                'score': float(adjusted_score),
                'is_hazard': is_hazard,
                'all_scores': {k: float(v) for k, v in all_scores.items()},
                'raw_score': float(raw_score),
                'exclusion_check': {'excluded': False, 'reason': ''},
                'philippine_relevant': is_ph_relevant,
                'philippine_indicators': ph_indicator_count,
                'active_event_signals': active_signal_count,
                'hazard_keyword_count': keyword_count,
                'context': context
            }

        except Exception as e:
            logger.error(f"Error during classification: {str(e)}")
            return {
                'hazard_type': None,
                'score': 0.0,
                'is_hazard': False,
                'all_scores': {},
                'error': str(e)
            }

    def _empty_result(self) -> Dict:
        """Return empty result for empty/invalid input."""
        return {
            'hazard_type': None,
            'score': 0.0,
            'is_hazard': False,
            'all_scores': {},
            'raw_score': 0.0,
            'exclusion_check': {'excluded': False, 'reason': 'empty_input'},
            'philippine_relevant': False,
            'active_event_signals': 0,
            'context': {}
        }

    def classify_batch(self, texts: List[str], threshold: float = 0.5) -> List[Dict]:
        """
        Classify multiple texts in batch with enhanced filtering.

        Args:
            texts: List of texts to classify
            threshold: Minimum confidence threshold

        Returns:
            list: List of classification results
        """
        if not texts:
            return []

        logger.info(f"Starting batch classification for {len(texts)} texts")

        results = []
        hazards_found = 0
        excluded_count = 0

        for i, text in enumerate(texts, 1):
            result = self.classify(text, threshold)
            results.append(result)

            if result.get('is_hazard'):
                hazards_found += 1
            if result.get('exclusion_check', {}).get('excluded'):
                excluded_count += 1

            if i % 10 == 0:
                logger.info(f"Processed {i}/{len(texts)} | Hazards: {hazards_found} | Excluded: {excluded_count}")

        logger.info(
            f"Batch complete: {len(results)} texts | "
            f"Hazards: {hazards_found} | "
            f"Excluded: {excluded_count} | "
            f"Precision filter rate: {excluded_count/len(texts)*100:.1f}%"
        )
        return results

    def get_categories(self) -> List[str]:
        """Get the list of supported hazard categories."""
        return self.categories.copy()

    def get_active_model(self) -> Optional[str]:
        """Get the name of the currently loaded model."""
        return self.active_model

    def get_exclusion_patterns_summary(self) -> Dict:
        """
        Get a summary of exclusion patterns for debugging/documentation.

        Returns:
            dict: Summary of pattern categories and counts
        """
        return {
            'infrastructure_patterns': len(self.INFRASTRUCTURE_PATTERNS),
            'planning_patterns': len(self.PLANNING_PATTERNS),
            'advisory_patterns': len(self.ADVISORY_PATTERNS),
            'historical_patterns': len(self.HISTORICAL_PATTERNS),
            'research_patterns': len(self.RESEARCH_PATTERNS),
            'prevention_patterns': len(self.PREVENTION_PATTERNS),
            'non_hazard_patterns': len(self.NON_HAZARD_PATTERNS),
            'man_made_fire_patterns': len(self.MAN_MADE_FIRE_PATTERNS),
            'wildfire_indicators': len(self.WILDFIRE_INDICATORS),
            'crime_patterns': len(self.CRIME_PATTERNS),
            'politics_patterns': len(self.POLITICS_PATTERNS),
            'sports_patterns': len(self.SPORTS_PATTERNS),
            'entertainment_patterns': len(self.ENTERTAINMENT_PATTERNS),
            'business_patterns': len(self.BUSINESS_PATTERNS),
            'health_patterns': len(self.HEALTH_PATTERNS),
            'hazard_keywords': len(self.HAZARD_KEYWORDS),
            'active_hazard_indicators': len(self.ACTIVE_HAZARD_INDICATORS),
            'philippine_indicators': len(self.PHILIPPINE_INDICATORS),
        }


# Global classifier instance (FastAPI pattern - reuse across requests)
classifier = ClimateNLIClassifier()
