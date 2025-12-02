import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Route title mapping for accessibility.
 * Screen readers announce page title changes to users.
 */
const routeTitles: Record<string, string> = {
  '/': 'Home | GAIA - Geospatial AI-driven Assessment',
  '/map': 'Hazard Map | GAIA',
  '/login': 'Login | GAIA',
  '/register': 'Register | GAIA',
  '/report': 'Submit Report | GAIA',
  '/track': 'Track Report | GAIA',
  '/dashboard': 'Dashboard | GAIA',
  '/admin': 'Admin Dashboard | GAIA',
  '/reset-password': 'Reset Password | GAIA',
  '/update-password': 'Update Password | GAIA',
  '/status': 'System Status | GAIA',
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
