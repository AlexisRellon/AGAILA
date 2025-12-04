"""
Authentication Event Logging API for GAIA
Handles auth event logging (login/logout) and session management.

Features:
- Log login/logout events to activity_logs and audit_logs
- Update last_login timestamp in user_profiles
- Single session enforcement (invalidate previous sessions on new login)

Module: AC-05 (Session and Activity Logger)
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from backend.python.lib.supabase_client import supabase
from backend.python.middleware.activity_logger import ActivityLogger

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


class AuthEventRequest(BaseModel):
    """Request body for logging auth events"""
    user_id: str
    user_email: str
    event_type: str  # "LOGIN", "LOGOUT", "FAILED_LOGIN", "SESSION_EXPIRED"
    session_id: Optional[str] = None
    reason: Optional[str] = None  # For failed logins or session invalidation


class AuthEventResponse(BaseModel):
    """Response for auth event logging"""
    success: bool
    message: str
    last_login: Optional[str] = None


@router.post("/log-event", response_model=AuthEventResponse)
async def log_auth_event(
    request: Request,
    event_data: AuthEventRequest
):
    """
    Log authentication events (login, logout, failed login).
    
    This endpoint should be called by the frontend after auth operations.
    It logs to both activity_logs and audit_logs tables.
    
    For LOGIN events, it also:
    - Updates last_login in user_profiles
    - Returns the updated last_login timestamp
    """
    try:
        # Extract IP and user agent from request
        forwarded = request.headers.get("X-Forwarded-For")
        ip_address = forwarded.split(",")[0] if forwarded else (
            request.client.host if request.client else None
        )
        user_agent = request.headers.get("User-Agent")
        
        now = datetime.utcnow().isoformat()
        last_login_value = None
        user_role = "public_user"  # Default for activity_logs
        user_role_enum = "citizen"  # Default for audit_logs (uses user_role enum type)
        
        # Look up the actual user role if we have a user_id (not failed login)
        if event_data.user_id and event_data.event_type != "FAILED_LOGIN":
            try:
                profile_result = supabase.schema("gaia").from_("user_profiles") \
                    .select("role") \
                    .eq("id", event_data.user_id) \
                    .execute()
                
                if profile_result.data and len(profile_result.data) > 0:
                    db_role = profile_result.data[0].get("role")
                    if db_role:
                        # Valid values for activity_logs CHECK: master_admin, validator, lgu_responder, public_user, anonymous, system
                        # Valid values for audit_logs enum: master_admin, validator, lgu_responder, citizen
                        if db_role in ["master_admin", "validator", "lgu_responder"]:
                            user_role = db_role
                            user_role_enum = db_role
                        elif db_role == "citizen":
                            user_role = "public_user"  # Map citizen -> public_user for activity_logs
                            user_role_enum = "citizen"
                        logger.info(f"User role lookup: {db_role} -> activity_logs={user_role}, audit_logs={user_role_enum}")
            except Exception as e:
                logger.warning(f"Could not look up user role: {str(e)}")
        
        # Handle LOGIN event - update last_login
        if event_data.event_type == "LOGIN":
            try:
                update_result = supabase.schema("gaia").from_("user_profiles") \
                    .update({"last_login": now}) \
                    .eq("id", event_data.user_id) \
                    .execute()
                
                if update_result.data:
                    last_login_value = now
                    logger.info(f"Updated last_login for user {event_data.user_email}")
                else:
                    logger.warning(f"No user profile found for {event_data.user_id}")
            except Exception as e:
                logger.error(f"Failed to update last_login: {str(e)}")
        
        # Log to activity_logs
        # Note: user_role has a check constraint, valid values: master_admin, validator, lgu_responder, public_user, anonymous, system
        activity_log_entry = {
            "user_id": event_data.user_id if event_data.event_type != "FAILED_LOGIN" else None,
            "user_email": event_data.user_email,
            "user_role": user_role,  # Uses value from lookup or default
            "action": event_data.event_type,
            "resource_type": "authentication",
            "resource_id": event_data.session_id,
            "details": {
                "reason": event_data.reason,
                "session_id": event_data.session_id
            } if event_data.reason or event_data.session_id else {},
            "ip_address": ip_address,  # Will be cast to inet by Postgres
            "user_agent": user_agent,
            "timestamp": now
        }
        
        # Remove checksum - not in activity_logs schema
        try:
            supabase.schema("gaia").from_("activity_logs").insert(activity_log_entry).execute()
            logger.info(f"Activity logged: {event_data.user_email} - {event_data.event_type}")
        except Exception as e:
            logger.error(f"Failed to log activity: {str(e)}")
        
        # Log to audit_logs (auth events are security-relevant)
        status_value = "success" if event_data.event_type != "FAILED_LOGIN" else "failure"
        severity = "INFO" if status_value == "success" else "WARNING"  # Uppercase per constraint
        
        audit_log_entry = {
            "event_type": "security_event",
            "severity": severity,
            "user_id": event_data.user_id if event_data.event_type != "FAILED_LOGIN" else None,
            "user_email": event_data.user_email,
            "user_role": user_role_enum,  # Uses enum value from lookup (master_admin, validator, lgu_responder, citizen)
            "action": event_data.event_type,
            "action_description": f"User {event_data.event_type.lower().replace('_', ' ')}: {event_data.user_email}",
            "resource_type": "authentication",
            "resource_id": event_data.session_id,
            "old_values": {},  # Cannot be null per constraint
            "new_values": {"session_id": event_data.session_id} if event_data.session_id else {},
            "ip_address": ip_address,  # Will be cast to inet by Postgres
            "user_agent": user_agent,
            "success": status_value == "success",
            "error_message": event_data.reason if event_data.event_type == "FAILED_LOGIN" else None,
            "status": status_value,
            "created_at": now
        }
        
        # Remove checksum - not in audit_logs schema
        try:
            supabase.schema("gaia").from_("audit_logs").insert(audit_log_entry).execute()
            logger.info(f"Audit logged: {event_data.user_email} - {event_data.event_type}")
        except Exception as e:
            logger.error(f"Failed to log audit: {str(e)}")
        
        return AuthEventResponse(
            success=True,
            message=f"{event_data.event_type} event logged successfully",
            last_login=last_login_value
        )
        
    except Exception as e:
        logger.error(f"Error logging auth event: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log auth event: {str(e)}"
        )


@router.post("/invalidate-other-sessions")
async def invalidate_other_sessions(
    request: Request,
    event_data: AuthEventRequest
):
    """
    Log that other sessions were invalidated for single-session enforcement.
    
    Note: Actual session invalidation is done on the frontend using 
    supabase.auth.signOut({ scope: 'others' }).
    This endpoint just logs the action.
    """
    try:
        forwarded = request.headers.get("X-Forwarded-For")
        ip_address = forwarded.split(",")[0] if forwarded else (
            request.client.host if request.client else None
        )
        user_agent = request.headers.get("User-Agent")
        now = datetime.utcnow().isoformat()
        
        # Look up the actual user role
        user_role_enum = "citizen"  # Default for audit_logs enum
        if event_data.user_id:
            try:
                profile_result = supabase.schema("gaia").from_("user_profiles") \
                    .select("role") \
                    .eq("id", event_data.user_id) \
                    .execute()
                
                if profile_result.data and len(profile_result.data) > 0:
                    db_role = profile_result.data[0].get("role")
                    if db_role in ["master_admin", "validator", "lgu_responder", "citizen"]:
                        user_role_enum = db_role
            except Exception as e:
                logger.warning(f"Could not look up user role: {str(e)}")
        
        # Log to audit_logs
        audit_log_entry = {
            "event_type": "security_event",
            "severity": "WARNING",  # Uppercase per constraint: INFO, WARNING, ERROR, CRITICAL
            "user_id": event_data.user_id,
            "user_email": event_data.user_email,
            "user_role": user_role_enum,  # Uses enum value from lookup
            "action": "SESSION_INVALIDATED",
            "action_description": f"Other sessions invalidated for user {event_data.user_email} (single-session enforcement)",
            "resource_type": "authentication",
            "resource_id": event_data.session_id,
            "old_values": {},  # Cannot be null
            "new_values": {"new_session_id": event_data.session_id} if event_data.session_id else {},
            "ip_address": ip_address,
            "user_agent": user_agent,
            "success": True,
            "error_message": None,
            "status": "success",
            "created_at": now
        }
        
        try:
            supabase.schema("gaia").from_("audit_logs").insert(audit_log_entry).execute()
            logger.info(f"Session invalidation logged: {event_data.user_email}")
        except Exception as e:
            logger.error(f"Failed to log session invalidation: {str(e)}")
        
        return {"success": True, "message": "Session invalidation logged"}
        
    except Exception as e:
        logger.error(f"Error logging session invalidation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log session invalidation: {str(e)}"
        )
