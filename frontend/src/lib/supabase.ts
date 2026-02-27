/**
 * Supabase Client Configuration
 * 
 * Initializes the Supabase client using environment variables from docker-compose.yml.
 * This singleton instance is used throughout the application for authentication,
 * database queries, and real-time subscriptions.
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables - injected at build time by CRA (react-scripts)
// Vercel/Docker must set these BEFORE `npm run build` runs
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Validate environment variables — check BOTH url and key for placeholders
const isPlaceholder = (val?: string) => !val || val === 'PLACEHOLDER_SET_IN_VERCEL';

if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
  const missing = [
    isPlaceholder(supabaseUrl) && 'REACT_APP_SUPABASE_URL',
    isPlaceholder(supabaseAnonKey) && 'REACT_APP_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ');

  console.error(
    `[GAIA] Missing or placeholder Supabase env vars: ${missing}. ` +
    'These must be set as BUILD-TIME environment variables. ' +
    'For Vercel: Settings → Environment Variables → Production scope. ' +
    'Then redeploy with "Clear Build Cache".'
  );

  throw new Error(
    `Missing Supabase environment variables (${missing}). ` +
    'REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set as build-time env vars. ' +
    'For Vercel: set in dashboard Settings → Environment Variables (Production). ' +
    'For Docker: set as ARG/ENV in Dockerfile or in docker-compose.yml. ' +
    'Then redeploy (without build cache).'
  );
}

// Create Supabase client with gaia schema
export const supabase = createClient(supabaseUrl as string, supabaseAnonKey as string, {
  db: {
    schema: 'gaia', // Use gaia schema instead of default 'public'
  },
  auth: {
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
