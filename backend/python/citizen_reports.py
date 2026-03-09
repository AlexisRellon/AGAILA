"""
Citizen Report Submission Endpoints
Module: CR-03, CR-04
Handles public hazard report submission with Cloudflare Turnstile verification
"""

import os
import logging
import sys
import uuid
from datetime import datetime
from typing import Optional, Dict
import httpx
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, status, Request
from pydantic import BaseModel, Field, validator

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.supabase_client import supabase

# Rate limiting to prevent report spam (CR-03)
from backend.python.middleware.redis_rate_limiter import get_redis

# Import ActivityLogger for comprehensive activity tracking
from backend.python.middleware.activity_logger import ActivityLogger

# Import AI models for Zero-Shot classification and GeoNER
from backend.python.models.classifier import classifier
from backend.python.models.geo_ner import geo_ner

# Import phone validation utility
from backend.python.utils.phone_validation import is_valid_philippine_phone_number

# Import shared geocoding utility for reverse geocoding (coords -> address)
from backend.python.utils.geocoding import get_address_from_coordinates_async

# Import field-level encryption for PII protection (RA 10173 compliance)
from backend.python.utils.field_encryption import encrypt_pii_fields, decrypt_pii_fields

logger = logging.getLogger(__name__)

# Initialize router - main.py adds /api/v1 prefix, so this becomes /api/v1/citizen-reports
router = APIRouter(prefix="/citizen-reports", tags=["Citizen Reports"])

# Supabase client imported from centralized configuration
logger.info("✓ Supabase client initialized for citizen reports")

# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class ReportSubmissionResponse(BaseModel):
    """Response after successful report submission"""
    tracking_id: str = Field(..., description="Unique tracking ID for the report")
    message: str = Field(..., description="Confirmation message")
    status: str = Field(default="pending_verification", description="Initial status")
    submitted_at: datetime = Field(..., description="Timestamp of submission")


class ReportTrackingResponse(BaseModel):
    """Response for report tracking queries"""
    tracking_id: str
    status: str
    hazard_type: str
    location_name: str
    description: str
    submitted_at: datetime
    verified_at: Optional[datetime] = None
    confidence_score: float = Field(..., description="AI confidence score (0.0-1.0)")
    notes: Optional[str] = None



# =============================================================================
# TURNSTILE VERIFICATION
# =============================================================================

async def verify_turnstile(token: str, remoteip: Optional[str] = None) -> dict:
    """
    Verify Cloudflare Turnstile token with Cloudflare's API
    
    Args:
        token: The Turnstile response token from the frontend
        remoteip: Optional IP address of the user
        
    Returns:
        dict: Verification response from Cloudflare
        
    Raises:
        HTTPException: If verification fails
    """
    secret_key = os.getenv("REACT_APP_TURNSTILE_SECRET_KEY")
    
    if not secret_key:
        logger.error("REACT_APP_TURNSTILE_SECRET_KEY not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Turnstile verification not configured"
        )
    
    # Make request to Cloudflare's verification API
    verify_url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    
    payload = {
        "secret": secret_key,
        "response": token
    }
    
    if remoteip:
        payload["remoteip"] = remoteip
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(verify_url, json=payload, timeout=10.0)
            result = response.json()
            
            logger.info(f"Turnstile verification result: {result}")
            
            if not result.get("success"):
                error_codes = result.get("error-codes", [])
                logger.warning(f"Turnstile verification failed: {error_codes}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Turnstile verification failed: {error_codes}"
                )
            
            # Turnstile doesn't use scores, just success/failure
            # Additional checks can be added here if needed
            
            return result
            
    except httpx.RequestError as e:
        logger.error(f"Turnstile verification request failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Turnstile verification service unavailable"
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================

# Per-IP cooldown (seconds) between report submissions to prevent burst spam
SUBMISSION_COOLDOWN_SECONDS = 300  # 5 minutes


def _get_client_identifier(request: Request) -> str:
    """Get client identifier for cooldown (IP)."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    return f"ip:{ip}"


@router.post("/submit", response_model=ReportSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_citizen_report(
    request: Request,
    # captcha_token: str = Form(..., description="Cloudflare Turnstile token"),  # TEMPORARILY DISABLED
    captcha_token: Optional[str] = Form(None, description="Cloudflare Turnstile token (optional)"),
    hazard_type: str = Form(..., description="Type of hazard"),
    description: str = Form(..., min_length=10, max_length=2000, description="Hazard description"),
    name: str = Form(..., min_length=2, max_length=100, description="Reporter's name"),
    contact_number: str = Form(..., description="Reporter's contact number (Philippine phone number)"),
    latitude: float = Form(..., ge=-90, le=90, description="Latitude coordinate (required, from map picker/GPS)"),
    longitude: float = Form(..., ge=-180, le=180, description="Longitude coordinate (required, from map picker/GPS)"),
    contact_method: Optional[str] = Form(None, description="Optional contact method"),
    image: Optional[UploadFile] = File(None, description="Optional hazard photo"),
    image_metadata: Optional[dict] = Form(None, description="Metadata of the uploaded image")
):
    """
    Submit a citizen hazard report (CR-01, CR-03, CR-04)
    
    - **captcha_token**: Cloudflare Turnstile token for bot prevention
    - **hazard_type**: Type of hazard (flood, typhoon, etc.)
    - **description**: Detailed description of the hazard (10-2000 characters)
    - **name**: Reporter's full name (required, 2-100 characters)
    - **contact_number**: Reporter's Philippine phone number (required, validated)
    - **latitude/longitude**: GPS coordinates (required, from map picker or GPS)
    - **contact_method**: Optional contact information
    - **image**: Optional photo of the hazard
    
    Location is pinned on the map (required). location_name is derived via reverse geocoding.
    
    Returns tracking ID for checking report status.
    """
    
    # Validate Supabase connection
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )
    
    # Validate name
    name = name.strip()
    if not name or len(name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be at least 2 characters"
        )
    if len(name) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be 100 characters or less"
        )
    
    # Validate Philippine phone number
    contact_number = contact_number.strip()
    if not contact_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contact number is required"
        )
    
    if not is_valid_philippine_phone_number(contact_number):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid Philippine phone number (e.g., 09123456789, +63 912 345 6789)"
        )
    
    # Cooldown: prevent same IP from submitting again within SUBMISSION_COOLDOWN_SECONDS
    redis_client = get_redis()
    if redis_client:
        identifier = _get_client_identifier(request)
        cooldown_key = f"citizen_report_cooldown:{identifier}"
        try:
            if redis_client.exists(cooldown_key):
                ttl = redis_client.ttl(cooldown_key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "Submission cooldown",
                        "message": "Please wait before submitting another report. This helps prevent spam.",
                        "retry_after": max(1, ttl),
                    },
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Cooldown check failed (continuing): {e}")
    
    # 1. Verify Turnstile - TEMPORARILY DISABLED
    # try:
    #     if captcha_token:
    #         turnstile_result = await verify_turnstile(captcha_token)
    #         logger.info(f"Turnstile verified successfully")
    #     else:
    #         logger.warning("No captcha_token provided - Turnstile verification skipped (CAPTCHA disabled)")
    # except HTTPException:
    #     raise
    # except Exception as e:
    #     logger.error(f"Unexpected error in Turnstile verification: {e}")
    #     raise HTTPException(
    #         status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    #         detail="Error verifying Turnstile token"
    #     )
    
    # 2. Reverse geocode coordinates to get human-readable location_name for storage
    location_name = await get_address_from_coordinates_async(latitude, longitude)
    if not location_name:
        location_name = f"{latitude:.6f}, {longitude:.6f}"
        logger.info(f"Reverse geocoding failed; using coordinate string as location_name")
    
    # 3. AI Processing: Zero-Shot Classification
    ai_hazard_type = None
    ai_confidence = 0.0
    coordinates_source = "user"
    
    try:
        # Combine location_name and description for better context
        combined_text = f"{location_name}. {description}"
        
        # Zero-Shot Classification: Verify/classify hazard type from description
        logger.info(f"Running Zero-Shot classification on report description...")
        classification_result = classifier.classify(combined_text, threshold=0.3)
        
        if classification_result.get('is_hazard') and classification_result.get('hazard_type'):
            ai_hazard_type = classification_result['hazard_type']
            ai_confidence = classification_result['score']
            logger.info(f"AI classified hazard as: {ai_hazard_type} (confidence: {ai_confidence:.3f})")
        else:
            logger.info(f"AI did not detect a clear hazard type (confidence too low)")
        
    except Exception as e:
        logger.error(f"Error during AI processing: {e}", exc_info=True)
        # Don't fail the submission if AI processing fails - continue with user-provided data
    
    # 4. Coordinates come directly from user (required from map picker)
    final_latitude = latitude
    final_longitude = longitude
    
    # 5. Validate Philippine boundaries (4-21°N, 116-127°E)
    if not (4 <= final_latitude <= 21 and 116 <= final_longitude <= 127):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coordinates must be within the Philippines (4-21°N, 116-127°E)"
        )
    
    # 5. Generate unique tracking ID
    tracking_id = f"CR{datetime.utcnow().strftime('%Y%m%d')}{str(uuid.uuid4())[:8].upper()}"
    
    # 6. Handle image upload (if provided)
    image_url = None
    image_metadata = None
    
    if image and image.filename:
        try:
            # Security: Validate file type and extension
            ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
            ALLOWED_MIME_TYPES = {'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'}
            
            # Validate MIME type
            if image.content_type and image.content_type not in ALLOWED_MIME_TYPES:
                raise ValueError(f"Invalid file type: {image.content_type}. Only images are allowed.")
            
            # Sanitize and validate file extension
            original_filename = image.filename.lower()
            file_extension = original_filename.split('.')[-1] if '.' in original_filename else 'jpg'
            
            # Security: Whitelist file extensions to prevent executable uploads
            if file_extension not in ALLOWED_EXTENSIONS:
                raise ValueError(f"Invalid file extension: {file_extension}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
            
            # Security: Generate safe filename - use tracking_id (server-generated) + validated extension
            # This prevents path traversal attacks since tracking_id is server-controlled
            unique_filename = f"citizen-reports/{tracking_id}.{file_extension}"
            
            # Security: Validate filename doesn't contain path traversal attempts
            if '..' in unique_filename or '/' not in unique_filename or unique_filename.startswith('/'):
                raise ValueError("Invalid filename format detected")
            
            # Read image content
            image_content = await image.read()
            
            # Security: Validate file size (5MB limit)
            MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
            if len(image_content) > MAX_FILE_SIZE:
                raise ValueError(f"File size exceeds {MAX_FILE_SIZE / (1024*1024)}MB limit")
            
            # Upload to Supabase Storage
            storage_response = supabase.storage.from_("citizen-report-images").upload(
                path=unique_filename,
                file=image_content,
                file_options={"content-type": image.content_type or "image/jpeg"}
            )
            
            # Get public URL - manually construct with proper URL encoding for security
            # Format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
            from lib.supabase_client import SUPABASE_URL
            from urllib.parse import quote
            
            # Security: URL encode the path to prevent injection attacks
            # The bucket name is hardcoded, and path is server-controlled, so this is safe
            encoded_path = quote(unique_filename, safe='/')  # Keep '/' for path structure
            image_url = f"{SUPABASE_URL}/storage/v1/object/public/citizen-report-images/{encoded_path}"
            
            # Verify the URL was generated correctly
            logger.info(f"Image uploaded successfully: {unique_filename}")
            logger.debug(f"Image public URL: {image_url}")
            
            image_metadata = {
                "filename": image.filename,  # Store original for reference
                "content_type": image.content_type,
                "size": len(image_content),
                "stored_path": unique_filename  # Store server-controlled path
            }
            
        except ValueError as e:
            # Security: Don't expose internal errors, log them instead
            logger.error(f"Image validation failed: {e}")
            image_url = None
            image_metadata = {"error": "Invalid image file"}
        except Exception as e:
            logger.error(f"Image upload failed: {e}")
            # Don't fail the entire request if image upload fails
            image_url = None
            image_metadata = {"error": "Upload failed"}
    
    # 7. Insert report into database with UNVERIFIED status and AI-enhanced confidence (CR-04)
    try:
        # Calculate confidence score: base 30% + AI confidence boost (if AI detected hazard)
        base_confidence = 0.30
        if ai_confidence > 0.5:  # If AI has high confidence, boost the score
            # Blend user selection with AI confidence (weighted average)
            confidence_score = min(0.95, base_confidence + (ai_confidence * 0.4))
        else:
            confidence_score = base_confidence
        
        # Build report data - only include location if coordinates are provided
        # Note: image_url column is TEXT[] array, so we need to pass an array
        report_data = {
            "tracking_id": tracking_id,
            "hazard_type": hazard_type,
            "description": description,
            "location_name": location_name,
            "name": name,  # Will be encrypted below
            "contact_number": contact_number,  # Will be encrypted below
            "contact_method": contact_method,  # Will be encrypted below
            "image_url": [image_url] if image_url else None,  # Convert string to array for TEXT[] column
            "image_metadata": image_metadata,
            "source": "citizen_unverified",
            "confidence_score": confidence_score,
            "status": "unverified",
            # "recaptcha_score": recaptcha_result.get("score", 0.0),  # TEMPORARILY DISABLED
            "captcha_token": "<TOKEN PLACEHOLDER>",  # Edit This when re-enabling CAPTCHA
            "submitted_at": datetime.utcnow().isoformat(),
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Add coordinates if available (from user or AI extraction)
        if final_latitude is not None and final_longitude is not None:
            report_data["latitude"] = final_latitude
            report_data["longitude"] = final_longitude
            report_data["location"] = f"POINT({final_longitude} {final_latitude})"
        
        # Store AI processing metadata in image_metadata or create separate metadata field
        # For now, we'll add it to image_metadata if it exists, otherwise create it
        ai_metadata = {
            "ai_hazard_type": ai_hazard_type,
            "ai_confidence": ai_confidence,
            "coordinates_source": coordinates_source,
            "ai_processing_timestamp": datetime.utcnow().isoformat()
        }
        
        if image_metadata:
            image_metadata["ai_processing"] = ai_metadata
        else:
            image_metadata = {"ai_processing": ai_metadata}
        
        report_data["image_metadata"] = image_metadata
        
        # 8. Encrypt PII fields before database storage (RA 10173 compliance)
        # Fields: name, contact_number, contact_method
        logger.info("Encrypting PII fields for storage")
        report_data = encrypt_pii_fields(report_data)
        
        result = supabase.schema("gaia").from_("citizen_reports").insert(report_data).execute()
        
        if not result.data:
            raise Exception("Database insert failed - no data returned")
        
        logger.info(f"Citizen report created: {tracking_id} (PII encrypted)")
        # Log public submission activity (anonymous user)
        # Note: Do NOT log actual PII values, only metadata
        try:
            await ActivityLogger.log_activity(
                user_context=None,
                action="SUBMIT_CITIZEN_REPORT",
                request=request,
                resource_type="citizen_report",
                resource_id=tracking_id,
                details={
                    "hazard_type": hazard_type,
                    "location_name": location_name,
                    "has_name": bool(name),  # Changed from logging actual name
                    "has_contact_number": bool(contact_number),
                    "confidence_score": confidence_score,
                    "source": "citizen_unverified",
                    "ai_hazard_type": ai_hazard_type,
                    "ai_confidence": ai_confidence,
                    "coordinates_source": coordinates_source,
                    "has_coordinates": final_latitude is not None and final_longitude is not None,
                    "pii_encrypted": True  # Security audit marker
                }
            )
        except Exception:
            logger.warning("ActivityLogger failed for submit_citizen_report; continuing.")

        # Set cooldown so same IP cannot submit again for SUBMISSION_COOLDOWN_SECONDS
        if redis_client:
            try:
                cooldown_key = f"citizen_report_cooldown:{_get_client_identifier(request)}"
                redis_client.setex(cooldown_key, SUBMISSION_COOLDOWN_SECONDS, "1")
            except Exception as e:
                logger.warning(f"Cooldown set failed (non-fatal): {e}")

        return ReportSubmissionResponse(
            tracking_id=tracking_id,
            message="Thank you for your report! It will be reviewed by authorities.",
            status="pending_verification",
            submitted_at=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Failed to create citizen report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit report. Please try again later."
        )


@router.get("/track/{tracking_id}", response_model=ReportTrackingResponse)
async def track_citizen_report(tracking_id: str, request: Request):
    """
    Track the status of a submitted citizen report
    
    - **tracking_id**: Unique tracking ID provided after submission
    
    Returns current status and details of the report.
    """
    
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )
    
    try:
        # Query report by tracking ID
        result = supabase.schema("gaia").from_("citizen_reports") \
            .select("*") \
            .eq("tracking_id", tracking_id) \
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report not found with tracking ID: {tracking_id}"
            )
        
        report = result.data[0]

        # Log report tracking/view action (anonymous/public)
        try:
            await ActivityLogger.log_activity(
                user_context=None,
                action="VIEW_REPORT_TRACK",
                request=request,
                resource_type="citizen_report",
                resource_id=tracking_id,
                details={"status": report.get("status")}
            )
        except Exception:
            logger.debug("ActivityLogger failed for track_citizen_report; continuing.")

        return ReportTrackingResponse(
            tracking_id=report["tracking_id"],
            status=report["status"],
            hazard_type=report["hazard_type"],
            location_name=report["location_name"],
            description=report["description"],
            submitted_at=datetime.fromisoformat(report["submitted_at"]),
            verified_at=datetime.fromisoformat(report["verified_at"]) if report.get("verified_at") else None,
            confidence_score=report["confidence_score"],
            notes=report.get("notes")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error tracking citizen report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"Error retrieving report status": str(e)},
        )
