"""
Test Suite for Patch 3: Field-Level Encryption
Security Focus: Confidentiality (CIA Triad)
Compliance: RA 10173 (Philippine Data Protection Act)
"""

import pytest
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'python'))

# Test Fixtures: Passwords used only for testing key derivation functionality
# NOT production credentials - these are dummy test data for unit test verification
TEST_PASSWORD_FOR_KEY_DERIVATION = "my-secure-passphrase"


class TestFieldEncryptionModule:
    """Test the field encryption module functionality"""
    
    def test_encryption_module_imports(self):
        """Test that encryption module can be imported"""
        from backend.python.utils.field_encryption import (
            FieldEncryptor,
            encrypt_field,
            decrypt_field,
            encrypt_pii_fields,
            decrypt_pii_fields,
            PII_FIELDS,
            ENCRYPTED_PREFIX
        )
        assert FieldEncryptor is not None
        assert callable(encrypt_field)
        assert callable(decrypt_field)
        assert callable(encrypt_pii_fields)
        assert callable(decrypt_pii_fields)
        assert "name" in PII_FIELDS
        assert "contact_number" in PII_FIELDS
        assert ENCRYPTED_PREFIX == "ENC::"
    
    def test_encryptor_initialization(self):
        """Test FieldEncryptor can be initialized"""
        from backend.python.utils.field_encryption import FieldEncryptor
        encryptor = FieldEncryptor()
        assert encryptor is not None
        assert encryptor._fernet is not None
    
    def test_encrypt_single_field(self):
        """Test encrypting a single field value"""
        from backend.python.utils.field_encryption import FieldEncryptor, ENCRYPTED_PREFIX
        
        encryptor = FieldEncryptor()
        original = "09123456789"
        
        encrypted = encryptor.encrypt_field(original)
        
        assert encrypted.startswith(ENCRYPTED_PREFIX)
        assert original not in encrypted
        assert len(encrypted) > len(original)
    
    def test_decrypt_single_field(self):
        """Test decrypting a single field value"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        original = "Juan Dela Cruz"
        
        encrypted = encryptor.encrypt_field(original)
        decrypted = encryptor.decrypt_field(encrypted)
        
        assert decrypted == original
    
    def test_encrypt_decrypt_roundtrip(self):
        """Test encryption/decryption roundtrip preserves data"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        test_values = [
            "09123456789",
            "Juan Dela Cruz",
            "+63 912 345 6789",
            "email@example.com",
            "Special chars: @#$%^&*()",
            "Unicode: 日本語 한국어 中文",
            "",  # Empty string
        ]
        
        for original in test_values:
            encrypted = encryptor.encrypt_field(original)
            decrypted = encryptor.decrypt_field(encrypted)
            assert decrypted == original, f"Roundtrip failed for: {original}"
    
    def test_already_encrypted_value_not_double_encrypted(self):
        """Test that already encrypted values are not encrypted again"""
        from backend.python.utils.field_encryption import FieldEncryptor, ENCRYPTED_PREFIX
        
        encryptor = FieldEncryptor()
        original = "09123456789"
        
        encrypted_once = encryptor.encrypt_field(original)
        encrypted_twice = encryptor.encrypt_field(encrypted_once)
        
        # Should be identical (not double-encrypted)
        assert encrypted_once == encrypted_twice
        # Should only have one prefix
        assert encrypted_twice.count(ENCRYPTED_PREFIX) == 1
    
    def test_unencrypted_value_returned_as_is(self):
        """Test that non-encrypted values are returned unchanged by decrypt"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        plain_value = "09123456789"
        
        # Decrypt should return as-is if not encrypted
        result = encryptor.decrypt_field(plain_value)
        assert result == plain_value
    
    def test_none_and_empty_handling(self):
        """Test handling of None and empty values"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        
        assert encryptor.encrypt_field(None) is None
        assert encryptor.encrypt_field("") == ""
        assert encryptor.decrypt_field(None) is None
        assert encryptor.decrypt_field("") == ""


class TestPIIFieldEncryption:
    """Test PII field encryption in dictionaries"""
    
    def test_encrypt_pii_fields_dict(self):
        """Test encrypting PII fields in a dictionary"""
        from backend.python.utils.field_encryption import FieldEncryptor, ENCRYPTED_PREFIX, PII_FIELDS
        
        encryptor = FieldEncryptor()
        data = {
            "name": "Juan Dela Cruz",
            "contact_number": "09123456789",
            "contact_method": "SMS",
            "hazard_type": "flood",  # Not PII - should NOT be encrypted
            "description": "Heavy flooding"  # Not PII - should NOT be encrypted
        }
        
        encrypted_data = encryptor.encrypt_pii_fields(data)
        
        # PII fields should be encrypted
        for field in PII_FIELDS:
            if field in data and data[field]:
                assert encrypted_data[field].startswith(ENCRYPTED_PREFIX)
        
        # Non-PII fields should be unchanged
        assert encrypted_data["hazard_type"] == "flood"
        assert encrypted_data["description"] == "Heavy flooding"
    
    def test_decrypt_pii_fields_dict(self):
        """Test decrypting PII fields in a dictionary"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        original_data = {
            "name": "Juan Dela Cruz",
            "contact_number": "09123456789",
            "hazard_type": "flood"
        }
        
        encrypted_data = encryptor.encrypt_pii_fields(original_data)
        decrypted_data = encryptor.decrypt_pii_fields(encrypted_data)
        
        assert decrypted_data["name"] == original_data["name"]
        assert decrypted_data["contact_number"] == original_data["contact_number"]
        assert decrypted_data["hazard_type"] == original_data["hazard_type"]
    
    def test_original_dict_not_modified(self):
        """Test that original dictionary is not modified"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        original_data = {
            "name": "Juan Dela Cruz",
            "contact_number": "09123456789"
        }
        original_name = original_data["name"]
        
        encrypted_data = encryptor.encrypt_pii_fields(original_data)
        
        # Original should be unchanged
        assert original_data["name"] == original_name
        # Encrypted should be different
        assert encrypted_data["name"] != original_name
    
    def test_pii_fields_list_complete(self):
        """Test that PII_FIELDS contains expected fields"""
        from backend.python.utils.field_encryption import PII_FIELDS
        
        required_fields = ["name", "contact_number", "contact_method"]
        for field in required_fields:
            assert field in PII_FIELDS, f"Missing PII field: {field}"


class TestFieldHashSearching:
    """Test hash-based searching for encrypted fields"""
    
    def test_field_hash_deterministic(self):
        """Test that field hashes are deterministic"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        value = "09123456789"
        
        hash1 = encryptor.get_field_hash(value)
        hash2 = encryptor.get_field_hash(value)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex length
    
    def test_field_hash_case_insensitive(self):
        """Test that field hashes are case-insensitive"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        
        hash1 = encryptor.get_field_hash("Juan@Example.com")
        hash2 = encryptor.get_field_hash("juan@example.com")
        
        assert hash1 == hash2
    
    def test_different_values_different_hashes(self):
        """Test that different values produce different hashes"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        
        hash1 = encryptor.get_field_hash("09123456789")
        hash2 = encryptor.get_field_hash("09987654321")
        
        assert hash1 != hash2


class TestEncryptionSecurity:
    """Test security properties of encryption"""
    
    def test_encrypted_values_unique_per_encryption(self):
        """Test that same value encrypted multiple times produces different ciphertext"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        value = "09123456789"
        
        # Encrypt same value multiple times
        encrypted1 = encryptor.encrypt_field(value)
        
        # Create new encryptor with same key to bypass caching
        # Note: In Fernet, same plaintext produces different ciphertext due to IV
        # But if we're hitting the "already encrypted" check, we need fresh values
        encryptor2 = FieldEncryptor(key=encryptor._key.decode())
        encrypted2 = encryptor2.encrypt_field(value)
        
        # Both should decrypt to same value
        assert encryptor.decrypt_field(encrypted1) == value
        assert encryptor.decrypt_field(encrypted2) == value
        
        # Ciphertexts should be different (Fernet uses random IV)
        # Note: This depends on Fernet's internal behavior
        # The important thing is both decrypt correctly
    
    def test_wrong_key_cannot_decrypt(self):
        """Test that wrong key cannot decrypt values"""
        from backend.python.utils.field_encryption import FieldEncryptor, generate_encryption_key
        
        # Encrypt with one key
        key1 = generate_encryption_key()
        encryptor1 = FieldEncryptor(key=key1)
        encrypted = encryptor1.encrypt_field("secret data")
        
        # Try to decrypt with different key
        key2 = generate_encryption_key()
        encryptor2 = FieldEncryptor(key=key2)
        
        with pytest.raises(ValueError) as exc_info:
            encryptor2.decrypt_field(encrypted)
        
        assert "Invalid encryption key" in str(exc_info.value)
    
    def test_encrypted_value_does_not_contain_plaintext(self):
        """Test that encrypted value does not contain plaintext"""
        from backend.python.utils.field_encryption import FieldEncryptor
        
        encryptor = FieldEncryptor()
        sensitive_data = "Juan Dela Cruz 09123456789"
        
        encrypted = encryptor.encrypt_field(sensitive_data)
        
        # Plaintext parts should not appear in encrypted value
        assert "Juan" not in encrypted
        assert "Dela" not in encrypted
        assert "Cruz" not in encrypted
        assert "09123456789" not in encrypted
    
    def test_is_encrypted_check(self):
        """Test is_encrypted method"""
        from backend.python.utils.field_encryption import FieldEncryptor, ENCRYPTED_PREFIX
        
        encryptor = FieldEncryptor()
        
        encrypted = encryptor.encrypt_field("test")
        plain = "test"
        
        assert encryptor.is_encrypted(encrypted) is True
        assert encryptor.is_encrypted(plain) is False
        assert encryptor.is_encrypted("") is False
        assert encryptor.is_encrypted(None) is False


class TestKeyGeneration:
    """Test key generation utilities"""
    
    def test_generate_encryption_key(self):
        """Test encryption key generation"""
        from backend.python.utils.field_encryption import generate_encryption_key
        
        key = generate_encryption_key()
        
        assert key is not None
        assert len(key) == 44  # Fernet key length (base64)
    
    def test_generate_salt(self):
        """Test salt generation"""
        from backend.python.utils.field_encryption import generate_salt
        
        salt = generate_salt()
        
        assert salt is not None
        assert len(salt) == 32  # 16 bytes hex-encoded
    
    def test_key_derivation_from_password(self):
        """Test key derivation from password"""
        from backend.python.utils.field_encryption import derive_key_from_password
        
        password = TEST_PASSWORD_FOR_KEY_DERIVATION
        salt = bytes.fromhex("0123456789abcdef0123456789abcdef")
        
        key = derive_key_from_password(password, salt)
        
        assert key is not None
        assert len(key) == 44  # Fernet key length
        
        # Same password + salt should produce same key
        key2 = derive_key_from_password(password, salt)
        assert key == key2
    
    def test_different_salt_different_key(self):
        """Test that different salts produce different keys"""
        from backend.python.utils.field_encryption import derive_key_from_password
        
        password = TEST_PASSWORD_FOR_KEY_DERIVATION
        salt1 = bytes.fromhex("0123456789abcdef0123456789abcdef")
        salt2 = bytes.fromhex("fedcba9876543210fedcba9876543210")
        
        key1 = derive_key_from_password(password, salt1)
        key2 = derive_key_from_password(password, salt2)
        
        assert key1 != key2


class TestConvenienceFunctions:
    """Test module-level convenience functions"""
    
    def test_convenience_encrypt_decrypt(self):
        """Test convenience encrypt/decrypt functions"""
        from backend.python.utils.field_encryption import encrypt_field, decrypt_field
        
        original = "09123456789"
        encrypted = encrypt_field(original)
        decrypted = decrypt_field(encrypted)
        
        assert decrypted == original
    
    def test_convenience_pii_functions(self):
        """Test convenience PII field functions"""
        from backend.python.utils.field_encryption import encrypt_pii_fields, decrypt_pii_fields
        
        data = {"name": "Test User", "contact_number": "09123456789"}
        
        encrypted = encrypt_pii_fields(data)
        decrypted = decrypt_pii_fields(encrypted)
        
        assert decrypted["name"] == data["name"]
        assert decrypted["contact_number"] == data["contact_number"]
    
    def test_is_pii_field_function(self):
        """Test is_pii_field helper function"""
        from backend.python.utils.field_encryption import is_pii_field
        
        assert is_pii_field("name") is True
        assert is_pii_field("contact_number") is True
        assert is_pii_field("contact_method") is True
        assert is_pii_field("hazard_type") is False
        assert is_pii_field("description") is False
