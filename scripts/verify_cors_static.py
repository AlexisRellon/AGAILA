"""
Static CORS Configuration Verification
Parses main.py to verify CORS configuration without importing dependencies
"""
import re
from pathlib import Path

def verify_cors_in_source():
    """Verify CORS configuration by parsing source code"""
    
    main_py = Path(__file__).parent.parent / "backend" / "python" / "main.py"
    
    if not main_py.exists():
        print(f"❌ Cannot find {main_py}")
        return False
    
    content = main_py.read_text(encoding='utf-8')
    
    print("\n=== Static CORS Configuration Verification ===\n")
    
    # Extract default_origins line for production
    production_origins_match = re.search(
        r'if ENV == "production".*?default_origins = "(.*?)"',
        content,
        re.DOTALL
    )
    
    if not production_origins_match:
        print("❌ Could not find production default_origins configuration")
        return False
    
    origins_str = production_origins_match.group(1)
    origins = [o.strip() for o in origins_str.split(',')]
    
    print(f"Production Default Origins:\n  {origins_str}\n")
    
    # Extract allow_methods
    methods_match = re.search(r'allow_methods=\[(.*?)\]', content, re.DOTALL)
    if not methods_match:
        print("❌ Could not find allow_methods configuration")
        return False
    
    methods_str = methods_match.group(1)
    # Parse methods from string like '"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"'
    methods = [m.strip().strip('"\'') for m in methods_str.split(',')]
    
    print(f"Allowed Methods:\n  {', '.join(methods)}\n")
    
    # Run checks
    checks_passed = True
    
    # Check 1: agaila-ph.vercel.app
    if 'https://agaila-ph.vercel.app' in origins:
        print("✅ CHECK 1 PASSED: agaila-ph.vercel.app is in allowed origins")
    else:
        print("❌ CHECK 1 FAILED: agaila-ph.vercel.app NOT in allowed origins")
        print(f"   Found origins: {origins}")
        checks_passed = False
    
    # Check 2: agaila.me
    if 'https://agaila.me' in origins:
        print("✅ CHECK 2 PASSED: agaila.me is in allowed origins")
    else:
        print("❌ CHECK 2 FAILED: agaila.me NOT in allowed origins")
        checks_passed = False
    
    # Check 3: PATCH method
    if 'PATCH' in methods:
        print("✅ CHECK 3 PASSED: PATCH is in allowed methods")
    else:
        print("❌ CHECK 3 FAILED: PATCH NOT in allowed methods")
        print(f"   Found methods: {methods}")
        checks_passed = False
    
    # Check 4: Vercel regex pattern
    regex_match = re.search(r'allow_origin_regex.*?r"(.*?)"', content, re.DOTALL)
    if regex_match:
        regex_pattern = regex_match.group(1)
        print(f"✅ CHECK 4 PASSED: Vercel preview regex: {regex_pattern}")
    else:
        print("⚠️  CHECK 4 WARNING: No origin regex pattern found")
    
    print("\n" + "="*50)
    
    if checks_passed:
        print("✅ ALL CRITICAL CHECKS PASSED\n")
        print("CORS is correctly configured for:")
        print("  • Frontend: https://agaila-ph.vercel.app")
        print("  • Custom domain: https://agaila.me")
        print("  • Backend: https://gaia-production-2294.up.railway.app")
        print("  • PATCH method: Enabled")
        print("\nThe CORS error on /api/v1/admin/users/{id}/deactivate")
        print("should now be resolved in production.")
        return True
    else:
        print("❌ SOME CHECKS FAILED\n")
        return False

if __name__ == "__main__":
    import sys
    success = verify_cors_in_source()
    sys.exit(0 if success else 1)
