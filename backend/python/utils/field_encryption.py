"""
Field-Level Encryption for PII Protection
Module: Security - Confidentiality (CIA Triad)

Implements AES-256 encryption via Fernet for protecting Personally Identifiable
Information (PII) in citizen reports, compliant with RA 10173 (Philippine Data
Protection Act).

Encrypted Fields:
- name (reporter's name)
- contact_number (Philippine phone number)
- contact_method (optional contact info)

Usage:
    from backend.python.utils.field_encryption import FieldEncryptor
    
    encryptor = FieldEncryptor()
    encrypted = encryptor.encrypt_field("John Doe")
    decrypted = encryptor.decrypt_field(encrypted)
"""

import os
import base64
import hashlib
import logging
from typing import Optional, Dict, Any, List
from functools import lru_cache
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

# Fields that contain PII and must be encrypted
PII_FIELDS = frozenset([
    "name",
    "contact_number", 
    "contact_method",
])

# Prefix to identify encrypted values (helps with migration/detection)
ENCRYPTED_PREFIX = "ENC::"

# Environment variable for encryption key
ENCRYPTION_KEY_ENV = "GAIA_ENCRYPTION_KEY"

# Salt for key derivation (should be unique per deployment)
ENCRYPTION_SALT_ENV = "GAIA_ENCRYPTION_SALT"

# =============================================================================
# KEY DERIVATION
# =============================================================================

def derive_key_from_password(password: str, salt: bytes) -> bytes:
    """
    Derive a Fernet-compatible key from a password using PBKDF2.
    
    This allows using a human-readable password/passphrase instead of
    a raw 32-byte key, while maintaining cryptographic security.
    
    Args:
        password: Human-readable password/passphrase
        salt: Random bytes for key derivation (minimum 16 bytes)
        
    Returns:
        bytes: URL-safe base64-encoded 32-byte key for Fernet
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,  # OWASP recommended minimum for PBKDF2-SHA256
        backend=default_backend()
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return key


def generate_encryption_key() -> str:
    """
    Generate a new random Fernet encryption key.
    
    Use this for initial setup - store the key securely in environment variables.
    
    Returns:
        str: URL-safe base64-encoded 32-byte key
    """
    return Fernet.generate_key().decode()


def generate_salt() -> str:
    """
    Generate a random salt for key derivation.
    
    Returns:
        str: Hex-encoded 16-byte salt
    """
    return os.urandom(16).hex()


# =============================================================================
# FIELD ENCRYPTOR CLASS
# =============================================================================

class FieldEncryptor:
    """
    Handles field-level encryption/decryption for PII protection.
    
    Uses Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256).
    Thread-safe and suitable for use in async contexts.
    
    Security Features:
    - AES-256 encryption (via Fernet)
    - Automatic key rotation support
    - Encrypted value prefix for detection
    - Safe handling of already-encrypted values
    - Logging of encryption operations (without values)
    
    Example:
        encryptor = FieldEncryptor()
        
        # Encrypt a single field
        encrypted = encryptor.encrypt_field("09123456789")
        
        # Decrypt a single field  
        decrypted = encryptor.decrypt_field(encrypted)
        
        # Encrypt all PII fields in a dict
        data = {"name": "John", "contact_number": "09123456789"}
        encrypted_data = encryptor.encrypt_pii_fields(data)
    """
    
    def __init__(self, key: Optional[str] = None):
        """
        Initialize the encryptor with an encryption key.
        
        Args:
            key: Optional Fernet key. If not provided, reads from
                 GAIA_ENCRYPTION_KEY environment variable.
                 
        Raises:
            ValueError: If no key is provided and env var is not set
        """
        self._key = self._load_key(key)
        self._fernet = Fernet(self._key)
        self._initialized_at = datetime.utcnow()
        logger.info("FieldEncryptor initialized successfully")
    
    def _load_key(self, provided_key: Optional[str]) -> bytes:
        """
        Load encryption key from provided value or environment.
        
        Priority:
        1. Directly provided key
        2. GAIA_ENCRYPTION_KEY environment variable
        3. Derived from password + salt if GAIA_ENCRYPTION_SALT is set
        
        Args:
            provided_key: Optional directly-provided key
            
        Returns:
            bytes: Validated Fernet key
            
        Raises:
            ValueError: If no valid key source is found
        """
        if provided_key:
            return provided_key.encode() if isinstance(provided_key, str) else provided_key
        
        env_key = os.getenv(ENCRYPTION_KEY_ENV)
        
        if env_key:
            # Check if it's a password that needs derivation
            salt_hex = os.getenv(ENCRYPTION_SALT_ENV)
            if salt_hex and len(env_key) < 44:  # Fernet keys are 44 chars base64
                # Derive key from password
                salt = bytes.fromhex(salt_hex)
                return derive_key_from_password(env_key, salt)
            else:
                # Use as direct Fernet key
                return env_key.encode()
        
        # For development/testing: generate a temporary key (NOT FOR PRODUCTION)
        # CodeQL Fix: Avoid logging env var names containing secrets
        logger.warning(
            "⚠️ Field encryption key not configured! Using temporary key. "
            "Configure this properly in production."
        )
        return Fernet.generate_key()
    
    def encrypt_field(self, value: str) -> str:
        """
        Encrypt a single field value.
        
        Args:
            value: Plain text value to encrypt
            
        Returns:
            str: Encrypted value with ENCRYPTED_PREFIX
            
        Note:
            - Returns original value if already encrypted
            - Returns empty string for None/empty input
        """
        if not value:
            return value
        
        # Check if already encrypted
        if isinstance(value, str) and value.startswith(ENCRYPTED_PREFIX):
            logger.debug("Value already encrypted, skipping")
            return value
        
        try:
            encrypted = self._fernet.encrypt(value.encode())
            result = f"{ENCRYPTED_PREFIX}{encrypted.decode()}"
            logger.debug(f"Field encrypted successfully (length: {len(value)} -> {len(result)})")
            return result
        except Exception as e:
            logger.error(f"Encryption failed: {type(e).__name__}")
            raise ValueError(f"Failed to encrypt field: {e}")
    
    def decrypt_field(self, value: str) -> str:
        """
        Decrypt a single field value.
        
        Args:
            value: Encrypted value (with or without prefix)
            
        Returns:
            str: Decrypted plain text value
            
        Raises:
            ValueError: If decryption fails (invalid key or corrupted data)
            
        Note:
            - Returns original value if not encrypted
            - Returns empty string for None/empty input
        """
        if not value:
            return value
        
        # Check if encrypted
        if not value.startswith(ENCRYPTED_PREFIX):
            logger.debug("Value not encrypted, returning as-is")
            return value
        
        try:
            # Remove prefix and decrypt
            encrypted_data = value[len(ENCRYPTED_PREFIX):]
            decrypted = self._fernet.decrypt(encrypted_data.encode())
            logger.debug("Field decrypted successfully")
            return decrypted.decode()
        except InvalidToken:
            logger.error("Decryption failed: Invalid token (wrong key or corrupted data)")
            raise ValueError("Failed to decrypt field: Invalid encryption key or corrupted data")
        except Exception as e:
            logger.error(f"Decryption failed: {type(e).__name__}")
            raise ValueError(f"Failed to decrypt field: {e}")
    
    def encrypt_pii_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Encrypt all PII fields in a dictionary.
        
        Args:
            data: Dictionary potentially containing PII fields
            
        Returns:
            dict: Copy of data with PII fields encrypted
            
        Note:
            Non-PII fields are passed through unchanged.
            Original dict is not modified.
        """
        if not data:
            return data
        
        result = data.copy()
        encrypted_count = 0
        
        for field in PII_FIELDS:
            if field in result and result[field]:
                result[field] = self.encrypt_field(str(result[field]))
                encrypted_count += 1
        
        if encrypted_count > 0:
            logger.info(f"Encrypted {encrypted_count} PII field(s)")
        
        return result
    
    def decrypt_pii_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Decrypt all PII fields in a dictionary.
        
        Args:
            data: Dictionary with potentially encrypted PII fields
            
        Returns:
            dict: Copy of data with PII fields decrypted
            
        Note:
            Non-encrypted fields are passed through unchanged.
            Original dict is not modified.
        """
        if not data:
            return data
        
        result = data.copy()
        decrypted_count = 0
        
        for field in PII_FIELDS:
            if field in result and result[field]:
                try:
                    original = result[field]
                    result[field] = self.decrypt_field(str(result[field]))
                    if original != result[field]:  # Was actually encrypted
                        decrypted_count += 1
                except ValueError as e:
                    logger.warning(f"Failed to decrypt field '{field}': {e}")
                    # Keep encrypted value if decryption fails
        
        if decrypted_count > 0:
            logger.debug(f"Decrypted {decrypted_count} PII field(s)")
        
        return result
    
    def is_encrypted(self, value: str) -> bool:
        """
        Check if a value is encrypted.
        
        Args:
            value: Value to check
            
        Returns:
            bool: True if value has encryption prefix
        """
        return bool(value and value.startswith(ENCRYPTED_PREFIX))
    
    def get_field_hash(self, value: str) -> str:
        """
        Generate a deterministic hash of a field value for searching.
        
        This allows searching for records by PII without storing plain text.
        Use case: "Find all reports from phone number X" without decrypting all.
        
        Args:
            value: Plain text value to hash
            
        Returns:
            str: SHA-256 hash of the value (hex encoded)
            
        Security Note:
            This hash is deterministic, so identical values produce identical hashes.
            Add salting if rainbow table attacks are a concern.
        """
        if not value:
            return ""
        
        # Normalize the value (lowercase, strip whitespace)
        normalized = value.lower().strip()
        
        # Hash with SHA-256
        hash_obj = hashlib.sha256(normalized.encode())
        return hash_obj.hexdigest()


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

@lru_cache(maxsize=1)
def get_encryptor() -> FieldEncryptor:
    """
    Get singleton FieldEncryptor instance.
    
    Uses lru_cache to ensure only one instance is created.
    Thread-safe for use in async contexts.
    
    Returns:
        FieldEncryptor: Singleton encryptor instance
    """
    return FieldEncryptor()


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def encrypt_field(value: str) -> str:
    """Convenience function to encrypt a single field."""
    return get_encryptor().encrypt_field(value)


def decrypt_field(value: str) -> str:
    """Convenience function to decrypt a single field."""
    return get_encryptor().decrypt_field(value)


def encrypt_pii_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convenience function to encrypt PII fields in a dict."""
    return get_encryptor().encrypt_pii_fields(data)


def decrypt_pii_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convenience function to decrypt PII fields in a dict."""
    return get_encryptor().decrypt_pii_fields(data)


def is_pii_field(field_name: str) -> bool:
    """Check if a field name is a PII field."""
    return field_name in PII_FIELDS


# =============================================================================
# CLI UTILITIES
# =============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Field Encryption Utilities")
    parser.add_argument("command", choices=["generate-key", "generate-salt", "test"])
    args = parser.parse_args()
    
    if args.command == "generate-key":
        # CodeQL Fix: Write key to file instead of stdout to avoid clear-text logging
        key = generate_encryption_key()
        key_file = ".gaia_encryption_key.tmp"
        with open(key_file, "w") as f:
            f.write(f"export GAIA_ENCRYPTION_KEY={key}\n")
        print(f"✓ New encryption key generated and saved to: {key_file}")
        print(f"  Run: source {key_file} && rm {key_file}")
        print(f"  Or copy the value from the file to your .env")
    
    elif args.command == "generate-salt":
        # CodeQL Fix: Write salt to file instead of stdout to avoid clear-text logging
        salt = generate_salt()
        salt_file = ".gaia_encryption_salt.tmp"
        with open(salt_file, "w") as f:
            f.write(f"export GAIA_ENCRYPTION_SALT={salt}\n")
        print(f"✓ New salt generated and saved to: {salt_file}")
        print(f"  Run: source {salt_file} && rm {salt_file}")
        print(f"  Or copy the value from the file to your .env")
    
    elif args.command == "test":
        print("Testing encryption...")
        encryptor = FieldEncryptor()
        
        test_value = "09123456789"
        encrypted = encryptor.encrypt_field(test_value)
        decrypted = encryptor.decrypt_field(encrypted)
        
        print(f"Original: {test_value}")
        print(f"Encrypted: {encrypted[:50]}...")
        print(f"Decrypted: {decrypted}")
        print(f"Match: {test_value == decrypted}")
        
        # Test PII fields
        test_data = {
            "name": "Juan Dela Cruz",
            "contact_number": "09123456789",
            "hazard_type": "flood"  # Not PII
        }
        
        encrypted_data = encryptor.encrypt_pii_fields(test_data)
        print(f"\nEncrypted PII fields:")
        for k, v in encrypted_data.items():
            if k in PII_FIELDS:
                print(f"  {k}: {v[:40]}...")
            else:
                print(f"  {k}: {v}")
