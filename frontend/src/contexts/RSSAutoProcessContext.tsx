/**
 * RSS Auto-Processing Context
 * 
 * Provides system-wide automatic RSS feed processing that continues
 * regardless of which view/tab the user is currently on.
 * 
 * Features:
 * - Automatic processing every 20 minutes
 * - Non-blocking background processing
 * - Overlap prevention (skips if already processing)
 * - Pause/Resume control
 * - Persists across view navigation
 * 
 * Usage:
 * - Wrap app with <RSSAutoProcessProvider>
 * - Use useRSSAutoProcess() hook to access state/controls
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rssQueryKeys } from '../hooks/useRSS';

// Configuration
const AUTO_PROCESS_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const COUNTDOWN_UPDATE_INTERVAL_MS = 1000; // 1 second

const API_URL = process.env.REACT_APP_API_URL || '';
const RSS_API_BASE = `${API_URL}/api/v1/admin/rss`;

interface RSSAutoProcessContextValue {
  isEnabled: boolean;
  isProcessing: boolean;
  countdown: string;
  nextRunTime: Date | null;
  toggle: () => void;
  processNow: () => Promise<void>;
}

const RSSAutoProcessContext = createContext<RSSAutoProcessContextValue | null>(null);

export function RSSAutoProcessProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  // State
  const [isEnabled, setIsEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [nextRunTime, setNextRunTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  
  // Refs for intervals
  const autoProcessIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  /**
   * Format remaining time as MM:SS or HH:MM:SS
   */
  const formatCountdown = useCallback((ms: number): string => {
    if (ms <= 0) return '00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Process feeds via API (non-blocking, backend handles in background)
   */
  const processFeeds = useCallback(async (): Promise<void> => {
    // Skip if already processing
    if (isProcessingRef.current) {
      console.log('[RSS Auto-Process] Skipping - already processing');
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    console.log('[RSS Auto-Process] Starting background processing...');

    try {
      const response = await fetch(`${RSS_API_BASE}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          detail: `HTTP error! status: ${response.status}`,
        }));
        throw new Error(errorData.detail || 'Processing request failed');
      }

      const data = await response.json();
      console.log('[RSS Auto-Process] Request accepted:', data.message);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.logs() });
      queryClient.invalidateQueries({ queryKey: rssQueryKeys.statistics() });
      
      toast.success(`Processing ${data.feeds_count} feeds in background`);
    } catch (error) {
      console.error('[RSS Auto-Process] Failed:', error);
      toast.error(`Auto-processing failed: ${(error as Error).message}`);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [queryClient]);

  /**
   * Schedule next auto-process run
   */
  const scheduleNextRun = useCallback(() => {
    const next = new Date(Date.now() + AUTO_PROCESS_INTERVAL_MS);
    setNextRunTime(next);
    return next;
  }, []);

  /**
   * Update countdown display
   */
  const updateCountdown = useCallback(() => {
    if (!nextRunTime) {
      setCountdown('');
      return;
    }
    
    const remaining = nextRunTime.getTime() - Date.now();
    if (remaining <= 0) {
      setCountdown('Processing...');
    } else {
      setCountdown(formatCountdown(remaining));
    }
  }, [nextRunTime, formatCountdown]);

  /**
   * Start auto-processing interval
   */
  const startAutoProcessing = useCallback(() => {
    // Clear any existing intervals
    if (autoProcessIntervalRef.current) {
      clearInterval(autoProcessIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Schedule first run
    const nextRun = scheduleNextRun();
    console.log(`[RSS Auto-Process] Enabled - Next run at ${nextRun.toLocaleTimeString()}`);

    // Set up the processing interval
    autoProcessIntervalRef.current = setInterval(() => {
      processFeeds();
      scheduleNextRun();
    }, AUTO_PROCESS_INTERVAL_MS);

    // Set up countdown update interval
    countdownIntervalRef.current = setInterval(() => {
      updateCountdown();
    }, COUNTDOWN_UPDATE_INTERVAL_MS);

    // Initial countdown update
    updateCountdown();
  }, [processFeeds, scheduleNextRun, updateCountdown]);

  /**
   * Stop auto-processing interval
   */
  const stopAutoProcessing = useCallback(() => {
    if (autoProcessIntervalRef.current) {
      clearInterval(autoProcessIntervalRef.current);
      autoProcessIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setNextRunTime(null);
    setCountdown('');
    console.log('[RSS Auto-Process] Disabled');
  }, []);

  /**
   * Toggle auto-processing on/off
   */
  const toggle = useCallback(() => {
    if (isEnabled) {
      stopAutoProcessing();
      setIsEnabled(false);
      toast.info('RSS auto-processing paused');
    } else {
      setIsEnabled(true);
      startAutoProcessing();
      toast.success('RSS auto-processing resumed (every 20 minutes)');
    }
  }, [isEnabled, startAutoProcessing, stopAutoProcessing]);

  /**
   * Manual process now (resets timer)
   */
  const processNow = useCallback(async () => {
    await processFeeds();
    // Reset timer after manual processing
    if (isEnabled) {
      scheduleNextRun();
    }
  }, [processFeeds, isEnabled, scheduleNextRun]);

  // Initialize auto-processing on mount
  useEffect(() => {
    if (isEnabled) {
      startAutoProcessing();
    }

    // Cleanup on unmount
    return () => {
      if (autoProcessIntervalRef.current) {
        clearInterval(autoProcessIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update countdown when nextRunTime changes
  useEffect(() => {
    updateCountdown();
  }, [nextRunTime, updateCountdown]);

  const value: RSSAutoProcessContextValue = {
    isEnabled,
    isProcessing,
    countdown,
    nextRunTime,
    toggle,
    processNow,
  };

  return (
    <RSSAutoProcessContext.Provider value={value}>
      {children}
    </RSSAutoProcessContext.Provider>
  );
}

/**
 * Hook to access RSS auto-processing state and controls
 */
export function useRSSAutoProcess(): RSSAutoProcessContextValue {
  const context = useContext(RSSAutoProcessContext);
  if (!context) {
    throw new Error('useRSSAutoProcess must be used within RSSAutoProcessProvider');
  }
  return context;
}

