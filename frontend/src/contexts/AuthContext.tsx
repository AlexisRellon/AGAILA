/**
 * Authentication Context (React Query Optimized)
 * 
 * Provides global authentication state management using React Query.
 * Eliminates duplicate API calls through automatic caching and deduplication.
 * 
 * OPTIMIZATIONS:
 * - User profile cached for 5 minutes (staleTime)
 * - Automatic request deduplication (React Query)
 * - No redundant fetches on navigation/mount
 * - Proper cache invalidation on auth state changes
 * 
 * Usage:
 *   Wrap your app with <AuthProvider>
 *   Access auth state with useAuth() hook
 */

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  useCurrentUser,
  useUserProfile,
  useSignIn as useSignInMutation,
  useSignOut as useSignOutMutation,
  UserProfile,
  UserRole,
  UserStatus,
} from '../hooks/useAuth';

// Re-export types for backwards compatibility
export type { UserRole, UserStatus, UserProfile };

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  isAdmin: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auto-logout timeout: 30 minutes (1,800,000 ms) - More reasonable for production
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use React Query hooks for data fetching
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: userProfile, isLoading: profileLoading } = useUserProfile(
    currentUser?.id,
    !!currentUser
  );
  
  // Sync React Query user with local state
  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      setLoading(false);
    } else if (!userLoading) {
      setUser(null);
      setLoading(false);
    }
  }, [currentUser, userLoading]);
  const signInMutation = useSignInMutation();
  const signOutMutation = useSignOutMutation();

  // Stable signOut callback so it can be referenced safely in timers/effects
  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync();
  }, [signOutMutation]);

  // Reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    if (user) {
      inactivityTimerRef.current = setTimeout(async () => {
        await signOut();
        alert('You have been logged out due to inactivity.');
      }, INACTIVITY_TIMEOUT);
    }
  }, [user, signOut]);

  useEffect(() => {
    let mounted = true;

    // Listen for auth state changes only - React Query handles fetching
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        // eslint-disable-next-line no-console
        console.log('[AuthContext] Auth state change:', event);
        
        setUser(session?.user ?? null);
        
        // Invalidate queries on auth change
        if (event === 'SIGNED_OUT') {
          queryClient.clear();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          queryClient.invalidateQueries({ queryKey: ['auth'] });
        }
        
        if (mounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [queryClient]);

  // Activity tracking
  useEffect(() => {
    if (!user) return;

    resetInactivityTimer();

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [user, resetInactivityTimer]);

  // Wrapper functions for mutations
  const signIn = async (email: string, password: string, captchaToken?: string) => {
    await signInMutation.mutateAsync({ email, password, captchaToken });
  };

  const signUp = async () => {
    throw new Error('Self-registration is disabled. Please contact administrator.');
  };

  // signOut is defined above with useCallback to keep identity stable

  // Refresh profile by invalidating cache
  const refreshProfile = useCallback(async () => {
    if (user) {
      // eslint-disable-next-line no-console
      console.log('[AuthContext] Refreshing profile');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'profile', user.id] });
    }
  }, [user, queryClient]);

  // Role checking functions - computed from userProfile
  const hasRole = useCallback((...roles: UserRole[]): boolean => {
    if (!userProfile) return false;
    return roles.includes(userProfile.role);
  }, [userProfile]);

  const isAdmin = useCallback((): boolean => {
    if (!userProfile) return false;
    return ['master_admin', 'validator', 'lgu_responder'].includes(userProfile.role);
  }, [userProfile]);

  const value = {
    user,
    userProfile: userProfile ?? null,
    loading: loading || profileLoading || signInMutation.isPending || signOutMutation.isPending,
    signIn,
    signUp,
    signOut,
    hasRole,
    isAdmin,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Custom hook to access authentication context
 * 
 * @throws Error if used outside of AuthProvider
 * @returns AuthContextType with user, userProfile, loading, signIn, signUp, signOut, hasRole, isAdmin, refreshProfile
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
