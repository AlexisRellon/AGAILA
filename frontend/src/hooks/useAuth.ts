/**
 * Authentication Hooks using React Query
 * 
 * Provides React Query-powered hooks for authentication operations:
 * - useUserProfile: Cached user profile with 5-min stale time
 * - useSignIn: Login mutation with automatic cache invalidation
 * - useSignOut: Logout mutation with cache clearing
 * 
 * Features:
 * - Automatic caching and deduplication
 * - Eliminates duplicate profile fetches
 * - Optimistic updates for better UX
 * - Built-in loading/error states
 * - Auth event logging (login/logout) to backend
 * - Single-session enforcement (invalidates other sessions on login)
 * - Updates last_login timestamp on successful login
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryClient';

const API_URL = process.env.REACT_APP_API_URL || '';

export type UserRole = 'master_admin' | 'validator' | 'lgu_responder' | 'citizen';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_activation';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  organization: string | null;
  department: string | null;
  position: string | null;
  last_login: string | null;
  onboarding_completed: boolean;
}

/**
 * Log authentication event to backend
 * This updates last_login and logs to activity_logs/audit_logs
 */
async function logAuthEvent(
  userId: string,
  userEmail: string,
  eventType: 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN' | 'SESSION_EXPIRED',
  sessionId?: string,
  reason?: string
): Promise<{ last_login?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/log-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        user_email: userEmail,
        event_type: eventType,
        session_id: sessionId,
        reason: reason,
      }),
    });
    
    if (!response.ok) {
      console.warn('[useAuth] Failed to log auth event:', response.status);
      return {};
    }
    
    const data = await response.json();
    console.log(`[useAuth] Auth event logged: ${eventType}`);
    return { last_login: data.last_login };
  } catch (error) {
    console.warn('[useAuth] Error logging auth event:', error);
    return {};
  }
}

/**
 * Fetch user profile from database with schema specification
 */
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const startTime = performance.now();
  
  try {
    console.log('[useAuth] Fetching profile for user:', userId);
    
    // 5-second timeout to prevent hangs
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Profile fetch timeout after 5s')), 5000)
    );
    
    const fetchPromise = supabase
      .schema('gaia')
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

    const duration = performance.now() - startTime;
    console.log(`[useAuth] Profile fetch took ${duration.toFixed(2)}ms`);

    if (error) {
      console.error('[useAuth] Error fetching user profile:', error);
      throw error;
    }

    console.log('[useAuth] Profile fetched successfully for user:', userId);
    return data as UserProfile;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[useAuth] Exception in fetchUserProfile after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

/**
 * Hook to fetch current authenticated user
 * Uses React Query for automatic caching and deduplication
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.auth.currentUser(),
    queryFn: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        // Expected state for unauthenticated users visiting public pages — silently return null
        if (error.message.includes('Auth session missing') ||
            error.message.includes('AuthSessionMissingError')) {
          return null;
        }

        // Clear invalid/corrupted sessions
        if (error.message.includes('session_not_found') ||
            error.message.includes('invalid') ||
            error.message.includes('JWT') ||
            error.message.includes('expired')) {
          console.warn('[useAuth] Clearing invalid session:', error.message);
          await supabase.auth.signOut();
          // Clear only Supabase auth-related keys
          Object.keys(localStorage).filter(key => key.startsWith('sb-') || key.includes('supabase')).forEach(key => localStorage.removeItem(key));
          throw error;
        }

        // Any other unexpected error
        console.warn('[useAuth] User retrieval error:', error.message);
        throw error;
      }

      return user;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - profile rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes in cache
    retry: (failureCount, error: unknown) => {
      // Never retry for "Auth session missing" — expected for unauthenticated users
      const err = error as { message?: string };
      if (err?.message?.includes('Auth session missing') ||
          err?.message?.includes('AuthSessionMissingError')) {
        return false;
      }
      return failureCount < 1; // Retry once for all other errors
    },
  });
}

/**
 * Hook to fetch user profile with React Query caching
 * Automatically deduplicates requests and caches for 5 minutes
 * 
 * @param userId - User ID to fetch profile for
 * @param enabled - Whether the query should run (default: true if userId exists)
 */
export function useUserProfile(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.auth.profile(userId),
    queryFn: () => fetchUserProfile(userId!),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - profile rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes in cache
    retry: (failureCount, error: unknown) => {
      // Don't retry on 404 (profile not found)
      const errorWithStatus = error as { status?: number };
      if (errorWithStatus?.status === 404) return false;
      return failureCount < 2;
    },
  });
}

/**
 * Hook for sign-in mutation
 * Automatically invalidates and refetches user profile on success
 * Supports Cloudflare Turnstile captcha verification
 * 
 * Features:
 * - Single-session enforcement: invalidates all other sessions on login
 * - Auth event logging: logs login to backend (updates last_login)
 * - Profile status check: blocks inactive/suspended accounts
 */
export function useSignIn() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      email, 
      password, 
      captchaToken 
    }: { 
      email: string; 
      password: string; 
      captchaToken?: string;
    }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? {
          captchaToken,
        } : undefined,
      });

      if (error) {
        await logAuthEvent(
          '',
          email,
          'FAILED_LOGIN',
          undefined,
          error.message
        );
        throw error;
      }
      
      // Get session ID for logging
      const sessionId = data.session?.access_token?.substring(0, 20);
      
      // Single-session enforcement: Sign out from all other sessions
      // This ensures only one active session per user at a time
      try {
        await supabase.auth.signOut({ scope: 'others' });
        console.log('[useAuth] Other sessions invalidated (single-session enforcement)');
      } catch (signOutError) {
        console.warn('[useAuth] Could not invalidate other sessions:', signOutError);
        // Continue with login even if this fails
      }
      
      // Log the login event to backend (updates last_login)
      const { last_login } = await logAuthEvent(
        data.user.id,
        data.user.email || email,
        'LOGIN',
        sessionId
      );
      
      // Fetch profile to check status
      const profile = await fetchUserProfile(data.user.id);
      
      if (profile && profile.status !== 'active') {
        await supabase.auth.signOut();
        // Log failed login due to inactive status
        await logAuthEvent(
          data.user.id,
          data.user.email || email,
          'FAILED_LOGIN',
          undefined,
          `Account is ${profile.status}`
        );
        throw new Error(`Account is ${profile.status}. Contact ICTD administrator.`);
      }

      // Return profile with updated last_login value
      const updatedProfile = profile && last_login 
        ? { ...profile, last_login } 
        : profile;
      
      return { user: data.user, profile: updatedProfile, session: data.session };
    },
    onSuccess: (data) => {
      // Invalidate and refetch current user and profile
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.currentUser() });
      queryClient.setQueryData(queryKeys.auth.profile(data.user.id), data.profile);
      console.log('[useAuth] Sign-in successful, cache updated');
    },
    onError: (error) => {
      console.error('[useAuth] Sign-in error:', error);
    },
  });
}

/**
 * Hook for sign-out mutation
 * Clears all cached data on success
 * Logs logout event to backend
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      // Get current user before signing out for logging
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      
      // Log the logout event before signing out
      if (user) {
        await logAuthEvent(
          user.id,
          user.email || 'unknown',
          'LOGOUT',
          session?.access_token?.substring(0, 20)
        );
      }
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      // Clear all cached auth data
      queryClient.removeQueries({ queryKey: queryKeys.auth.all });
      queryClient.clear(); // Clear entire cache for security
      console.log('[useAuth] Sign-out successful, cache cleared');
    },
    onError: (error) => {
      console.error('[useAuth] Sign-out error:', error);
    },
  });
}
