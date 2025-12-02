import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './App.css';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SkipLink } from './components/SkipLink';
import { queryClient } from './lib/queryClient';
import { useRealtimeNotifications } from './hooks/useRealtimeNotifications';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import UpdatePassword from './pages/UpdatePassword';
import UnifiedDashboard from './pages/UnifiedDashboard';
import PublicMap from './pages/PublicMap';
import CitizenReportForm from './pages/CitizenReportForm';
import ReportConfirmation from './pages/ReportConfirmation';
import ReportTracking from './pages/ReportTracking';
import StatusPage from './pages/StatusPage';

/**
 * Component that applies document title based on route
 */
function DocumentTitleManager() {
  useDocumentTitle();
  return null;
}

/**
 * Main App component with realtime notifications
 * Manages routing, authentication, and real-time subscriptions
 */
function AppContent() {
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
                  <a href="/" className="text-primary hover:underline">
                    Return to Home
                  </a>
                </div>
              </div>
            } />
          </Routes>
          <Toaster />
        </main>
      </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      {/* React Query DevTools - only visible in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
