#!/usr/bin/env python3
"""
Test SSRF Protection for download_municipality_boundaries.py

This script validates that the SSRF protection correctly:
- Blocks internal/private IP addresses
- Blocks non-whitelisted domains
- Blocks invalid URL schemes
- Blocks suspicious URL patterns
- Allows valid GitHub URLs
"""

import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from download_municipality_boundaries import (
    validate_url,
    sanitize_resolution,
    sanitize_region_code,
    ALLOWED_DOMAINS,
    REGIONS,
    RESOLUTION_MAP
)


def test_validate_url():
    """Test URL validation function."""
    print("\n=== Testing URL Validation ===\n")
    
    # Test cases: (url, should_pass, description)
    test_cases = [
        # Valid URLs
        ("https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/test.json", True, "Valid GitHub raw URL"),
        ("https://github.com/faeldon/philippines-json-maps", True, "Valid GitHub main URL"),
        ("http://raw.githubusercontent.com/test/data.json", True, "Valid HTTP GitHub URL"),
        
        # Invalid schemes
        ("file:///etc/passwd", False, "File scheme (blocked)"),
        ("ftp://raw.githubusercontent.com/test.json", False, "FTP scheme (blocked)"),
        ("data:text/html,<script>alert('xss')</script>", False, "Data URI scheme (blocked)"),
        ("javascript:alert(1)", False, "JavaScript scheme (blocked)"),
        
        # Internal/Private IPs
        ("http://127.0.0.1:8000/api", False, "Localhost IPv4 (blocked)"),
        ("http://localhost/api", False, "Localhost hostname (blocked - not whitelisted)"),
        ("http://10.0.0.1/internal", False, "Private Class A IP (blocked)"),
        ("http://172.16.0.1/internal", False, "Private Class B IP (blocked)"),
        ("http://192.168.1.1/internal", False, "Private Class C IP (blocked)"),
        ("http://169.254.169.254/metadata", False, "Link-local IP (AWS metadata, blocked)"),
        ("http://[::1]/api", False, "IPv6 localhost (blocked)"),
        
        # Non-whitelisted domains
        ("https://evil.com/malicious.json", False, "Non-whitelisted domain"),
        ("https://attacker.com/exploit", False, "Attacker domain (blocked)"),
        ("https://raw.githubusercontent.evil.com/test.json", False, "Domain typosquatting (blocked)"),
        
        # Path traversal attempts
        ("https://raw.githubusercontent.com/../../../etc/passwd", False, "Path traversal (blocked)"),
        ("https://raw.githubusercontent.com/test%2e%2e/file", False, "URL-encoded path traversal (blocked)"),
        
        # Suspicious patterns
        ("https://raw.githubusercontent.com/test?redirect=http://evil.com", True, "Query params (allowed if domain OK)"),
        ("https://raw.githubusercontent.com/test%00.json", False, "Null byte injection (blocked)"),
        ("https://raw.githubusercontent.com/test%0d%0a.json", False, "CRLF injection (blocked)"),
        
        # Invalid URLs
        ("", False, "Empty URL"),
        ("not-a-url", False, "Invalid URL format"),
        ("https://", False, "Missing hostname"),
    ]
    
    passed = 0
    failed = 0
    
    for url, should_pass, description in test_cases:
        try:
            validate_url(url)
            result = "PASS" if should_pass else "FAIL"
            status = "✓" if should_pass else "✗"
            
            if should_pass:
                passed += 1
                print(f"{status} {result}: {description}")
                print(f"   URL: {url}")
            else:
                failed += 1
                print(f"{status} {result}: {description} - SECURITY ISSUE: Should have been blocked!")
                print(f"   URL: {url}")
                
        except (ValueError, Exception) as e:
            result = "FAIL" if should_pass else "PASS"
            status = "✗" if should_pass else "✓"
            
            if not should_pass:
                passed += 1
                print(f"{status} {result}: {description}")
                print(f"   URL: {url}")
                print(f"   Blocked with: {str(e)[:80]}")
            else:
                failed += 1
                print(f"{status} {result}: {description} - Valid URL incorrectly blocked!")
                print(f"   URL: {url}")
                print(f"   Error: {str(e)[:80]}")
    
    print(f"\n--- URL Validation Results ---")
    print(f"Passed: {passed}/{len(test_cases)}")
    print(f"Failed: {failed}/{len(test_cases)}")
    
    return failed == 0


def test_sanitize_resolution():
    """Test resolution sanitization function."""
    print("\n=== Testing Resolution Sanitization ===\n")
    
    test_cases = [
        # Valid resolutions
        ("lowres", True, "Valid lowres"),
        ("medres", True, "Valid medres"),
        ("hires", True, "Valid hires"),
        
        # Invalid resolutions
        ("invalid", False, "Invalid resolution name"),
        ("../../../etc/passwd", False, "Path traversal in resolution"),
        ("lowres; rm -rf /", False, "Command injection attempt"),
        ("", False, "Empty resolution"),
        (None, False, "None resolution"),
        ("LOWRES", False, "Case mismatch (uppercase)"),
    ]
    
    passed = 0
    failed = 0
    
    for resolution, should_pass, description in test_cases:
        try:
            result_val = sanitize_resolution(resolution)
            result = "PASS" if should_pass else "FAIL"
            status = "✓" if should_pass else "✗"
            
            if should_pass:
                passed += 1
                print(f"{status} {result}: {description}")
                print(f"   Input: {resolution} -> Output: {result_val}")
            else:
                failed += 1
                print(f"{status} {result}: {description} - Should have been rejected!")
                print(f"   Input: {resolution}")
                
        except (ValueError, Exception) as e:
            result = "FAIL" if should_pass else "PASS"
            status = "✗" if should_pass else "✓"
            
            if not should_pass:
                passed += 1
                print(f"{status} {result}: {description}")
                print(f"   Input: {resolution}")
                print(f"   Blocked with: {str(e)[:80]}")
            else:
                failed += 1
                print(f"{status} {result}: {description} - Valid value incorrectly blocked!")
                print(f"   Input: {resolution}")
                print(f"   Error: {str(e)[:80]}")
    
    print(f"\n--- Resolution Sanitization Results ---")
    print(f"Passed: {passed}/{len(test_cases)}")
    print(f"Failed: {failed}/{len(test_cases)}")
    
    return failed == 0


def test_sanitize_region_code():
    """Test region code sanitization function."""
    print("\n=== Testing Region Code Sanitization ===\n")
    
    test_cases = [
        # Valid region codes
        ("01", True, "Valid Region I"),
        ("14", True, "Valid NCR"),
        ("17", True, "Valid BARMM"),
        
        # Invalid region codes
        ("99", False, "Invalid region code"),
        ("../etc", False, "Path traversal in region code"),
        ("01; DROP TABLE", False, "SQL injection attempt"),
        ("", False, "Empty region code"),
        (None, False, "None region code"),
        ("1", False, "Wrong format (should be zero-padded)"),
    ]
    
    passed = 0
    failed = 0
    
    for region_code, should_pass, description in test_cases:
        try:
            result_val = sanitize_region_code(region_code)
            result = "PASS" if should_pass else "FAIL"
            status = "✓" if should_pass else "✗"
            
            if should_pass:
                passed += 1
                print(f"{status} {result}: {description}")
                print(f"   Input: {region_code} -> Output: {result_val}")
            else:
                failed += 1
                print(f"{status} {result}: {description} - Should have been rejected!")
                print(f"   Input: {region_code}")
                
        except (ValueError, Exception) as e:
            result = "FAIL" if should_pass else "PASS"
            status = "✗" if should_pass else "✓"
            
            if not should_pass:
                passed += 1
                print(f"{status} {result}: {description}")
                print(f"   Input: {region_code}")
                print(f"   Blocked with: {str(e)[:80]}")
            else:
                failed += 1
                print(f"{status} {result}: {description} - Valid value incorrectly blocked!")
                print(f"   Input: {region_code}")
                print(f"   Error: {str(e)[:80]}")
    
    print(f"\n--- Region Code Sanitization Results ---")
    print(f"Passed: {passed}/{len(test_cases)}")
    print(f"Failed: {failed}/{len(test_cases)}")
    
    return failed == 0


def main():
    """Run all tests."""
    print("=" * 70)
    print("SSRF Protection Test Suite")
    print("Testing: download_municipality_boundaries.py")
    print("=" * 70)
    
    print(f"\nAllowed domains: {ALLOWED_DOMAINS}")
    print(f"Valid resolutions: {set(RESOLUTION_MAP.keys())}")
    print(f"Valid region codes: {set(REGIONS.keys())}")
    
    results = {
        "URL Validation": test_validate_url(),
        "Resolution Sanitization": test_sanitize_resolution(),
        "Region Code Sanitization": test_sanitize_region_code(),
    }
    
    print("\n" + "=" * 70)
    print("FINAL RESULTS")
    print("=" * 70)
    
    all_passed = True
    for test_name, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("=" * 70)
    
    if all_passed:
        print("\n✓ ALL TESTS PASSED - SSRF Protection is working correctly!")
        return 0
    else:
        print("\n✗ SOME TESTS FAILED - Please review the failures above")
        return 1


if __name__ == "__main__":
    sys.exit(main())
