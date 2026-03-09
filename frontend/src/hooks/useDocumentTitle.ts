import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Route title mapping for accessibility.
 * Screen readers announce page title changes to users.
 */
const routeTitles: Record<string, string> = {
  '/': 'Home | AGAILA ',
  '/map': 'Hazard Map | AGAILA',
  '/login': 'Login | AGAILA',
  '/register': 'Register | AGAILA',
  '/report': 'Submit Report | AGAILA',
  '/track': 'Track Report | AGAILA',
  '/dashboard': 'Dashboard | AGAILA',
  '/admin': 'Admin Dashboard | AGAILA',
  '/reset-password': 'Forgot Password | AGAILA',
  '/update-password': 'Update Password | AGAILA',
  '/status': 'System Status | AGAILA',
};

/**
 * Hook to update document title based on current route.
 * Important for screen reader users to know which page they're on.
 * 
 * @param customTitle - Optional custom title to override route-based title
 */
export function useDocumentTitle(customTitle?: string) {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;
    
    // Check for exact match first
    let title = routeTitles[pathname];
    
    // If no exact match, check for partial matches (e.g., /dashboard/analytics)
    if (!title) {
      const matchingRoute = Object.keys(routeTitles).find(
        route => route !== '/' && pathname.startsWith(route)
      );
      title = matchingRoute ? routeTitles[matchingRoute] : 'GAIA - Geospatial AI-driven Assessment';
    }
    
    // Use custom title if provided
    document.title = customTitle || title;
  }, [location.pathname, customTitle]);
}

export default useDocumentTitle;
