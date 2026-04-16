"""
Admin Dashboard API for GAIA
Provides endpoints for user management, audit logs, system configuration, and report triage.

Supports: AC-01 (Audit Logs), AC-02 (Config Management), AC-04 (Report Triage), 
          AC-06 (User Deactivation), UM-01 (Account Creation), UM-02 (Role Assignment), 
          UM-03 (Profile Management)
"""

import os
import logging
import sys
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from pydantic import BaseModel, Field, EmailStr, validator, root_validator

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.supabase_client import supabase

# Import RBAC middleware
from backend.python.middleware.rbac import (
    UserContext,
    UserRole,
    UserStatus,
    require_master_admin,
    require_validator,
    require_admin,
    log_admin_action
)

# Import ActivityLogger for comprehensive activity tracking
from backend.python.middleware.activity_logger import ActivityLogger

# Import field-level encryption for PII protection (RA 10173 compliance)
from backend.python.utils.field_encryption import decrypt_pii_fields

# Import Redis caching for performance
from backend.python.middleware.redis_cache import (
    get_or_set,
    generate_cache_key,
    invalidate_pattern,
    CACHE_TTLS
)

logger = logging.getLogger(__name__)

# Supabase client imported from centralized configuration

# Create router
router = APIRouter(
    prefix="/admin",
    tags=["Admin Dashboard"],
    responses={403: {"description": "Forbidden - insufficient permissions"}},
)

PH_LAT_RANGE = (4.0, 21.0)
PH_LNG_RANGE = (116.0, 127.0)


# ============================================================================
# Pydantic Models
# ============================================================================

class UserProfileResponse(BaseModel):
    """User profile data for admin dashboard"""
    id: str
    email: str
    full_name: Optional[str]
    role: str
    status: str
    organization: Optional[str]
    department: Optional[str]
    position: Optional[str]
    # Note: phone_number, login_count, deactivated_at, deactivated_by not in database schema
    last_login: Optional[str]
    onboarding_completed: bool
    created_at: str
    updated_at: Optional[str]  # Added: exists in database

# status = ANY (ARRAY['success'::text, 'failure'::text, 'pending'::text])

class CreateUserRequest(BaseModel):
    """Request body for creating a new user"""
    email: EmailStr
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole
    organization: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=255)
    position: Optional[str] = Field(None, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    event_type: Optional[str] = Field(None, description="Type of event for logging purposes")
    severity: str = Field("INFO", description="Severity level of the event")
    status: str = Field("success", description="Initial status of the user account")
    
    class Config:
        schema_extra = {
            "example": {
                "email": "validator@example.com",
                "password": "",  # Min 8 characters, use strong password with mix of upper/lower/numbers/symbols
                "full_name": "Juan Dela Cruz",
                "role": "validator",
                "organization": "NDRRMC",
                "department": "Disaster Response",
                "position": "Hazard Validator"
            }
        }


class UpdateUserRoleRequest(BaseModel):
    """Request body for updating user role"""
    event_type: Optional[str] = Field(None, description="Type of event for logging purposes")
    severity: str = Field("INFO", description="Severity level of the event")
    role: UserRole
    reason: Optional[str] = Field(None, max_length=500, description="Reason for role change")
    status: str = Field("success", description="Status of the role change operation")



class DeactivateUserRequest(BaseModel):
    event_type: Optional[str] = Field(None, description="Type of event for logging purposes")
    severity: str = Field("WARNING", description="Severity level of the event")
    """Request body for deactivating a user"""
    reason: Optional[str] = Field(None, max_length=500, description="Reason for deactivation")
    status: str = Field("success", description="Status of the deactivation operation")


class ReactivateUserRequest(BaseModel):
    """Request body for reactivating a user"""
    event_type: Optional[str] = Field(None, description="Type of event for logging purposes")
    severity: str = Field("INFO", description="Severity level of the event")
    reason: Optional[str] = Field(None, max_length=500, description="Reason for reactivation")
    status: str = Field("success", description="Status of the reactivation operation")


class ResetUserPasswordRequest(BaseModel):
    """Request body for admin-initiated password reset"""
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")
    event_type: Optional[str] = Field(None, description="Type of event for logging purposes")
    severity: str = Field("WARNING", description="Severity level of the event")
    status: str = Field("success", description="Status of the password reset operation")


class AuditLogResponse(BaseModel):
    """Audit log entry for admin dashboard - matches gaia.audit_logs schema"""
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_role: str  # Required in DB (NOT NULL)
    action: str  # Required in DB (NOT NULL)
    action_description: Optional[str] = None  # Nullable in DB
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    old_values: Dict[str, Any]  # Required in DB (NOT NULL)
    new_values: Dict[str, Any]  # Required in DB (NOT NULL)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool  # Required in DB (NOT NULL)
    error_message: Optional[str] = None
    created_at: str  # Required in DB (NOT NULL)
    event_type: Optional[str] = None  # Exists in database
    severity: str  # Required in DB (NOT NULL)
    status: str  # Required in DB (NOT NULL)
    message: Optional[str] = None  # Exists in DB
    metadata: Optional[Dict[str, Any]] = None  # Exists in DB, default {}

class SystemConfigResponse(BaseModel):
    """System configuration parameter"""
    id: str
    config_key: str
    config_value: str
    description: Optional[str]
    value_type: str
    min_value: Optional[float]
    max_value: Optional[float]
    modified_by: Optional[str]
    modified_at: Optional[str]
    created_at: str


class UpdateSystemConfigRequest(BaseModel):
    """Request body for updating system configuration"""
    config_value: str = Field(..., description="New configuration value")
    
    @validator('config_value')
    def validate_config_value(cls, v):
        if not v or v.strip() == "":
            raise ValueError('config_value cannot be empty')
        return v


class TriageReportResponse(BaseModel):
    """Citizen report pending triage"""
    id: str
    tracking_id: str
    hazard_type: Optional[str]
    location_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    description: str
    confidence_score: Optional[float]
    status: str
    validated: bool = False  # Add default value to match database schema
    submitted_at: str
    image_urls: Optional[List[str]] = None  # Add default value, matches database TEXT[] array
    name: Optional[str] = None  # Reporter's name
    contact_number: Optional[str] = None  # Reporter's contact number
    
    class Config:
        # Allow extra fields from database that aren't in model
        extra = 'allow'


# ============================================================================
# User Management Endpoints (UM-01, UM-02, UM-03, AC-06)
# ============================================================================

@router.get("/users", response_model=List[UserProfileResponse])
async def get_all_users(
    role: Optional[str] = Query(None, description="Filter by role"),
    status: Optional[str] = Query(None, description="Filter by status"),
    organization: Optional[str] = Query(None, description="Filter by organization"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: UserContext = Depends(require_validator, )
):
    """
    Get all user accounts with optional filtering.
    
    **Permissions**: Master Admin, Validator (read-only)
    **Module**: UM-03 (User Profile Management)
    """
    try:
        # Build query
        query = supabase.schema("gaia").from_("user_profiles").select("*")
        
        if role:
            query = query.eq("role", role)
        if status:
            query = query.eq("status", status)
        if organization:
            query = query.ilike("organization", f"%{organization}%")
        
        # Execute query with pagination
        response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        
        logger.info(f"User {current_user.email} retrieved {len(response.data)} user profiles")
        return response.data
        
    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.post("/users", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: CreateUserRequest,
    request: Request,
    current_user: UserContext = Depends(require_master_admin)
):
    """
    Create a new user account with specified role.
    
    **Permissions**: Master Admin only
    **Module**: UM-01 (User Account Creation)
    """
    try:
        # Check if email already exists
        existing_user = supabase.schema("gaia").from_("user_profiles").select("email").eq("email", user_data.email).execute()
        
        if existing_user.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User with email {user_data.email} already exists"
            )
        
        # Create auth user via Supabase Auth Admin API
        auth_response = supabase.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": True,  # Auto-confirm email
            "user_metadata": {
                "full_name": user_data.full_name,
                "role": user_data.role.value
            }
        })
        
        new_user_id = auth_response.user.id
        
        # Create user profile in database
        profile_data = {
            "id": new_user_id,
            "email": user_data.email,
            "full_name": user_data.full_name,
            "role": user_data.role.value,
            "status": UserStatus.ACTIVE.value,
            "organization": user_data.organization,
            "department": user_data.department,
            "position": user_data.position,
            # phone_number removed - column doesn't exist in database schema
            "onboarding_completed": False,
            "created_by": current_user.user_id
        }
        
        profile_response = supabase.schema("gaia").from_("user_profiles").insert(profile_data).execute()
        
        # Log admin action
        await log_admin_action(
            user=current_user,
            action="user_created",
            action_description=f"Created user account for {user_data.email} with role {user_data.role.value}",
            resource_type="user_profiles",
            resource_id=new_user_id,
            new_values={"email": user_data.email, "role": user_data.role.value},
            request=request,
            event_type="CREATE USER"
        )
        
        logger.info(f"Master Admin {current_user.email} created user: {user_data.email} ({user_data.role.value})")
        
        return profile_response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")


@router.patch("/users/{user_id}/role", response_model=UserProfileResponse)
async def update_user_role(
    user_id: str,
    role_update: UpdateUserRoleRequest,
    request: Request,
    current_user: UserContext = Depends(require_master_admin)
):
    """
    Update a user's role.
    
    **Permissions**: Master Admin only
    **Module**: UM-02 (Role Assignment)
    """
    try:
        # Fetch current user profile
        user_response = supabase.schema("gaia").from_("user_profiles").select("*").eq("id", user_id).execute()
        
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        current_profile = user_response.data[0]
        old_role = current_profile["role"]
        
        # Prevent changing own role
        if user_id == current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role. Contact another Master Admin."
            )
        
        # Update role
        update_data = {
            "role": role_update.role.value,
            "role_modified_at": datetime.utcnow().isoformat(),
            "role_modified_by": current_user.user_id
        }
        
        updated_response = supabase.schema("gaia").from_("user_profiles").update(update_data).eq("id", user_id).execute()
        
        # Log admin action (note: trigger will also log this)
        await log_admin_action(
            user=current_user,
            action="role_changed",
            action_description=f"Changed role for {current_profile['email']} from {old_role} to {role_update.role.value}. Reason: {role_update.reason or 'Not provided'}",
            resource_type="user_profiles",
            resource_id=user_id,
            old_values={"role": old_role},
            new_values={"role": role_update.role.value},
            request=request,
            event_type="ROLE_CHANGED"
        )
        
        logger.info(f"Master Admin {current_user.email} changed role: {current_profile['email']} {old_role} -> {role_update.role.value}")
        
        return updated_response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user role: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update user role")


@router.patch("/users/{user_id}/deactivate", response_model=UserProfileResponse)
async def deactivate_user(
    user_id: str,
    deactivate_request: DeactivateUserRequest,
    request: Request,
    current_user: UserContext = Depends(require_master_admin)
):
    """
    Deactivate a user account.
    
    **Permissions**: Master Admin only
    **Module**: AC-06 (User Deactivation)
    """
    try:
        # Fetch current user profile
        user_response = supabase.schema("gaia").from_("user_profiles").select("*").eq("id", user_id).execute()
        
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        current_profile = user_response.data[0]
        
        # Prevent self-deactivation
        if user_id == current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account. Contact another Master Admin."
            )
        
        # Prevent deactivating last Master Admin
        if current_profile["role"] == UserRole.MASTER_ADMIN.value:
            active_admins = supabase.schema("gaia").from_("user_profiles").select("id").eq("role", "master_admin").eq("status", "active").execute()
            
            if len(active_admins.data) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate the last Master Admin account"
                )
        
        # Update status to inactive
        update_data = {
            "status": UserStatus.INACTIVE.value,
            "deactivated_at": datetime.utcnow().isoformat(),
            "deactivated_by": current_user.user_id
        }
        
        updated_response = supabase.schema("gaia").from_("user_profiles").update(update_data).eq("id", user_id).execute()
        
        # Log admin action (note: trigger will also log this)
        await log_admin_action(
            user=current_user,
            action="user_deactivated",
            action_description=f"Deactivated user account for {current_profile['email']}. Reason: {deactivate_request.reason or 'Not provided'}",
            resource_type="user_profiles",
            resource_id=user_id,
            old_values={"status": current_profile["status"]},
            new_values={"status": UserStatus.INACTIVE.value},
            request=request,
            event_type="USER_DEACTIVATED"
        )
        
        logger.info(f"Master Admin {current_user.email} deactivated user: {current_profile['email']}")
        
        return updated_response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deactivating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to deactivate user")


@router.patch("/users/{user_id}/reactivate", response_model=UserProfileResponse)
async def reactivate_user(
    user_id: str,
    reactivate_request: ReactivateUserRequest,
    request: Request,
    current_user: UserContext = Depends(require_master_admin)
):
    """
    Reactivate a deactivated user account.
    
    **Permissions**: Master Admin only
    **Module**: UM-03 (User Profile Management)
    """
    try:
        user_response = supabase.schema("gaia").from_("user_profiles").select("*").eq("id", user_id).execute()
        
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        current_profile = user_response.data[0]
        
        if current_profile["status"] == UserStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already active"
            )
        
        update_data = {
            "status": UserStatus.ACTIVE.value,
            "deactivated_at": None,
            "deactivated_by": None
        }
        
        updated_response = supabase.schema("gaia").from_("user_profiles").update(update_data).eq("id", user_id).execute()
        
        await log_admin_action(
            user=current_user,
            action="user_reactivated",
            action_description=f"Reactivated user account for {current_profile['email']}. Reason: {reactivate_request.reason or 'Not provided'}",
            resource_type="user_profiles",
            resource_id=user_id,
            old_values={"status": current_profile["status"]},
            new_values={"status": UserStatus.ACTIVE.value},
            request=request,
            event_type="USER_REACTIVATED"
        )
        
        logger.info(f"Master Admin {current_user.email} reactivated user: {current_profile['email']}")
        
        return updated_response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reactivating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reactivate user")


@router.patch("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    password_reset: ResetUserPasswordRequest,
    request: Request,
    current_user: UserContext = Depends(require_master_admin)
):
    """
    Reset a user's password (admin-initiated).
    
    **Permissions**: Master Admin only
    **Module**: UM-03 (User Profile Management)
    **Audit**: Logs password reset to audit_logs with WARNING severity (security_event)
    """
    try:
        user_response = supabase.schema("gaia").from_("user_profiles").select("*").eq("id", user_id).execute()
        
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        target_user = user_response.data[0]

        if user_id == current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use the profile settings to change your own password."
            )

        supabase.auth.admin.update_user_by_id(
            user_id,
            {"password": password_reset.new_password}
        )

        await log_admin_action(
            user=current_user,
            action="password_reset",
            action_description=f"Reset password for {target_user['email']}",
            resource_type="user_profiles",
            resource_id=user_id,
            old_values={},
            new_values={"password_reset": True},
            request=request,
            event_type="security_event",
            severity="warning"  # Password resets are security-sensitive operations
        )
        
        logger.info(f"Master Admin {current_user.email} reset password for user: {target_user['email']}")
        
        return {"message": f"Password reset successfully for {target_user['email']}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reset password: {str(e)}")


# ============================================================================
# Audit Logs Endpoint (AC-01)
# ============================================================================

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    event: Optional[str] = Query(None, description="Filter by event type"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    start_date: Optional[str] = Query(None, description="Filter by start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="Filter by end date (ISO format)"),
    success: Optional[bool] = Query(None, description="Filter by success status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: UserContext = Depends(require_validator)
):
    """
    Get audit logs with optional filtering.
    
    **Permissions**: Master Admin, Validator (read-only)
    **Module**: AC-01 (Audit Log Query)
    """
    try:
        # Build query
        query = supabase.schema("gaia").from_("audit_logs").select("*")
        
        if user_email:
            query = query.ilike("user_email", f"%{user_email}%")
        # Prefer event-based filtering, keep action as backward-compatible alias.
        if event:
            query = query.eq("action", event)
        elif action:
            query = query.eq("action", action)
        if resource_type:
            query = query.eq("resource_type", resource_type)
        if success is not None:
            query = query.eq("success", success)
        if start_date:
            query = query.gte("created_at", start_date)
        if end_date:
            query = query.lte("created_at", end_date)
        
        # Execute query with pagination
        response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        
        logger.info(f"User {current_user.email} queried {len(response.data)} audit logs")
        return response.data
        
    except Exception as e:
        logger.error(f"Error fetching audit logs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


# ============================================================================
# System Configuration Endpoints (AC-02)
# ============================================================================

@router.get("/system-config", response_model=List[SystemConfigResponse])
async def get_system_config(
    current_user: UserContext = Depends(require_validator)
):
    """
    Get all system configuration parameters.
    
    **Permissions**: Master Admin, Validator (read-only)
    **Module**: AC-02 (Configuration Management)
    """
    try:
        response = supabase.schema("gaia").from_("system_config").select("*").order("config_key").execute()
        
        logger.info(f"User {current_user.email} retrieved system configuration")
        return response.data
        
    except Exception as e:
        logger.error(f"Error fetching system config: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch system configuration")


@router.patch("/system-config/{config_key}", response_model=SystemConfigResponse)
async def update_system_config(
    config_key: str,
    config_update: UpdateSystemConfigRequest,
    request: Request,
    current_user: UserContext = Depends(require_master_admin)
):
    """
    Update a system configuration parameter.
    
    **Permissions**: Master Admin only
    **Module**: AC-02 (Configuration Management)
    """
    try:
        # Fetch current config
        config_response = supabase.schema("gaia").from_("system_config").select("*").eq("config_key", config_key).execute()
        
        if not config_response.data:
            raise HTTPException(status_code=404, detail=f"Configuration key '{config_key}' not found")
        
        current_config = config_response.data[0]
        old_value = current_config["config_value"]
        
        # Validate value based on type
        value_type = current_config["value_type"]
        new_value = config_update.config_value
        
        if value_type == "number":
            try:
                numeric_value = float(new_value)
                
                # Check min/max constraints
                if current_config["min_value"] is not None and numeric_value < current_config["min_value"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Value must be >= {current_config['min_value']}"
                    )
                if current_config["max_value"] is not None and numeric_value > current_config["max_value"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Value must be <= {current_config['max_value']}"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Value must be a valid number for {config_key}"
                )
        
        # Update configuration (trigger will log to audit_logs)
        update_data = {
            "config_value": new_value,
            "modified_by": current_user.user_id,
            "modified_at": datetime.utcnow().isoformat()
        }
        
        updated_response = supabase.schema("gaia").from_("system_config").update(update_data).eq("config_key", config_key).execute()
        
        # Log configuration change activity
        await ActivityLogger.log_config_change(
            admin=current_user,
            config_key=config_key,
            old_value=old_value,
            new_value=new_value,
            request=request
        )
        
        logger.info(f"Master Admin {current_user.email} updated config: {config_key} = {new_value} (was {old_value})")
        
        return updated_response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating system config: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update system configuration")


# ============================================================================
# Report Triage Endpoint (AC-04)
# ============================================================================

@router.get("/reports/triage", response_model=List[TriageReportResponse])
async def get_triage_queue(
    status_filter: Optional[str] = Query("unverified", description="Filter by status (unverified/verified/rejected/duplicate)"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum confidence score"),
    max_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Maximum confidence score"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: UserContext = Depends(require_admin)
):
    """
    Get citizen reports pending triage/validation.
    
    **Permissions**: Master Admin, Validator, LGU Responder
    **Module**: AC-04 (Unverified Report Triage)
    **Note**: Valid status values are: unverified, verified, rejected, duplicate
    """
    try:
        query = supabase.schema("gaia").from_("citizen_reports").select("*")
        
        # Keep default behavior focused on unverified queue.
        if status_filter:
            query = query.eq("status", status_filter)
        if status_filter == "unverified":
            query = query.is_("validated_by", None)
        if hazard_type:
            query = query.eq("hazard_type", hazard_type)
        if min_confidence is not None:
            query = query.gte("confidence_score", min_confidence)
        if max_confidence is not None:
            query = query.lte("confidence_score", max_confidence)
        
        # Execute query with pagination, ordered by submission time (oldest first for FIFO triage)
        response = query.order("submitted_at", desc=False).range(offset, offset + limit - 1).execute()
        
        # Transform database fields to match Pydantic model
        # Database has 'image_url' (TEXT or TEXT[]), model expects 'image_urls' (List[str])
        transformed_data = []
        for report in response.data:
            # Decrypt PII fields for admin viewing (RA 10173 compliance)
            # Only authenticated admin users can see decrypted PII
            report = decrypt_pii_fields(report)
            
            # Map image_url -> image_urls (handle both column names and convert string to array)
            image_url_value = report.get('image_url') or report.get('image_urls')
            if image_url_value:
                # If it's already a list, use it; if it's a string, convert to list
                if isinstance(image_url_value, list):
                    report['image_urls'] = image_url_value
                else:
                    report['image_urls'] = [image_url_value]
            else:
                report['image_urls'] = []
            # Ensure validated field exists (computed column or manual calculation)
            if 'validated' not in report:
                report['validated'] = report.get('validated_by') is not None
            transformed_data.append(report)
        
        logger.info(f"User {current_user.email} retrieved {len(transformed_data)} reports for triage")
        return transformed_data
        
    except Exception as e:
        logger.error(f"Error fetching triage queue: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch triage queue")


class ReportTriageActionRequest(BaseModel):
    """Request body for validating or rejecting a citizen report"""
    notes: Optional[str] = Field(None, max_length=500, description="Optional validation/rejection notes")
    latitude: Optional[float] = Field(
        None,
        ge=-90.0,
        le=90.0,
        description="Updated latitude (must stay within Philippine bounds)"
    )
    longitude: Optional[float] = Field(
        None,
        ge=-180.0,
        le=180.0,
        description="Updated longitude (must stay within Philippine bounds)"
    )

    @root_validator(skip_on_failure=True)
    def validate_coordinate_pair(cls, values):
        lat = values.get("latitude")
        lng = values.get("longitude")

        if (lat is None) ^ (lng is None):
            raise ValueError("Both latitude and longitude are required when adjusting coordinates.")

        if lat is not None and lng is not None:
            if not (PH_LAT_RANGE[0] <= lat <= PH_LAT_RANGE[1]) or not (PH_LNG_RANGE[0] <= lng <= PH_LNG_RANGE[1]):
                raise ValueError("Updated coordinates must remain within the Philippines (4°-21°N, 116°-127°E).")

        return values


class ReportTriageActionResponse(BaseModel):
    """Response after validating/rejecting a report"""
    tracking_id: str
    action: str  # 'validated' or 'rejected'
    status: str
    validated_by: Optional[str]
    validated_at: Optional[str]
    message: str


@router.post("/reports/{tracking_id}/validate", response_model=ReportTriageActionResponse)
async def validate_citizen_report(
    tracking_id: str,
    request_body: ReportTriageActionRequest,
    request: Request,
    current_user: UserContext = Depends(require_admin)
):
    """
    Validate a citizen report and add it to the hazard map.
    
    **Permissions**: Master Admin, Validator, LGU Responder
    **Module**: AC-04 (Unverified Report Triage)
    **Action**: Sets status to 'verified', marks validated_by, creates hazard record
    """
    try:
        # 1. Fetch the citizen report
        report_response = supabase.schema("gaia").from_("citizen_reports") \
            .select("*") \
            .eq("tracking_id", tracking_id) \
            .execute()
        
        if not report_response.data or len(report_response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report not found: {tracking_id}"
            )
        
        report = report_response.data[0]
        
        # 2. Check if already validated
        if report.get('validated_by'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Report has already been validated"
            )

        coordinate_updates: Dict[str, Any] = {}
        if request_body.latitude is not None and request_body.longitude is not None:
            coordinate_updates = {
                "latitude": request_body.latitude,
                "longitude": request_body.longitude,
                "location": f"POINT({request_body.longitude} {request_body.latitude})"
            }
            report['latitude'] = request_body.latitude
            report['longitude'] = request_body.longitude
            report['location'] = coordinate_updates["location"]
        
        # 3. Update citizen_reports table with optional coordinate corrections
        update_data = {
            "status": "verified",
            "validated_by": current_user.user_id,
            "validated_at": datetime.utcnow().isoformat(),
            "validation_notes": request_body.notes
        }

        if coordinate_updates:
            update_data.update(coordinate_updates)
        
        # If admin provides corrected coordinates, update the report
        if request_body.latitude is not None and request_body.longitude is not None:
            # Validate Philippine boundaries (4-21°N, 116-127°E)
            if 4 <= request_body.latitude <= 21 and 116 <= request_body.longitude <= 127:
                update_data["latitude"] = request_body.latitude
                update_data["longitude"] = request_body.longitude
                update_data["location"] = f"POINT({request_body.longitude} {request_body.latitude})"
                logger.info(f"Admin corrected coordinates for report {tracking_id}")
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Corrected coordinates are outside Philippine boundaries"
                )
        
        update_response = supabase.schema("gaia").from_("citizen_reports") \
            .update(update_data) \
            .eq("tracking_id", tracking_id) \
            .execute()
        
        if not update_response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update report status"
            )
        
        # Use updated coordinates from the update response if they were corrected
        updated_report = update_response.data[0]
        
        # 4. Create hazard record for validated report
        final_latitude = report.get('latitude')
        final_longitude = report.get('longitude')
        final_location_geom = report.get('location')

        hazard_data = {
            "hazard_type": report['hazard_type'],
            "location_name": report['location_name'],
            "latitude": final_latitude,
            "longitude": final_longitude,
            "location": final_location_geom,  # PostGIS geometry
            "severity": "moderate",  # Default severity for citizen reports
            "confidence_score": min(report.get('confidence_score', 0.3) + 0.4, 1.0),  # Boost confidence after validation
            "source_type": "citizen_report",
            "source_content": report['description'],
            "validated": True,
            "validated_by": current_user.user_id,
            "validated_at": datetime.utcnow().isoformat(),
            "created_at": datetime.utcnow().isoformat()
        }
        
        hazard_response = supabase.schema("gaia").from_("hazards") \
            .insert(hazard_data) \
            .execute()
        
        if not hazard_response.data:
            logger.warning(f"Failed to create hazard record for validated report {tracking_id}")
        
        # 5. Log activity (fire and forget)
        try:
            ActivityLogger.log_activity(
                user_context=current_user,
                action="VALIDATE_CITIZEN_REPORT",
                request=request,
                resource_type="citizen_report",
                resource_id=tracking_id,
                details={
                    "hazard_type": report['hazard_type'],
                    "location": report['location_name'],
                    "notes": request_body.notes,
                    "coordinates_adjusted": bool(coordinate_updates),
                    **({"new_coordinates": coordinate_updates} if coordinate_updates else {})
                }
            )
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")

        # Log to audit_logs for Audit Logs viewer (AC-01)
        try:
            await log_admin_action(
                user=current_user,
                action="report_validated",
                action_description=f"Approved citizen report {tracking_id} ({report['hazard_type']} at {report['location_name']})",
                resource_type="citizen_reports",
                resource_id=tracking_id,
                old_values={"status": report.get("status", "pending")},
                new_values={"status": "verified", "hazard_type": report["hazard_type"], "location": report["location_name"]},
                request=request,
                event_type="REPORT_VALIDATED",
            )
        except Exception as log_error:
            logger.warning(f"Failed to log audit: {log_error}")
        
        logger.info(f"User {current_user.email} validated report {tracking_id}")
        
        return ReportTriageActionResponse(
            tracking_id=tracking_id,
            action="validated",
            status="verified",
            validated_by=current_user.email,
            validated_at=update_data["validated_at"],
            message="Report validated successfully and added to hazard map"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating report {tracking_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate report: {str(e)}"
        )


@router.post("/reports/{tracking_id}/reject", response_model=ReportTriageActionResponse)
async def reject_citizen_report(
    tracking_id: str,
    request_body: ReportTriageActionRequest,
    request: Request,
    current_user: UserContext = Depends(require_admin)
):
    """
    Reject a citizen report.
    
    **Permissions**: Master Admin, Validator, LGU Responder
    **Module**: AC-04 (Unverified Report Triage)
    **Action**: Sets status to 'rejected', marks validated_by (rejection is a form of validation)
    """
    try:
        # 1. Fetch the citizen report
        report_response = supabase.schema("gaia").from_("citizen_reports") \
            .select("*") \
            .eq("tracking_id", tracking_id) \
            .execute()
        
        if not report_response.data or len(report_response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report not found: {tracking_id}"
            )
        
        report = report_response.data[0]
        
        # 2. Check if already processed
        if report.get('validated_by'):
            current_status = report.get('status', 'unknown')
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Report has already been processed (status: {current_status})"
            )
        
        # 3. Update citizen_reports table
        update_data = {
            "status": "rejected",
            "validated_by": current_user.user_id,
            "validated_at": datetime.utcnow().isoformat(),
            "validation_notes": request_body.notes or "Report rejected by validator"
        }
        
        update_response = supabase.schema("gaia").from_("citizen_reports") \
            .update(update_data) \
            .eq("tracking_id", tracking_id) \
            .execute()
        
        if not update_response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update report status"
            )
        
        # 4. Log activity (fire and forget)
        try:
            ActivityLogger.log_activity(
                user_context=current_user,
                action="REJECT_CITIZEN_REPORT",
                request=request,
                resource_type="citizen_report",
                resource_id=tracking_id,
                details={
                    "hazard_type": report['hazard_type'],
                    "location": report['location_name'],
                    "reason": request_body.notes
                }
            )
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")

        # Log to audit_logs for Audit Logs viewer (AC-01)
        try:
            await log_admin_action(
                user=current_user,
                action="report_rejected",
                action_description=f"Rejected citizen report {tracking_id} ({report['hazard_type']} at {report['location_name']}). Reason: {request_body.notes or 'Not provided'}",
                resource_type="citizen_reports",
                resource_id=tracking_id,
                old_values={"status": report.get("status", "pending")},
                new_values={"status": "rejected", "hazard_type": report["hazard_type"], "location": report["location_name"]},
                request=request,
                event_type="REPORT_REJECTED",
            )
        except Exception as log_error:
            logger.warning(f"Failed to log audit: {log_error}")
        
        logger.info(f"User {current_user.email} rejected report {tracking_id}")
        
        return ReportTriageActionResponse(
            tracking_id=tracking_id,
            action="rejected",
            status="rejected",
            validated_by=current_user.email,
            validated_at=update_data["validated_at"],
            message="Report rejected successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting report {tracking_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject report: {str(e)}"
        )


# ============================================================================
# Activity Monitor Endpoints (Future Feature - FP-04)
# ============================================================================

class ActivityLogResponse(BaseModel):
    """Recent user activity log entry"""
    id: str
    user_email: str
    user_role: str
    action: str
    resource_type: str
    resource_id: Optional[str]
    details: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    timestamp: str


class AuditLogResponse(BaseModel):
    """System audit log entry"""
    id: str
    event_type: str
    severity: str
    user_email: Optional[str]
    action: str
    resource: Optional[str]
    status: str
    message: Optional[str]
    metadata: Optional[Dict[str, Any]]
    created_at: str


@router.get("/activity", response_model=List[ActivityLogResponse])
async def get_recent_activity(
    limit: int = Query(50, ge=1, le=200, description="Number of recent activities to retrieve"),
    user_email: Optional[str] = Query(None, description="Filter by specific user email"),
    action_type: Optional[str] = Query(None, description="Filter by action type (e.g., 'login', 'hazard_validated')"),
    current_user: UserContext = Depends(require_validator)
):
    """
    Get recent user activity logs (cached for 30s)
    
    **Permissions**: Validator and Master Admin
    **Module**: FP-04 (Activity Monitor)
    """
    cache_key = generate_cache_key("admin:activity", limit=limit, user_email=user_email, action_type=action_type)
    
    async def fetch_activity():
        query = supabase.schema("gaia").from_("activity_logs").select("*")
        
        if user_email:
            query = query.eq("user_email", user_email)
        if action_type:
            query = query.eq("action", action_type)
        
        response = query.order("timestamp", desc=True).limit(limit).execute()
        return response.data or []
    
    try:
        data = await get_or_set(cache_key, fetch_activity, ttl=CACHE_TTLS.get("admin:activity", 30))
        logger.info(f"Admin {current_user.email} retrieved {len(data)} activity logs")
        return data
        
    except Exception as e:
        logger.error(f"Error fetching activity logs: {str(e)}")
        if "does not exist" in str(e) or "Could not find" in str(e):
            return []
        raise HTTPException(status_code=500, detail="Failed to fetch activity logs")


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health")
async def admin_health_check(
    current_user: UserContext = Depends(require_admin)
):
    """Health check for admin API (requires authentication)"""
    return {
        "status": "healthy",
        "user": current_user.email,
        "role": current_user.role.value,
        "timestamp": datetime.utcnow().isoformat()
    }