/**
 * Unified Dashboard with Collapsible Sidebar
 * 
 * Merges the previous Dashboard (analytics) and AdminDashboard (CRUD) into a single
 * cohesive interface with sidebar navigation.
 * 
 * Features:
 * - Collapsible sidebar with section grouping
 * - Analytics overview (default view)
 * - Admin controls for privileged users (RBAC-protected)
 * - Professional UI following ShadCN dashboard patterns
 * - Responsive design (mobile-friendly)
 * - Visual active/hover states for navigation
 * 
 * Reference: https://ui.shadcn.com/view/new-york-v4/dashboard-01
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { RSSAutoProcessProvider } from '../contexts/RSSAutoProcessContext';
import { NotificationsDropdown } from '../components/NotificationsDropdown';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '../components/ui/sidebar';
import { Separator } from '../components/ui/separator';
import {
  Activity,
  BarChart3,
  Users,
  FileText,
  Settings,
  Shield,
  MapPin,
  LogOut,
  Home,
  Rss,
} from 'lucide-react';

// Import tab content components
import AnalyticsView from '../components/dashboard/AnalyticsView';
import UserManagement from '../components/admin/UserManagement';
import AuditLogViewer from '../components/admin/AuditLogViewer';
import SystemConfig from '../components/admin/SystemConfig';
import ReportTriage from '../components/admin/ReportTriage';
import ActivityMonitor from '../components/admin/ActivityMonitor';
import RSSFeedsView from '../components/admin/RSSFeedsView';
import { ErrorBoundary } from '../components/ErrorBoundary';
import AdminOnboarding from '../components/admin/AdminOnboarding';

// Navigation items type
type NavItem = {
  title: string;
  icon: React.ElementType;
  view: string;
  requiresAdmin?: boolean;
  requiresRole?: UserRole[];
};

// Navigation structure
const navigationItems: NavItem[] = [
  {
    title: 'Analytics',
    icon: BarChart3,
    view: 'analytics',
  },
  {
    title: 'Live Map',
    icon: MapPin,
    view: 'map',
  },
  {
    title: 'User Management',
    icon: Users,
    view: 'users',
    requiresAdmin: true,
  },
  {
    title: 'Report Triage',
    icon: Shield,
    view: 'triage',
    requiresRole: ['master_admin', 'validator'],
  },
  {
    title: 'RSS Feeds',
    icon: Rss,
    view: 'rss',
    requiresRole: ['master_admin', 'validator'],
  },
  {
    title: 'Audit Logs',
    icon: FileText,
    view: 'audit',
    requiresAdmin: true,
  },
  {
    title: 'System Config',
    icon: Settings,
    view: 'config',
    requiresAdmin: true,
  },
  {
    title: 'Activity Monitor',
    icon: Activity,
    view: 'activity',
    requiresRole: ['master_admin', 'validator'],
  },
];

export default function UnifiedDashboard() {
  const { user, userProfile, loading: authLoading, signOut, isAdmin, hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get active view from URL query param or default to 'analytics'
  const [activeView, setActiveView] = useState(searchParams.get('view') || 'analytics');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  // Update URL when view changes
  useEffect(() => {
    setSearchParams({ view: activeView });
  }, [activeView, setSearchParams]);

  // Note: Map view removed from navigation - users should use /map route directly
  // Keeping this comment for clarity on navigation architecture

  // Filter navigation items based on user permissions
  const filteredNavItems = navigationItems.filter(item => {
    if (item.requiresAdmin && !isAdmin()) return false;
    if (item.requiresRole && !hasRole(...item.requiresRole)) return false;
    return true;
  });

  const handleViewChange = (view: string) => {
    // Special case: navigate to /map route for map view
    if (view === 'map') {
      navigate('/map');
      return;
    }
    setActiveView(view);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Render active view content
  const renderViewContent = () => {
    switch (activeView) {
      case 'analytics':
        return (
          <ErrorBoundary>
            <AnalyticsView />
          </ErrorBoundary>
        );
      case 'users':
        return (
          <ErrorBoundary>
            <UserManagement />
          </ErrorBoundary>
        );
      case 'triage':
        return (
          <ErrorBoundary>
            <ReportTriage />
          </ErrorBoundary>
        );
      case 'audit':
        return (
          <ErrorBoundary>
            <AuditLogViewer />
          </ErrorBoundary>
        );
      case 'config':
        return (
          <ErrorBoundary>
            <SystemConfig />
          </ErrorBoundary>
        );
      case 'activity':
        return (
          <ErrorBoundary>
            <ActivityMonitor />
          </ErrorBoundary>
        );
      case 'rss':
        return (
          <ErrorBoundary>
            <RSSFeedsView />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary>
            <AnalyticsView />
          </ErrorBoundary>
        );
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <RSSAutoProcessProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          {/* Sidebar */}
          <Sidebar className="border-r" data-tour="sidebar">
          <SidebarContent>
            {/* Header */}
            <SidebarGroup>
              <Link to="/" className="flex items-center gap-2 px-4 py-4 hover:bg-accent transition-colors cursor-pointer">
                <Home className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="font-semibold text-lg">GAIA</span>
                  <span className="text-xs text-muted-foreground">
                    {userProfile?.role.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </Link>
              <Separator />
            </SidebarGroup>

            {/* Navigation */}
            <SidebarGroup>
              <SidebarGroupLabel data-tour="sidebar-navigation">Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredNavItems.map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        onClick={() => handleViewChange(item.view)}
                        isActive={activeView === item.view}
                        tooltip={item.title}
                        data-tour={`nav-${item.view}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* User Info & Logout */}
            <SidebarGroup className="mt-auto">
              <Separator />
              <div className="px-4 py-4">
                <div className="flex flex-col gap-1 mb-2">
                  <span className="text-sm font-medium">{userProfile?.full_name || 'User'}</span>
                  <span className="text-xs text-muted-foreground">{userProfile?.email}</span>
                </div>
                <SidebarMenuButton onClick={handleLogout} className="w-full justify-start">
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </SidebarMenuButton>
              </div>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        {/* Main Content */}
        <SidebarInset className="flex-1 overflow-auto">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4" data-tour="admin-header">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h1 className="text-lg font-semibold">
              {navigationItems.find(item => item.view === activeView)?.title || 'Dashboard'}
            </h1>
            {/* Notifications Dropdown */}
            <div className="ml-auto">
              <NotificationsDropdown />
            </div>
          </header>
          
          <main className="p-6">
            {renderViewContent()}
          </main>

          {/* Onboarding */}
          <AdminOnboarding />
        </SidebarInset>
        </div>
      </SidebarProvider>
    </RSSAutoProcessProvider>
  );
}
