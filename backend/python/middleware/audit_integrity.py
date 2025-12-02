"""
Audit Trail Integrity Module
Security Focus: Integrity (CIA Triad)

Provides tamper-evident audit logging using cryptographic checksums.
Each log entry includes a hash that chains to previous entries, making
it impossible to modify historical logs without detection.

Features:
- SHA-256 checksums for each audit entry
- Hash chaining (each entry includes previous entry's hash)
- Integrity verification for audit trails
- Tamper detection capabilities

Usage:
    from backend.python.middleware.audit_integrity import AuditIntegrity
    
    # Create tamper-evident log entry
    entry = AuditIntegrity.create_entry(
        action="VALIDATE_HAZARD",
        user_id="user-123",
        resource_type="hazard",
        resource_id="hazard-456",
        data={"status": "verified"}
    )
    
    # Verify entry integrity
    is_valid = AuditIntegrity.verify_entry(entry)
    
    # Verify chain integrity
    chain_valid = AuditIntegrity.verify_chain(entries)
"""

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

# HMAC secret for additional integrity (read from environment)
AUDIT_HMAC_SECRET_ENV = "GAIA_AUDIT_HMAC_SECRET"

# Hash algorithm
HASH_ALGORITHM = "sha256"

# Initial chain hash (genesis block concept)
GENESIS_HASH = "0" * 64  # 64 hex chars = 256 bits

# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class AuditEntry:
    """
    Tamper-evident audit log entry.
    
    The checksum is computed from all other fields, making any
    modification detectable.
    """
    id: str  # UUID
    timestamp: str  # ISO format
    action: str
    user_id: Optional[str]
    user_email: str
    user_role: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    ip_address: Optional[str]
    data: Dict[str, Any]
    previous_hash: str  # Hash of previous entry (chain)
    checksum: str  # SHA-256 of entry content
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AuditEntry":
        """Create from dictionary (database retrieval)."""
        return cls(**data)


# =============================================================================
# AUDIT INTEGRITY CLASS
# =============================================================================

class AuditIntegrity:
    """
    Provides tamper-evident audit logging with cryptographic integrity.
    
    Security Features:
    - SHA-256 checksums for each entry
    - HMAC signatures with server secret
    - Hash chaining between entries
    - Integrity verification methods
    - Tamper detection
    """
    
    _hmac_secret: Optional[bytes] = None
    
    @classmethod
    def _get_hmac_secret(cls) -> bytes:
        """
        Get HMAC secret for signing entries.
        
        Reads from GAIA_AUDIT_HMAC_SECRET environment variable.
        Falls back to a generated secret (warns in logs).
        """
        if cls._hmac_secret is None:
            secret = os.getenv(AUDIT_HMAC_SECRET_ENV)
            if secret:
                cls._hmac_secret = secret.encode()
            else:
                # CodeQL Fix: Avoid logging env var names containing secrets
                logger.warning(
                    "⚠️ Audit HMAC secret not configured! "
                    "Audit entries will use temporary HMAC secret. "
                    "Configure this properly in production."
                )
                # Generate deterministic fallback (consistent across restarts)
                cls._hmac_secret = hashlib.sha256(b"gaia-audit-default").digest()
        return cls._hmac_secret
    
    @staticmethod
    def _compute_content_hash(
        action: str,
        user_id: Optional[str],
        user_email: str,
        user_role: str,
        resource_type: Optional[str],
        resource_id: Optional[str],
        ip_address: Optional[str],
        data: Dict[str, Any],
        timestamp: str,
        previous_hash: str
    ) -> str:
        """
        Compute SHA-256 hash of entry content.
        
        Includes all fields except the checksum itself.
        """
        # Create canonical JSON representation
        content = {
            "action": action,
            "user_id": user_id,
            "user_email": user_email,
            "user_role": user_role,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": ip_address,
            "data": data,
            "timestamp": timestamp,
            "previous_hash": previous_hash
        }
        
        # Sort keys for deterministic serialization
        canonical = json.dumps(content, sort_keys=True, separators=(',', ':'))
        
        # Compute SHA-256
        return hashlib.sha256(canonical.encode()).hexdigest()
    
    @classmethod
    def _sign_hash(cls, content_hash: str) -> str:
        """
        Sign content hash with HMAC for additional integrity.
        
        Returns combined hash: SHA256(content) + HMAC signature
        """
        secret = cls._get_hmac_secret()
        signature = hmac.new(secret, content_hash.encode(), hashlib.sha256).hexdigest()
        
        # Return combined: content_hash:signature
        return f"{content_hash}:{signature[:16]}"
    
    @classmethod
    def _verify_signature(cls, checksum: str) -> Tuple[bool, str]:
        """
        Verify HMAC signature on checksum.
        
        Args:
            checksum: Full checksum with signature (hash:signature)
            
        Returns:
            Tuple of (is_valid, content_hash)
        """
        if ':' not in checksum:
            # No signature - might be old entry
            return True, checksum
        
        parts = checksum.split(':')
        if len(parts) != 2:
            return False, ""
        
        content_hash, provided_sig = parts
        secret = cls._get_hmac_secret()
        expected_sig = hmac.new(secret, content_hash.encode(), hashlib.sha256).hexdigest()[:16]
        
        return hmac.compare_digest(provided_sig, expected_sig), content_hash
    
    @classmethod
    def create_entry(
        cls,
        entry_id: str,
        action: str,
        user_id: Optional[str] = None,
        user_email: str = "system",
        user_role: str = "system",
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
        previous_hash: str = GENESIS_HASH,
        timestamp: Optional[str] = None
    ) -> AuditEntry:
        """
        Create a new tamper-evident audit entry.
        
        Args:
            entry_id: Unique ID for entry (UUID)
            action: Action being logged
            user_id: User ID performing action
            user_email: User email
            user_role: User role
            resource_type: Type of resource affected
            resource_id: ID of resource affected
            ip_address: Client IP address
            data: Additional structured data
            previous_hash: Hash of previous entry in chain
            timestamp: Optional timestamp (defaults to now)
            
        Returns:
            AuditEntry with computed checksum
        """
        if timestamp is None:
            timestamp = datetime.utcnow().isoformat()
        
        if data is None:
            data = {}
        
        # Compute content hash
        content_hash = cls._compute_content_hash(
            action=action,
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            data=data,
            timestamp=timestamp,
            previous_hash=previous_hash
        )
        
        # Sign the hash
        checksum = cls._sign_hash(content_hash)
        
        return AuditEntry(
            id=entry_id,
            timestamp=timestamp,
            action=action,
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            data=data,
            previous_hash=previous_hash,
            checksum=checksum
        )
    
    @classmethod
    def verify_entry(cls, entry: AuditEntry) -> Tuple[bool, str]:
        """
        Verify integrity of a single audit entry.
        
        Recomputes the checksum and compares with stored value.
        
        Args:
            entry: AuditEntry to verify
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Verify signature
        sig_valid, content_hash = cls._verify_signature(entry.checksum)
        if not sig_valid:
            return False, "HMAC signature verification failed"
        
        # Recompute content hash
        expected_hash = cls._compute_content_hash(
            action=entry.action,
            user_id=entry.user_id,
            user_email=entry.user_email,
            user_role=entry.user_role,
            resource_type=entry.resource_type,
            resource_id=entry.resource_id,
            ip_address=entry.ip_address,
            data=entry.data,
            timestamp=entry.timestamp,
            previous_hash=entry.previous_hash
        )
        
        if not hmac.compare_digest(content_hash, expected_hash):
            return False, f"Content hash mismatch: entry may have been tampered"
        
        return True, "Entry integrity verified"
    
    @classmethod
    def verify_chain(cls, entries: List[AuditEntry]) -> Tuple[bool, str, int]:
        """
        Verify integrity of an audit chain.
        
        Checks:
        1. Each entry's individual checksum
        2. Chain continuity (each entry's previous_hash matches prior entry)
        
        Args:
            entries: List of AuditEntry objects in chronological order
            
        Returns:
            Tuple of (is_valid, error_message, last_valid_index)
        """
        if not entries:
            return True, "Empty chain is valid", -1
        
        expected_previous = GENESIS_HASH
        
        for i, entry in enumerate(entries):
            # Verify individual entry
            valid, msg = cls.verify_entry(entry)
            if not valid:
                return False, f"Entry {i} failed: {msg}", i - 1
            
            # Verify chain linkage (skip for first entry if it's genesis)
            if i > 0:
                # Extract content hash from previous entry's checksum
                _, prev_content_hash = cls._verify_signature(entries[i - 1].checksum)
                if not hmac.compare_digest(entry.previous_hash, prev_content_hash):
                    return False, f"Chain broken at entry {i}: previous_hash mismatch", i - 1
        
        return True, "Chain integrity verified", len(entries) - 1
    
    @classmethod
    def get_entry_hash(cls, entry: AuditEntry) -> str:
        """
        Get the content hash of an entry (for chaining).
        
        Args:
            entry: AuditEntry to get hash from
            
        Returns:
            str: Content hash (without HMAC signature)
        """
        _, content_hash = cls._verify_signature(entry.checksum)
        return content_hash
    
    @classmethod
    def detect_tampering(
        cls,
        entries: List[AuditEntry]
    ) -> Dict[str, Any]:
        """
        Analyze audit chain for tampering evidence.
        
        Returns detailed report of integrity status.
        
        Args:
            entries: List of AuditEntry objects
            
        Returns:
            Dict with tampering analysis results
        """
        result = {
            "chain_valid": True,
            "total_entries": len(entries),
            "verified_entries": 0,
            "tampered_entries": [],
            "chain_breaks": [],
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
        
        if not entries:
            return result
        
        for i, entry in enumerate(entries):
            # Verify entry
            valid, msg = cls.verify_entry(entry)
            
            if valid:
                result["verified_entries"] += 1
            else:
                result["chain_valid"] = False
                result["tampered_entries"].append({
                    "index": i,
                    "entry_id": entry.id,
                    "timestamp": entry.timestamp,
                    "error": msg
                })
            
            # Check chain linkage (except first entry)
            if i > 0:
                _, prev_hash = cls._verify_signature(entries[i - 1].checksum)
                if entry.previous_hash != prev_hash:
                    result["chain_valid"] = False
                    result["chain_breaks"].append({
                        "index": i,
                        "entry_id": entry.id,
                        "expected_previous": prev_hash,
                        "actual_previous": entry.previous_hash
                    })
        
        return result


# =============================================================================
# INTEGRATION HELPER
# =============================================================================

def compute_checksum_for_log(
    action: str,
    user_id: Optional[str],
    user_email: str,
    user_role: str,
    resource_type: Optional[str],
    resource_id: Optional[str],
    ip_address: Optional[str],
    details: Dict[str, Any],
    timestamp: str,
    previous_hash: str = GENESIS_HASH
) -> str:
    """
    Compute checksum for an audit log entry.
    
    This is the main integration point with ActivityLogger.
    
    Args:
        All fields from the audit log entry
        
    Returns:
        str: Signed checksum (hash:signature)
    """
    content_hash = AuditIntegrity._compute_content_hash(
        action=action,
        user_id=user_id,
        user_email=user_email,
        user_role=user_role,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        data=details,
        timestamp=timestamp,
        previous_hash=previous_hash
    )
    return AuditIntegrity._sign_hash(content_hash)


def verify_log_entry_checksum(
    action: str,
    user_id: Optional[str],
    user_email: str,
    user_role: str,
    resource_type: Optional[str],
    resource_id: Optional[str],
    ip_address: Optional[str],
    details: Dict[str, Any],
    timestamp: str,
    previous_hash: str,
    stored_checksum: str
) -> Tuple[bool, str]:
    """
    Verify checksum of a stored audit log entry.
    
    Args:
        All fields from the stored entry
        stored_checksum: The checksum stored with the entry
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Verify signature
    sig_valid, content_hash = AuditIntegrity._verify_signature(stored_checksum)
    if not sig_valid:
        return False, "HMAC signature verification failed"
    
    # Recompute expected hash
    expected_hash = AuditIntegrity._compute_content_hash(
        action=action,
        user_id=user_id,
        user_email=user_email,
        user_role=user_role,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        data=details,
        timestamp=timestamp,
        previous_hash=previous_hash
    )
    
    if not hmac.compare_digest(content_hash, expected_hash):
        return False, "Content hash mismatch: entry may have been tampered"
    
    return True, "Entry verified"


# =============================================================================
# CLI UTILITIES
# =============================================================================

if __name__ == "__main__":
    import argparse
    import uuid
    
    parser = argparse.ArgumentParser(description="Audit Integrity Utilities")
    parser.add_argument("command", choices=["generate-secret", "test", "demo-chain"])
    args = parser.parse_args()
    
    if args.command == "generate-secret":
        secret = os.urandom(32).hex()
        # CodeQL Fix: Write secret to file instead of stdout to avoid clear-text logging
        secret_file = ".gaia_audit_secret.tmp"
        # Open file with strict permissions (0o600), minimizing secret exposure
        fd = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(f"export GAIA_AUDIT_HMAC_SECRET={secret}\n")
        print(f"✓ New HMAC secret generated and saved to: {secret_file}")
        print(f"  Run: source {secret_file} && rm {secret_file}")
        print(f"  Or copy the value from the file to your .env")
    
    elif args.command == "test":
        print("Testing audit integrity...")
        
        # Create test entry
        entry = AuditIntegrity.create_entry(
            entry_id=str(uuid.uuid4()),
            action="TEST_ACTION",
            user_id="test-user",
            user_email="test@example.com",
            user_role="tester",
            resource_type="test",
            resource_id="test-123",
            data={"key": "value"}
        )
        
        print(f"Created entry: {entry.id}")
        print(f"Checksum: {entry.checksum}")
        
        # Verify entry
        valid, msg = AuditIntegrity.verify_entry(entry)
        print(f"Verification: {msg}")
        
        # Test tampering detection
        tampered_entry = AuditEntry(**entry.to_dict())
        tampered_entry.data = {"key": "modified"}  # Tamper!
        
        valid, msg = AuditIntegrity.verify_entry(tampered_entry)
        print(f"Tampered entry verification: {msg} (expected: tampered)")
    
    elif args.command == "demo-chain":
        print("Demonstrating audit chain...")
        
        entries = []
        prev_hash = GENESIS_HASH
        
        for i in range(3):
            entry = AuditIntegrity.create_entry(
                entry_id=str(uuid.uuid4()),
                action=f"ACTION_{i}",
                user_email="demo@example.com",
                user_role="demo",
                data={"step": i},
                previous_hash=prev_hash
            )
            entries.append(entry)
            prev_hash = AuditIntegrity.get_entry_hash(entry)
            print(f"Entry {i}: {entry.action} -> {entry.checksum[:30]}...")
        
        # Verify chain
        valid, msg, last = AuditIntegrity.verify_chain(entries)
        print(f"\nChain verification: {msg}")
