"""
Verification script for CORS configuration fix
Validates that agaila-ph.vercel.app is in allowed origins
"""
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(project_root))

# Mock environment for production
os.environ['ENV'] = 'production'

# Import after setting env
from backend.python.main import app

def verify_cors_config():
    """Verify CORS configuration includes correct production origins"""
    
    # Get CORS middleware from app
    cors_middleware = None
    for middleware in app.user_middleware:
        if middleware.cls.__name__ == 'CORSMiddleware':
            cors_middleware = middleware
            break
    
    if not cors_middleware:
        print("❌ CORS middleware not found!")
        return False
    
    # Extract options
    options = cors_middleware.options
    
    print("\n=== CORS Configuration Verification ===")
    print(f"Environment: {os.getenv('ENV')}")
    print(f"\nAllowed Origins: {options.get('allow_origins', [])}")
    print(f"Allowed Methods: {options.get('allow_methods', [])}")
    print(f"Allow Credentials: {options.get('allow_credentials', False)}")
    print(f"Allowed Origin Regex: {options.get('allow_origin_regex', None)}")
    
    # Verify requirements
    allowed_origins = options.get('allow_origins', [])
    allowed_methods = options.get('allow_methods', [])
    
    checks_passed = True
    
    # Check 1: agaila-ph.vercel.app in allowed origins
    if 'https://agaila-ph.vercel.app' in allowed_origins:
        print("\n✅ CHECK 1 PASSED: agaila-ph.vercel.app is in allowed origins")
    else:
        print("\n❌ CHECK 1 FAILED: agaila-ph.vercel.app NOT in allowed origins")
        checks_passed = False
    
    # Check 2: agaila.me in allowed origins
    if 'https://agaila.me' in allowed_origins:
        print("✅ CHECK 2 PASSED: agaila.me is in allowed origins")
    else:
        print("❌ CHECK 2 FAILED: agaila.me NOT in allowed origins")
        checks_passed = False
    
    # Check 3: PATCH in allowed methods
    if 'PATCH' in allowed_methods:
        print("✅ CHECK 3 PASSED: PATCH is in allowed methods")
    else:
        print("❌ CHECK 3 FAILED: PATCH NOT in allowed methods")
        checks_passed = False
    
    # Check 4: Vercel preview regex pattern
    origin_regex = options.get('allow_origin_regex')
    if origin_regex:
        print(f"✅ CHECK 4 PASSED: Vercel preview regex configured: {origin_regex}")
    else:
        print("⚠️  CHECK 4 WARNING: No origin regex pattern (Vercel previews won't work)")
    
    print("\n" + "="*40)
    if checks_passed:
        print("✅ ALL CRITICAL CHECKS PASSED")
        print("\nCORS is now correctly configured for:")
        print("  • Production frontend: https://agaila-ph.vercel.app")
        print("  • Custom domain: https://agaila.me")
        print("  • PATCH method: Enabled")
        return True
    else:
        print("❌ SOME CHECKS FAILED - Review configuration")
        return False

if __name__ == "__main__":
    success = verify_cors_config()
    sys.exit(0 if success else 1)
