import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './App.css';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SkipLink } from './components/SkipLink';
import { queryClient } from './lib/queryClient';
import { storageCache } from './lib/storageCache';
import { useRealtimeNotifications } from './hooks/useRealtimeNotifications';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import LandingPage from './pages/LandingPage';

// Route-based code splitting — all non-landing pages are lazy-loaded to
// reduce the initial bundle and fix the Lighthouse "Unused JavaScript" warning.
const Login            = React.lazy(() => import('./pages/Login'));
const ResetPassword    = React.lazy(() => import('./pages/ResetPassword'));
const UpdatePassword   = React.lazy(() => import('./pages/UpdatePassword'));
const UnifiedDashboard = React.lazy(() => import('./pages/UnifiedDashboard'));
const PublicMap        = React.lazy(() => import('./pages/PublicMap'));
const CitizenReportForm  = React.lazy(() => import('./pages/CitizenReportForm'));
const ReportConfirmation = React.lazy(() => import('./pages/ReportConfirmation'));
const ReportTracking   = React.lazy(() => import('./pages/ReportTracking'));
const StatusPage       = React.lazy(() => import('./pages/StatusPage'));

/**
 * Component that applies document title based on route
 */
const DocumentTitleManager = () => {   
  useDocumentTitle();
  return null;
};

/**
 * Main App component with realtime notifications
 * Manages routing, authentication, and real-time subscriptions
 */
const AppContent = () => {
  // Enable realtime notifications for all users
  useRealtimeNotifications();

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <DocumentTitleManager />
      <SkipLink />
      <main id="main-content" className="min-h-screen bg-background">
        <React.Suspense fallback={
          <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-label="Loading page">
            <div className="w-8 h-8 rounded-full border-4 border-[#0A2A4D] border-t-transparent animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading...</span>
          </div>
        }>
        <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/map" element={<PublicMap />} />
            <Route path="/report" element={<CitizenReportForm />} />
            <Route path="/report/confirmation/:trackingId" element={<ReportConfirmation />} />
            <Route path="/track" element={<ReportTracking />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <UnifiedDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute>
                  <UnifiedDashboard />
                </ProtectedRoute>
              } 
            />
            <Route path="*" element={
              <div className="min-h-screen flex flex-col items-center justify-center bg-background">
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-bold tracking-tight">404 - Page Not Found</h1>
                  <p className="text-lg text-muted-foreground">
                    The page you&apos;re looking for doesn&apos;t exist yet.
                  </p>
                  <Link to="/" className="text-primary hover:underline">
                    Return to Home
                  </Link>
                </div>
              </div>
            } />
          </Routes>
        </React.Suspense>
          <Toaster />
        </main>
      </Router>
  );
};

const App = () => {
  useEffect(() => {
    try {
      storageCache.clearExpired();
    } catch(error) {
      console.warn('Failed to clear expired cache entries:', error);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      {/* React Query DevTools - only visible in development */}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};

export default App;
