"""
Role-Based Access Control (RBAC) Middleware for GAIA
Provides decorators and dependencies for FastAPI endpoints requiring specific roles.

Supports: AC-03 (RBAC Authorization), UM-02 (Role Assignment), AUTH-REQ-08 (RBAC Integration)
"""

import logging
from typing import Optional, List
from functools import wraps
from enum import Enum

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import sys

from realtime import Field

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.supabase_client import supabase

logger = logging.getLogger(__name__)

# Supabase client imported from centralized configuration

# HTTP Bearer token scheme
security = HTTPBearer()


# ============================================================================
# Role Enum (matches database user_role type)
# ============================================================================

class UserRole(str, Enum):
    """User roles matching gaia.user_role ENUM"""
    MASTER_ADMIN = "master_admin"
    VALIDATOR = "validator"
    LGU_RESPONDER = "lgu_responder"
    CITIZEN = "citizen"


class UserStatus(str, Enum):
    """User status matching gaia.user_status ENUM"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING_ACTIVATION = "pending_activation"


# ============================================================================
# User Context Model
# ============================================================================

class UserContext:
    """Authenticated user context with role and permissions"""
    
    def __init__(
        self,
        user_id: str,
        email: str,
        role: UserRole,
        status: UserStatus,
        full_name: Optional[str] = None,
        organization: Optional[str] = None,
        permissions: Optional[List[str]] = None
    ):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.status = status
        self.full_name = full_name
        self.organization = organization
        self.permissions = permissions or []
    
    def has_role(self, *roles: UserRole) -> bool:
        """Check if user has any of the specified roles"""
        return self.role in roles
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission"""
        return permission in self.permissions
    
    def is_active(self) -> bool:
        """Check if user account is active"""
        return self.status == UserStatus.ACTIVE
    
    def __repr__(self):
        return f"UserContext(user_id={self.user_id}, email={self.email}, role={self.role}, status={self.status})"


# ============================================================================
# Authentication & Authorization Functions
# ============================================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> UserContext:
    """
    Dependency to get current authenticated user
    Raises 401 if not authenticated
    """
    """
    Extract and validate JWT token, return UserContext with role and permissions.
    
    This dependency can be used in any endpoint that requires authentication.
    For role-specific endpoints, use require_role() or specific decorators.
    """
    token = credentials.credentials
    
    try:
        # Verify token with Supabase Auth
        response = supabase.auth.get_user(token)
        
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = response.user
        user_id = user.id
        email = user.email
        
        # Fetch user profile with role from database (gaia schema)
        profile_response = supabase.schema("gaia").from_("user_profiles").select(
            "role, status, full_name, organization"
        ).eq("id", user_id).execute()
        
        if not profile_response.data:
            logger.warning(f"User {email} authenticated but no profile found in database")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User profile not found. Contact administrator.",
            )
        
        profile = profile_response.data[0]
        user_role = UserRole(profile["role"])
        user_status = UserStatus(profile["status"])
        
        # Check if user account is active
        if user_status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {user_status.value}. Contact administrator.",
            )
        
        # Fetch user permissions from role_permissions table (gaia schema)
        permissions_response = supabase.schema("gaia").from_("role_permissions").select(
            "permission_name"
        ).eq("role", user_role.value).execute()
        
        permissions = [p["permission_name"] for p in permissions_response.data]
        
        # Create UserContext
        user_context = UserContext(
            user_id=user_id,
            email=email,
            role=user_role,
            status=user_status,
            full_name=profile.get("full_name"),
            organization=profile.get("organization"),
            permissions=permissions
        )
        
        logger.info(f"Authenticated user: {email} ({user_role.value})")
        return user_context
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(*allowed_roles: UserRole):
    """
    Dependency factory that checks if authenticated user has one of the allowed roles.
    
    Usage:
        @router.get("/admin/users")
        async def get_users(user: UserContext = Depends(require_role(UserRole.MASTER_ADMIN, UserRole.VALIDATOR))):
            ...
    """
    async def role_checker(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.has_role(*allowed_roles):
            logger.warning(
                f"Access denied: User {user.email} ({user.role.value}) attempted to access "
                f"endpoint requiring roles: {[r.value for r in allowed_roles]}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {' or '.join([r.value for r in allowed_roles])}",
            )
        return user
    
    return role_checker


def require_permission(permission: str):
    """
    Dependency factory that checks if authenticated user has a specific permission.
    
    Usage:
        @router.patch("/admin/config/{key}")
        async def update_config(
            key: str,
            user: UserContext = Depends(require_permission("update_system_config"))
        ):
            ...
    """
    async def permission_checker(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.has_permission(permission):
            logger.warning(
                f"Access denied: User {user.email} ({user.role.value}) attempted to access "
                f"endpoint requiring permission: {permission}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required permission: {permission}",
            )
        return user
    
    return permission_checker


# ============================================================================
# Convenience Dependencies for Common Role Checks
# ============================================================================

# Master Admin only (full system access)
require_master_admin = require_role(UserRole.MASTER_ADMIN)

# Validator or Master Admin (read-only admin access)
require_validator = require_role(UserRole.MASTER_ADMIN, UserRole.VALIDATOR)

# Any admin role (Master Admin, Validator, or LGU Responder)
require_admin = require_role(
    UserRole.MASTER_ADMIN,
    UserRole.VALIDATOR,
    UserRole.LGU_RESPONDER
)


# ============================================================================
# Optional Authentication (for public endpoints with enhanced features for logged-in users)
# ============================================================================

async def get_current_user_optional(
    request: Request
) -> Optional[UserContext]:
    """
    Dependency for optional authentication
    
    Returns UserContext if valid token is provided, None otherwise
    Does NOT raise 401 if no token is present
    
    Usage:
        @router.get("/public-endpoint")
        async def public_endpoint(user: Optional[UserContext] = Depends(get_current_user_optional)):
            if user:
                # Enhanced features for authenticated users
                pass
            else:
                # Basic features for anonymous users
                pass
    """
    auth_header = request.headers.get("Authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.replace("Bearer ", "").strip()
    
    try:
        # Verify token with Supabase Auth
        response = supabase.auth.get_user(token)
        
        if not response or not response.user:
            return None
        
        user = response.user
        user_id = user.id
        email = user.email
        
        # Fetch user profile
        profile_response = supabase.schema("gaia").from_("user_profiles").select(
            "role, status, full_name, organization"
        ).eq("id", user_id).execute()
        
        if not profile_response.data:
            return None
        
        profile = profile_response.data[0]
        user_role = UserRole(profile["role"])
        user_status = UserStatus(profile["status"])
        
        # Return None if account is not active
        if user_status != UserStatus.ACTIVE:
            return None
        
        # Fetch permissions
        permissions_response = supabase.schema("gaia").from_("role_permissions").select(
            "permission_name"
        ).eq("role", user_role.value).execute()
        
        permissions = [p["permission_name"] for p in permissions_response.data]
        
        # Create UserContext
        return UserContext(
            user_id=user_id,
            email=email,
            role=user_role,
            status=user_status,
            full_name=profile.get("full_name"),
            organization=profile.get("organization"),
            permissions=permissions
        )
        
    except Exception as e:
        logger.debug(f"Optional authentication failed: {str(e)}")
        return None


# Require authenticated user (any role)
require_auth = Depends(get_current_user)

# LGU Responder or higher
require_lgu_responder = require_role(
    UserRole.MASTER_ADMIN,
    UserRole.VALIDATOR,
    UserRole.LGU_RESPONDER
)

# Researcher role (for research API endpoints)
require_researcher_role = require_role(
    UserRole.MASTER_ADMIN,
    UserRole.VALIDATOR
)


# ============================================================================
# Audit Logging Helper
# ============================================================================

async def log_admin_action(
    user: UserContext,
    action: str,
    event_type: str,
    action_description: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    request: Optional[Request] = None,
    severity: Optional[str] = "info",  # Changed default to lowercase to match schema constraint
    status: Optional[str] = "success" # ANY (ARRAY['success'::text, 'failure'::text, 'pending'::text])
):
    """
    Log administrative actions to audit_logs table.
    
    This function is called after admin operations to maintain audit trail (AC-05).
    
    Schema: gaia.audit_logs (event_type, severity, user_id, user_email, action, resource, status, message, metadata, ip_address, created_at)
    """
    try:
        # Extract IP address from request
        ip_address = None
        
        if request:
            # Get client IP (handle proxies)
            forwarded = request.headers.get("X-Forwarded-For")
            ip_address = forwarded.split(",")[0] if forwarded else request.client.host
        
        # Build metadata with old/new values and user agent
        metadata = {}
        if old_values:
            metadata["old_values"] = old_values
        if new_values:
            metadata["new_values"] = new_values
        if request:
            metadata["user_agent"] = request.headers.get("User-Agent")
            metadata["user_role"] = user.role.value
            metadata["resource_type"] = resource_type
        if resource_id:
            metadata["resource_id"] = resource_id
        if error_message:
            metadata["error_message"] = error_message
        
        # Normalize severity to lowercase (schema constraint)
        severity_normalized = severity.lower() if severity else "info"
        
        # Insert audit log with correct schema
        supabase.schema("gaia").from_("audit_logs").insert({
            "event_type": event_type,
            "severity": severity_normalized,
            "user_id": user.user_id,
            "user_email": user.email,
            "action": action,
            "resource": f"{resource_type}:{resource_id}" if resource_id else resource_type,
            "status": status if not success else "success",
            "message": action_description,
            "metadata": metadata,
            "ip_address": ip_address
        }).execute()
        
        logger.info(f"Audit log: {user.email} - {action} - {action_description}")
        
    except Exception as e:
        logger.error(f"Failed to log audit event: {str(e)}")
        # Log the full exception for debugging
        logger.error(f"Audit logging error details: {repr(e)}", exc_info=True)
        # Don't raise exception - audit logging failure shouldn't block operations


# ============================================================================
# Example Usage in Endpoints
# ============================================================================

"""
Example endpoint usage patterns:

# 1. Master Admin only
@router.post("/admin/users")
async def create_user(
    user_data: CreateUserRequest,
    current_user: UserContext = Depends(require_master_admin)
):
    # Only master_admin can access this endpoint
    ...

# 2. Validator or Master Admin (read-only admin)
@router.get("/admin/audit-logs")
async def get_audit_logs(
    current_user: UserContext = Depends(require_validator)
):
    # master_admin and validator can access this endpoint
    ...

# 3. Any admin role
@router.get("/admin/reports/triage")
async def get_triage_queue(
    current_user: UserContext = Depends(require_admin)
):
    # master_admin, validator, and lgu_responder can access this endpoint
    ...

# 4. Permission-based access
@router.patch("/admin/config/{key}")
async def update_config(
    key: str,
    value: str,
    current_user: UserContext = Depends(require_permission("update_system_config"))
):
    # Only users with "update_system_config" permission can access
    ...

# 5. Manual role checking (more flexible)
@router.get("/admin/users/{user_id}")
async def get_user(
    user_id: str,
    current_user: UserContext = Depends(get_current_user)
):
    # Check if user can view this profile
    if current_user.has_role(UserRole.MASTER_ADMIN, UserRole.VALIDATOR):
        # Admins can view any user
        pass
    elif current_user.user_id == user_id:
        # Users can view their own profile
        pass
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    ...
"""
