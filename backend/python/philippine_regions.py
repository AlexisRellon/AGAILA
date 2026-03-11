"""
Philippine Administrative Region Mapping for GAIA
Complete hierarchical mapping of cities, municipalities, provinces to regions.
Supports Geo-NER location enrichment with regional context.

Adapted from GeoAware with enhancements for GAIA's Supabase integration.
"""

from typing import Dict, Optional, List
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# Comprehensive Philippine Administrative Mapping
# ============================================================================

PHILIPPINE_ADMIN_MAPPING: Dict[str, Dict[str, str]] = {
    # NCR - National Capital Region
    "Manila": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Quezon City": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Caloocan": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Las Piñas": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Makati": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Malabon": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Mandaluyong": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Marikina": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Muntinlupa": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Navotas": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Parañaque": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Pasay": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Pasig": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "San Juan": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Taguig": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Valenzuela": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},
    "Pateros": {"province": "Metro Manila", "region": "NCR", "region_name": "National Capital Region"},

    # CAR - Cordillera Administrative Region
    "Baguio": {"province": "Benguet", "region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Tabuk": {"province": "Kalinga", "region": "CAR", "region_name": "Cordillera Administrative Region"},
    "La Trinidad": {"province": "Benguet", "region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Bontoc": {"province": "Mountain Province", "region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Lagawe": {"province": "Ifugao", "region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Bangued": {"province": "Abra", "region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Luna": {"province": "Apayao", "region": "CAR", "region_name": "Cordillera Administrative Region"},

    # Region I - Ilocos Region
    "Laoag": {"province": "Ilocos Norte", "region": "Region I", "region_name": "Ilocos Region"},
    "Batac": {"province": "Ilocos Norte", "region": "Region I", "region_name": "Ilocos Region"},
    "Vigan": {"province": "Ilocos Sur", "region": "Region I", "region_name": "Ilocos Region"},
    "Candon": {"province": "Ilocos Sur", "region": "Region I", "region_name": "Ilocos Region"},
    "San Fernando": {"province": "La Union", "region": "Region I", "region_name": "Ilocos Region"},
    "Dagupan": {"province": "Pangasinan", "region": "Region I", "region_name": "Ilocos Region"},
    "Alaminos": {"province": "Pangasinan", "region": "Region I", "region_name": "Ilocos Region"},
    "San Carlos": {"province": "Pangasinan", "region": "Region I", "region_name": "Ilocos Region"},
    "Urdaneta": {"province": "Pangasinan", "region": "Region I", "region_name": "Ilocos Region"},

    # Region II - Cagayan Valley
    "Tuguegarao": {"province": "Cagayan", "region": "Region II", "region_name": "Cagayan Valley"},
    "Ilagan": {"province": "Isabela", "region": "Region II", "region_name": "Cagayan Valley"},
    "Cauayan": {"province": "Isabela", "region": "Region II", "region_name": "Cagayan Valley"},
    "Santiago": {"province": "Isabela", "region": "Region II", "region_name": "Cagayan Valley"},
    "Bayombong": {"province": "Nueva Vizcaya", "region": "Region II", "region_name": "Cagayan Valley"},
    "Cabarroguis": {"province": "Quirino", "region": "Region II", "region_name": "Cagayan Valley"},

    # Region III - Central Luzon
    "Angeles": {"province": "Pampanga", "region": "Region III", "region_name": "Central Luzon"},
    "Mabalacat": {"province": "Pampanga", "region": "Region III", "region_name": "Central Luzon"},
    "Olongapo": {"province": "Zambales", "region": "Region III", "region_name": "Central Luzon"},
    "Balanga": {"province": "Bataan", "region": "Region III", "region_name": "Central Luzon"},
    "Malolos": {"province": "Bulacan", "region": "Region III", "region_name": "Central Luzon"},
    "Meycauayan": {"province": "Bulacan", "region": "Region III", "region_name": "Central Luzon"},
    "San Jose del Monte": {"province": "Bulacan", "region": "Region III", "region_name": "Central Luzon"},
    "Cabanatuan": {"province": "Nueva Ecija", "region": "Region III", "region_name": "Central Luzon"},
    "Gapan": {"province": "Nueva Ecija", "region": "Region III", "region_name": "Central Luzon"},
    "Palayan": {"province": "Nueva Ecija", "region": "Region III", "region_name": "Central Luzon"},
    "Science City of Muñoz": {"province": "Nueva Ecija", "region": "Region III", "region_name": "Central Luzon"},
    "San Jose": {"province": "Nueva Ecija", "region": "Region III", "region_name": "Central Luzon"},
    "Tarlac City": {"province": "Tarlac", "region": "Region III", "region_name": "Central Luzon"},
    "Baler": {"province": "Aurora", "region": "Region III", "region_name": "Central Luzon"},

    # Region IV-A - CALABARZON
    "Antipolo": {"province": "Rizal", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Calamba": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Santa Rosa": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Biñan": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON"},
    "San Pedro": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Cabuyao": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON"},
    "San Pablo": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Lucena": {"province": "Quezon", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Tayabas": {"province": "Quezon", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Batangas City": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Lipa": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Tanauan": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Cavite City": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Dasmariñas": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Bacoor": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Imus": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},
    "General Trias": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Tagaytay": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},
    "Trece Martires": {"province": "Cavite", "region": "Region IV-A", "region_name": "CALABARZON"},

    # Region IV-B - MIMAROPA
    "Calapan": {"province": "Oriental Mindoro", "region": "Region IV-B", "region_name": "MIMAROPA"},
    "Puerto Princesa": {"province": "Palawan", "region": "Region IV-B", "region_name": "MIMAROPA"},
    "Mamburao": {"province": "Occidental Mindoro", "region": "Region IV-B", "region_name": "MIMAROPA"},
    "Boac": {"province": "Marinduque", "region": "Region IV-B", "region_name": "MIMAROPA"},
    "Romblon": {"province": "Romblon", "region": "Region IV-B", "region_name": "MIMAROPA"},

    # Region V - Bicol Region
    "Legazpi": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region"},
    "Ligao": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region"},
    "Tabaco": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region"},
    "Naga": {"province": "Camarines Sur", "region": "Region V", "region_name": "Bicol Region"},
    "Iriga": {"province": "Camarines Sur", "region": "Region V", "region_name": "Bicol Region"},
    "Daet": {"province": "Camarines Norte", "region": "Region V", "region_name": "Bicol Region"},
    "Sorsogon City": {"province": "Sorsogon", "region": "Region V", "region_name": "Bicol Region"},
    "Virac": {"province": "Catanduanes", "region": "Region V", "region_name": "Bicol Region"},
    "Masbate City": {"province": "Masbate", "region": "Region V", "region_name": "Bicol Region"},

    # Region VI - Western Visayas
    "Iloilo City": {"province": "Iloilo", "region": "Region VI", "region_name": "Western Visayas"},
    "Roxas": {"province": "Capiz", "region": "Region VI", "region_name": "Western Visayas"},
    "Passi": {"province": "Iloilo", "region": "Region VI", "region_name": "Western Visayas"},
    "Bacolod": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas"},
    "Silay": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas"},
    "Kalibo": {"province": "Aklan", "region": "Region VI", "region_name": "Western Visayas"},
    "San Jose": {"province": "Antique", "region": "Region VI", "region_name": "Western Visayas"},
    "Jordan": {"province": "Guimaras", "region": "Region VI", "region_name": "Western Visayas"},

    # Region VII - Central Visayas
    "Cebu City": {"province": "Cebu", "region": "Region VII", "region_name": "Central Visayas"},
    "Mandaue": {"province": "Cebu", "region": "Region VII", "region_name": "Central Visayas"},
    "Lapu-Lapu": {"province": "Cebu", "region": "Region VII", "region_name": "Central Visayas"},
    "Talisay": {"province": "Cebu", "region": "Region VII", "region_name": "Central Visayas"},
    "Toledo": {"province": "Cebu", "region": "Region VII", "region_name": "Central Visayas"},
    "Danao": {"province": "Cebu", "region": "Region VII", "region_name": "Central Visayas"},
    "Tagbilaran": {"province": "Bohol", "region": "Region VII", "region_name": "Central Visayas"},
    "Dumaguete": {"province": "Negros Oriental", "region": "Region VII", "region_name": "Central Visayas"},
    "Larena": {"province": "Siquijor", "region": "Region VII", "region_name": "Central Visayas"},

    # Region VIII - Eastern Visayas
    "Tacloban": {"province": "Leyte", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Ormoc": {"province": "Leyte", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Baybay": {"province": "Leyte", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Maasin": {"province": "Southern Leyte", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Calbayog": {"province": "Samar", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Catbalogan": {"province": "Samar", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Borongan": {"province": "Eastern Samar", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Catarman": {"province": "Northern Samar", "region": "Region VIII", "region_name": "Eastern Visayas"},
    "Naval": {"province": "Biliran", "region": "Region VIII", "region_name": "Eastern Visayas"},

    # Region IX - Zamboanga Peninsula
    "Zamboanga City": {"province": "Zamboanga del Sur", "region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Pagadian": {"province": "Zamboanga del Sur", "region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Dipolog": {"province": "Zamboanga del Norte", "region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Dapitan": {"province": "Zamboanga del Norte", "region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Isabela City": {"province": "Basilan", "region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Ipil": {"province": "Zamboanga Sibugay", "region": "Region IX", "region_name": "Zamboanga Peninsula"},

    # Region X - Northern Mindanao
    "Cagayan de Oro": {"province": "Misamis Oriental", "region": "Region X", "region_name": "Northern Mindanao"},
    "Iligan": {"province": "Lanao del Norte", "region": "Region X", "region_name": "Northern Mindanao"},
    "Gingoog": {"province": "Misamis Oriental", "region": "Region X", "region_name": "Northern Mindanao"},
    "Oroquieta": {"province": "Misamis Occidental", "region": "Region X", "region_name": "Northern Mindanao"},
    "Ozamiz": {"province": "Misamis Occidental", "region": "Region X", "region_name": "Northern Mindanao"},
    "Tangub": {"province": "Misamis Occidental", "region": "Region X", "region_name": "Northern Mindanao"},
    "Valencia": {"province": "Bukidnon", "region": "Region X", "region_name": "Northern Mindanao"},
    "Malaybalay": {"province": "Bukidnon", "region": "Region X", "region_name": "Northern Mindanao"},
    "El Salvador": {"province": "Misamis Oriental", "region": "Region X", "region_name": "Northern Mindanao"},

    # Region XI - Davao Region
    "Davao City": {"province": "Davao del Sur", "region": "Region XI", "region_name": "Davao Region"},
    "Tagum": {"province": "Davao del Norte", "region": "Region XI", "region_name": "Davao Region"},
    "Panabo": {"province": "Davao del Norte", "region": "Region XI", "region_name": "Davao Region"},
    "Samal": {"province": "Davao del Norte", "region": "Region XI", "region_name": "Davao Region"},
    "Digos": {"province": "Davao del Sur", "region": "Region XI", "region_name": "Davao Region"},
    "Mati": {"province": "Davao Oriental", "region": "Region XI", "region_name": "Davao Region"},

    # Region XII - SOCCSKSARGEN
    "General Santos": {"province": "South Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Koronadal": {"province": "South Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Tacurong": {"province": "Sultan Kudarat", "region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Kidapawan": {"province": "Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Cotabato City": {"province": "Maguindanao", "region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Alabel": {"province": "Sarangani", "region": "Region XII", "region_name": "SOCCSKSARGEN"},

    # Region XIII - Caraga
    "Butuan": {"province": "Agusan del Norte", "region": "Region XIII", "region_name": "Caraga"},
    "Cabadbaran": {"province": "Agusan del Norte", "region": "Region XIII", "region_name": "Caraga"},
    "Bayugan": {"province": "Agusan del Sur", "region": "Region XIII", "region_name": "Caraga"},
    "Surigao": {"province": "Surigao del Norte", "region": "Region XIII", "region_name": "Caraga"},
    "Bislig": {"province": "Surigao del Sur", "region": "Region XIII", "region_name": "Caraga"},
    "Tandag": {"province": "Surigao del Sur", "region": "Region XIII", "region_name": "Caraga"},
    "San Francisco": {"province": "Agusan del Sur", "region": "Region XIII", "region_name": "Caraga"},

    # BARMM - Bangsamoro Autonomous Region in Muslim Mindanao
    "Marawi": {"province": "Lanao del Sur", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Lamitan": {"province": "Basilan", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Jolo": {"province": "Sulu", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Bongao": {"province": "Tawi-Tawi", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
}


# ============================================================================
# Province to Region Mapping for Quick Lookup
# ============================================================================

PROVINCE_TO_REGION: Dict[str, Dict[str, str]] = {
    "Metro Manila": {"region": "NCR", "region_name": "National Capital Region"},
    "Abra": {"region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Benguet": {"region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Ifugao": {"region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Kalinga": {"region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Mountain Province": {"region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Apayao": {"region": "CAR", "region_name": "Cordillera Administrative Region"},
    "Ilocos Norte": {"region": "Region I", "region_name": "Ilocos Region"},
    "Ilocos Sur": {"region": "Region I", "region_name": "Ilocos Region"},
    "La Union": {"region": "Region I", "region_name": "Ilocos Region"},
    "Pangasinan": {"region": "Region I", "region_name": "Ilocos Region"},
    "Cagayan": {"region": "Region II", "region_name": "Cagayan Valley"},
    "Isabela": {"region": "Region II", "region_name": "Cagayan Valley"},
    "Nueva Vizcaya": {"region": "Region II", "region_name": "Cagayan Valley"},
    "Quirino": {"region": "Region II", "region_name": "Cagayan Valley"},
    "Bataan": {"region": "Region III", "region_name": "Central Luzon"},
    "Bulacan": {"region": "Region III", "region_name": "Central Luzon"},
    "Nueva Ecija": {"region": "Region III", "region_name": "Central Luzon"},
    "Pampanga": {"region": "Region III", "region_name": "Central Luzon"},
    "Tarlac": {"region": "Region III", "region_name": "Central Luzon"},
    "Zambales": {"region": "Region III", "region_name": "Central Luzon"},
    "Aurora": {"region": "Region III", "region_name": "Central Luzon"},
    "Batangas": {"region": "Region IV-A", "region_name": "CALABARZON"},
    "Cavite": {"region": "Region IV-A", "region_name": "CALABARZON"},
    "Laguna": {"region": "Region IV-A", "region_name": "CALABARZON"},
    "Quezon": {"region": "Region IV-A", "region_name": "CALABARZON"},
    "Rizal": {"region": "Region IV-A", "region_name": "CALABARZON"},
    "Marinduque": {"region": "Region IV-B", "region_name": "MIMAROPA"},
    "Occidental Mindoro": {"region": "Region IV-B", "region_name": "MIMAROPA"},
    "Oriental Mindoro": {"region": "Region IV-B", "region_name": "MIMAROPA"},
    "Palawan": {"region": "Region IV-B", "region_name": "MIMAROPA"},
    "Romblon": {"region": "Region IV-B", "region_name": "MIMAROPA"},
    "Albay": {"region": "Region V", "region_name": "Bicol Region"},
    "Camarines Norte": {"region": "Region V", "region_name": "Bicol Region"},
    "Camarines Sur": {"region": "Region V", "region_name": "Bicol Region"},
    "Catanduanes": {"region": "Region V", "region_name": "Bicol Region"},
    "Masbate": {"region": "Region V", "region_name": "Bicol Region"},
    "Sorsogon": {"region": "Region V", "region_name": "Bicol Region"},
    "Aklan": {"region": "Region VI", "region_name": "Western Visayas"},
    "Antique": {"region": "Region VI", "region_name": "Western Visayas"},
    "Capiz": {"region": "Region VI", "region_name": "Western Visayas"},
    "Guimaras": {"region": "Region VI", "region_name": "Western Visayas"},
    "Iloilo": {"region": "Region VI", "region_name": "Western Visayas"},
    "Negros Occidental": {"region": "Region VI", "region_name": "Western Visayas"},
    "Bohol": {"region": "Region VII", "region_name": "Central Visayas"},
    "Cebu": {"region": "Region VII", "region_name": "Central Visayas"},
    "Negros Oriental": {"region": "Region VII", "region_name": "Central Visayas"},
    "Siquijor": {"region": "Region VII", "region_name": "Central Visayas"},
    "Biliran": {"region": "Region VIII", "region_name": "Eastern Visayas"},
    "Eastern Samar": {"region": "Region VIII", "region_name": "Eastern Visayas"},
    "Leyte": {"region": "Region VIII", "region_name": "Eastern Visayas"},
    "Northern Samar": {"region": "Region VIII", "region_name": "Eastern Visayas"},
    "Samar": {"region": "Region VIII", "region_name": "Eastern Visayas"},
    "Southern Leyte": {"region": "Region VIII", "region_name": "Eastern Visayas"},
    "Zamboanga del Norte": {"region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Zamboanga del Sur": {"region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Zamboanga Sibugay": {"region": "Region IX", "region_name": "Zamboanga Peninsula"},
    "Bukidnon": {"region": "Region X", "region_name": "Northern Mindanao"},
    "Camiguin": {"region": "Region X", "region_name": "Northern Mindanao"},
    "Lanao del Norte": {"region": "Region X", "region_name": "Northern Mindanao"},
    "Misamis Occidental": {"region": "Region X", "region_name": "Northern Mindanao"},
    "Misamis Oriental": {"region": "Region X", "region_name": "Northern Mindanao"},
    "Davao de Oro": {"region": "Region XI", "region_name": "Davao Region"},
    "Davao del Norte": {"region": "Region XI", "region_name": "Davao Region"},
    "Davao del Sur": {"region": "Region XI", "region_name": "Davao Region"},
    "Davao Occidental": {"region": "Region XI", "region_name": "Davao Region"},
    "Davao Oriental": {"region": "Region XI", "region_name": "Davao Region"},
    "Cotabato": {"region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Sarangani": {"region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "South Cotabato": {"region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Sultan Kudarat": {"region": "Region XII", "region_name": "SOCCSKSARGEN"},
    "Agusan del Norte": {"region": "Region XIII", "region_name": "Caraga"},
    "Agusan del Sur": {"region": "Region XIII", "region_name": "Caraga"},
    "Dinagat Islands": {"region": "Region XIII", "region_name": "Caraga"},
    "Surigao del Norte": {"region": "Region XIII", "region_name": "Caraga"},
    "Surigao del Sur": {"region": "Region XIII", "region_name": "Caraga"},
    "Basilan": {"region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Lanao del Sur": {"region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Maguindanao": {"region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Sulu": {"region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
    "Tawi-Tawi": {"region": "BARMM", "region_name": "Bangsamoro Autonomous Region"},
}


# ============================================================================
# Helper Functions
# ============================================================================

# ============================================================================
# Philippine Volcanoes & Landmarks to Region Mapping
# Maps well-known geographic features to their administrative locations.
# Enables correct region resolution when articles mention e.g. "Mayon" instead
# of a city or province name.
# ============================================================================

PHILIPPINE_LANDMARKS: Dict[str, Dict[str, str]] = {
    # --- Active / Well-known Volcanoes ---
    "Mayon": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Mayon Volcano": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Mount Mayon": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Mt. Mayon": {"province": "Albay", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},

    "Taal": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "volcano"},
    "Taal Volcano": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "volcano"},
    "Mount Taal": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "volcano"},

    "Pinatubo": {"province": "Zambales", "region": "Region III", "region_name": "Central Luzon", "landmark_type": "volcano"},
    "Mount Pinatubo": {"province": "Zambales", "region": "Region III", "region_name": "Central Luzon", "landmark_type": "volcano"},
    "Mt. Pinatubo": {"province": "Zambales", "region": "Region III", "region_name": "Central Luzon", "landmark_type": "volcano"},

    "Kanlaon": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas", "landmark_type": "volcano"},
    "Kanlaon Volcano": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas", "landmark_type": "volcano"},
    "Mount Kanlaon": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas", "landmark_type": "volcano"},
    "Mt. Kanlaon": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas", "landmark_type": "volcano"},
    "Canlaon": {"province": "Negros Occidental", "region": "Region VI", "region_name": "Western Visayas", "landmark_type": "volcano"},

    "Bulusan": {"province": "Sorsogon", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Bulusan Volcano": {"province": "Sorsogon", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Mount Bulusan": {"province": "Sorsogon", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},

    "Hibok-Hibok": {"province": "Camiguin", "region": "Region X", "region_name": "Northern Mindanao", "landmark_type": "volcano"},
    "Mount Hibok-Hibok": {"province": "Camiguin", "region": "Region X", "region_name": "Northern Mindanao", "landmark_type": "volcano"},

    "Apo": {"province": "Davao del Sur", "region": "Region XI", "region_name": "Davao Region", "landmark_type": "volcano"},
    "Mount Apo": {"province": "Davao del Sur", "region": "Region XI", "region_name": "Davao Region", "landmark_type": "volcano"},
    "Mt. Apo": {"province": "Davao del Sur", "region": "Region XI", "region_name": "Davao Region", "landmark_type": "volcano"},

    "Smith": {"province": "Bataan", "region": "Region III", "region_name": "Central Luzon", "landmark_type": "volcano"},
    "Mount Smith": {"province": "Bataan", "region": "Region III", "region_name": "Central Luzon", "landmark_type": "volcano"},

    "Banahaw": {"province": "Quezon", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "volcano"},
    "Mount Banahaw": {"province": "Quezon", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "volcano"},

    "Isarog": {"province": "Camarines Sur", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Mount Isarog": {"province": "Camarines Sur", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},

    "Iriga": {"province": "Camarines Sur", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},
    "Mount Iriga": {"province": "Camarines Sur", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},

    "Ragang": {"province": "Lanao del Sur", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region", "landmark_type": "volcano"},
    "Mount Ragang": {"province": "Lanao del Sur", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region", "landmark_type": "volcano"},

    "Matutum": {"province": "South Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN", "landmark_type": "volcano"},
    "Mount Matutum": {"province": "South Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN", "landmark_type": "volcano"},

    "Parker": {"province": "South Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN", "landmark_type": "volcano"},
    "Mount Parker": {"province": "South Cotabato", "region": "Region XII", "region_name": "SOCCSKSARGEN", "landmark_type": "volcano"},

    "Musuan": {"province": "Bukidnon", "region": "Region X", "region_name": "Northern Mindanao", "landmark_type": "volcano"},
    "Mount Musuan": {"province": "Bukidnon", "region": "Region X", "region_name": "Northern Mindanao", "landmark_type": "volcano"},

    "Leonard Kniaseff": {"province": "Sorsogon", "region": "Region V", "region_name": "Bicol Region", "landmark_type": "volcano"},

    "Mayabobo": {"province": "Agusan del Sur", "region": "Region XIII", "region_name": "Caraga", "landmark_type": "volcano"},

    # --- Lakes commonly referenced in hazard context ---
    "Taal Lake": {"province": "Batangas", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "lake"},
    "Laguna de Bay": {"province": "Laguna", "region": "Region IV-A", "region_name": "CALABARZON", "landmark_type": "lake"},
    "Lake Lanao": {"province": "Lanao del Sur", "region": "BARMM", "region_name": "Bangsamoro Autonomous Region", "landmark_type": "lake"},
}


def get_region_from_location(
    city: Optional[str] = None,
    province: Optional[str] = None
) -> Optional[Dict[str, str]]:
    """
    Get region information from city or province name.
    
    Args:
        city: City or municipality name
        province: Province name
        
    Returns:
        dict: Dictionary with region and region_name, or None if not found
        Example: {'region': 'NCR', 'region_name': 'National Capital Region', 'province': 'Metro Manila'}
    
    Example:
        >>> get_region_from_location(city="Manila")
        {'region': 'NCR', 'region_name': 'National Capital Region', 'province': 'Metro Manila'}
        
        >>> get_region_from_location(province="Cebu")
        {'region': 'Region VII', 'region_name': 'Central Visayas'}
    """
    # Try direct city lookup first
    if city:
        city_clean = city.strip()
        if city_clean in PHILIPPINE_ADMIN_MAPPING:
            return PHILIPPINE_ADMIN_MAPPING[city_clean]
        
        # Try case-insensitive match
        for key, value in PHILIPPINE_ADMIN_MAPPING.items():
            if key.lower() == city_clean.lower():
                return value
        
        # Try landmark lookup (volcanoes, lakes, etc.)
        if city_clean in PHILIPPINE_LANDMARKS:
            return PHILIPPINE_LANDMARKS[city_clean]
        for key, value in PHILIPPINE_LANDMARKS.items():
            if key.lower() == city_clean.lower():
                return value
    
    # Try province lookup
    if province:
        province_clean = province.strip()
        if province_clean in PROVINCE_TO_REGION:
            return PROVINCE_TO_REGION[province_clean]
        
        # Try case-insensitive match
        for key, value in PROVINCE_TO_REGION.items():
            if key.lower() == province_clean.lower():
                return value
    
    return None


def normalize_location_with_region(
    location_name: str,
    city: Optional[str] = None,
    province: Optional[str] = None
) -> Dict[str, Optional[str]]:
    """
    Normalize a location and add Philippine administrative region data.
    
    Args:
        location_name: Original location name
        city: Detected city name
        province: Detected province name
        
    Returns:
        dict: Normalized location data with region information
        Example:
        {
            'location_name': 'Manila',
            'city': 'Manila',
            'province': 'Metro Manila',
            'region': 'NCR',
            'region_name': 'National Capital Region'
        }
    
    Example:
        >>> normalize_location_with_region("Manila", city="Manila")
        {'location_name': 'Manila', 'city': 'Manila', 'province': 'Metro Manila', 
         'region': 'NCR', 'region_name': 'National Capital Region'}
    """
    result: Dict[str, Optional[str]] = {
        'location_name': location_name,
        'city': city,
        'province': province,
        'region': None,
        'region_name': None
    }
    
    # Try to get region from city or province
    region_data = get_region_from_location(city, province)
    
    if region_data:
        result['region'] = region_data.get('region')
        result['region_name'] = region_data.get('region_name')
        
        # Fill in missing province if we found it via city
        if not result['province'] and 'province' in region_data:
            result['province'] = region_data['province']
    
    return result


def get_all_cities() -> List[str]:
    """Get list of all cities in the mapping."""
    return list(PHILIPPINE_ADMIN_MAPPING.keys())


def get_all_provinces() -> List[str]:
    """Get list of all provinces in the mapping."""
    return list(PROVINCE_TO_REGION.keys())


def get_all_regions() -> List[str]:
    """Get list of all unique region codes."""
    regions = set()
    for data in PROVINCE_TO_REGION.values():
        regions.add(data['region'])
    return sorted(list(regions))


def get_cities_by_region(region: str) -> List[str]:
    """
    Get all cities belonging to a specific region.
    
    Args:
        region: Region code (e.g., 'NCR', 'Region I', 'CAR')
        
    Returns:
        list: City names in that region
    """
    cities = []
    for city, data in PHILIPPINE_ADMIN_MAPPING.items():
        if data['region'].lower() == region.lower():
            cities.append(city)
    return sorted(cities)


def get_provinces_by_region(region: str) -> List[str]:
    """
    Get all provinces belonging to a specific region.
    
    Args:
        region: Region code (e.g., 'NCR', 'Region I', 'CAR')
        
    Returns:
        list: Province names in that region
    """
    provinces = []
    for province, data in PROVINCE_TO_REGION.items():
        if data['region'].lower() == region.lower():
            provinces.append(province)
    return sorted(provinces)


# ============================================================================
# Stats for logging
# ============================================================================

logger.info(f"Philippine administrative mapping loaded: {len(PHILIPPINE_ADMIN_MAPPING)} cities, {len(PROVINCE_TO_REGION)} provinces")
