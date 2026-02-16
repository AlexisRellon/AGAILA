/**
 * ReportGenerator Component
 * 
 * Provides UI for generating PDF hazard reports with map screenshots.
 * Uses Dialog for modal interface and integrates with useMapScreenshot
 * and backend PDF generation endpoint.
 * 
 * Module: RG-03 (Report Generation Frontend)
 * Change: add-advanced-map-features (Phase 4)
 * 
 * Features:
 * - Captures map screenshot automatically
 * - Configurable report metadata
 * - Progress indicators
 * - Error handling
 * - Download PDF directly
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert } from '../ui/alert';
import { useMapScreenshot } from '../../hooks/useMapScreenshot';
import { useHazardFilters } from '../../hooks/useHazardFilters';
import { supabase } from '../../lib/supabase';
import { 
  FileText, 
  Download, 
  Camera, 
  AlertTriangle,
  Loader2,
  CheckCircle2
} from 'lucide-react';

interface Hazard {
  id: string;
  hazard_type: string;
  severity: string;
  location_name: string;
  latitude: number;
  longitude: number;
  confidence_score: number;
  source_type: string;
  validated: boolean;
  created_at: string;
  source_content?: string;
}

interface ReportGeneratorProps {
  /**
   * Hazards to include in report (pre-filtered)
   */
  hazards: Hazard[];
  
  /**
   * Ref to map container element for screenshot
   */
  mapContainerRef: React.RefObject<HTMLElement | null>;
  
  /**
   * Optional custom trigger button
   */
  triggerButton?: React.ReactNode;
  
  /**
   * Callback when report is successfully generated
   */
  onReportGenerated?: (filename: string) => void;
}

type ReportStep = 'idle' | 'capturing' | 'generating' | 'success' | 'error';

export const ReportGenerator: React.FC<ReportGeneratorProps> = ({
  hazards,
  mapContainerRef,
  triggerButton,
  onReportGenerated,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState('GAIA Hazard Report');
  const [generatedBy, setGeneratedBy] = useState('GAIA System');
  const [includeMap, setIncludeMap] = useState(true);
  const [currentStep, setCurrentStep] = useState<ReportStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  
  const { captureMapScreenshot } = useMapScreenshot();
  const { filters, activeFilterCount } = useHazardFilters();

  /**
   * Format filter summary for report metadata
   */
  const getFilterSummary = (): string => {
    if (activeFilterCount === 0) return 'No filters applied (all hazards shown)';
    
    const parts: string[] = [];
    
    // Hazard types
    if (filters.hazardTypes && filters.hazardTypes.length > 0) {
      parts.push(`Types: ${filters.hazardTypes.map(t => t.replace('_', ' ')).join(', ')}`);
    }
    
    // Time window
    if (filters.timeWindow !== 'all') {
      const timeLabels: Record<string, string> = {
        '24h': 'Last 24 hours',
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
        'custom': 'Custom date range',
      };
      parts.push(`Time: ${timeLabels[filters.timeWindow]}`);
    }
    
    // Source types
    if (filters.sourceTypes && filters.sourceTypes.length > 0) {
      parts.push(`Sources: ${filters.sourceTypes.map(s => s.replace('_', ' ')).join(', ')}`);
    }
    
    // Severities
    if (filters.severities && filters.severities.length > 0) {
      parts.push(`Severities: ${filters.severities.join(', ')}`);
    }
    
    return parts.join(' | ');
  };

  /**
   * Format time range for report metadata
   */
  const getTimeRange = (): string | null => {
    if (!filters.timeWindow || filters.timeWindow === 'all') return null;
    
    if (filters.timeWindow === 'custom' && filters.customDateRange) {
      const start = new Date(filters.customDateRange.start).toLocaleDateString();
      const end = new Date(filters.customDateRange.end).toLocaleDateString();
      return `${start} - ${end}`;
    }
    
    const timeLabels: Record<string, string> = {
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
    };
    
    return timeLabels[filters.timeWindow] || null;
  };

  /**
   * Generate PDF report with map screenshot
   */
  const handleGenerateReport = async () => {
    setCurrentStep('capturing');
    setErrorMessage(null);
    setScreenshotPreview(null);

    try {
      let mapScreenshotBase64: string | null = null;

      // Step 1: Capture map screenshot if enabled
      if (includeMap && mapContainerRef.current) {
        const screenshotResult = await captureMapScreenshot(
          mapContainerRef.current,
          {
            format: 'jpeg',
            quality: 0.7,  // Reduced from 0.9 to decrease payload size
            scale: 1,      // Reduced from 2 to decrease payload size
            backgroundColor: '#ffffff',
          }
        );

        if (screenshotResult) {
          mapScreenshotBase64 = screenshotResult.dataUrl;
          setScreenshotPreview(screenshotResult.dataUrl);
        } else {
          throw new Error('Failed to capture map screenshot');
        }
      }

      // Step 2: Prepare report data
      setCurrentStep('generating');

      const reportRequest = {
        hazards: hazards.map(h => ({
          id: h.id,
          hazard_type: h.hazard_type,
          severity: h.severity,
          location_name: h.location_name,
          latitude: h.latitude,
          longitude: h.longitude,
          confidence_score: h.confidence_score,
          source_type: h.source_type,
          created_at: h.created_at,
          source_content: h.source_content || null,
        })),
        metadata: {
          title: reportTitle,
          generated_by: generatedBy,
          time_range: getTimeRange(),
          filter_summary: getFilterSummary(),
          total_hazards: hazards.length,
          page_size: 'letter',
        },
        map_screenshot_base64: mapScreenshotBase64,
      };

      // Step 3: Call backend API to generate PDF (include auth for activity logging)
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`${apiUrl}/api/v1/reports/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(reportRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Failed to generate PDF');
      }

      // Step 4: Download PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `gaia_hazard_report_${timestamp}.pdf`;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Success!
      setCurrentStep('success');
      
      if (onReportGenerated) {
        onReportGenerated(filename);
      }

      // Auto-close dialog after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        // Reset state when dialog closes
        setTimeout(() => {
          setCurrentStep('idle');
          setScreenshotPreview(null);
        }, 300);
      }, 2000);

    } catch (error) {
      console.error('Report generation failed:', error);
      setCurrentStep('error');
      setErrorMessage(
        error instanceof Error 
          ? error.message 
          : 'An unknown error occurred'
      );
    }
  };

  /**
   * Reset state when dialog is closed
   */
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset after dialog close animation
      setTimeout(() => {
        setCurrentStep('idle');
        setErrorMessage(null);
        setScreenshotPreview(null);
      }, 300);
    }
  };

  /**
   * Render step indicator
   */
  const renderStepIndicator = () => {
    if (currentStep === 'idle') return null;

    const steps = [
      { key: 'capturing', label: 'Capturing Map', icon: Camera },
      { key: 'generating', label: 'Generating PDF', icon: FileText },
      { key: 'success', label: 'Complete!', icon: CheckCircle2 },
    ];

    return (
      <div className="space-y-2 mb-4">
        {steps.map(({ key, label, icon: Icon }) => {
          const isActive = currentStep === key;
          const isComplete = 
            (key === 'capturing' && ['generating', 'success'].includes(currentStep)) ||
            (key === 'generating' && currentStep === 'success');
          
          return (
            <div
              key={key}
              className={`flex items-center space-x-3 p-2 rounded ${
                isActive ? 'bg-blue-50 border border-blue-200' : ''
              }`}
            >
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : isActive ? (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              ) : (
                <Icon className="h-5 w-5 text-gray-400" />
              )}
              <span
                className={`text-sm ${
                  isActive ? 'font-semibold text-blue-900' : 
                  isComplete ? 'text-green-700' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Generate Report
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate PDF Report
          </DialogTitle>
          <DialogDescription>
            Create a professional PDF report with hazard data and map visualization.
          </DialogDescription>
        </DialogHeader>

        {/* Configuration Form (only show when idle) */}
        {currentStep === 'idle' && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="report-title" className="text-sm font-medium text-gray-700">
                Report Title
              </label>
              <Input
                id="report-title"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="GAIA Hazard Report"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="generated-by" className="text-sm font-medium text-gray-700">
                Generated By
              </label>
              <Input
                id="generated-by"
                value={generatedBy}
                onChange={(e) => setGeneratedBy(e.target.value)}
                placeholder="GAIA System"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="include-map"
                checked={includeMap}
                onChange={(e) => setIncludeMap(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="include-map" className="text-sm font-medium text-gray-700 cursor-pointer">
                Include map screenshot
              </label>
            </div>

            {/* Report Summary */}
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <p className="text-sm font-semibold text-blue-900 mb-1">
                Report Summary
              </p>
              <p className="text-xs text-blue-700">
                <strong>{hazards.length}</strong> hazard{hazards.length !== 1 ? 's' : ''} will be included
              </p>
              {activeFilterCount > 0 && (
                <p className="text-xs text-blue-700 mt-1">
                  <strong>{activeFilterCount}</strong> active filter{activeFilterCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        {['capturing', 'generating', 'success'].includes(currentStep) && (
          <div className="py-4">
            {renderStepIndicator()}
            
            {/* Screenshot Preview */}
            {screenshotPreview && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Map Screenshot Preview:</p>
                <img
                  src={screenshotPreview}
                  alt="Map screenshot preview"
                  className="w-full rounded border border-gray-300"
                />
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {currentStep === 'error' && errorMessage && (
          <Alert variant="destructive" className="mt-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-semibold">Report Generation Failed</p>
                <p className="text-sm mt-1">{errorMessage}</p>
              </div>
            </div>
          </Alert>
        )}

        {/* Footer Buttons */}
        <DialogFooter>
          {currentStep === 'idle' && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateReport}
                disabled={hazards.length === 0}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Generate PDF
              </Button>
            </>
          )}
          
          {currentStep === 'error' && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Close
              </Button>
              <Button
                onClick={handleGenerateReport}
                className="gap-2"
              >
                Try Again
              </Button>
            </>
          )}
          
          {currentStep === 'success' && (
            <Button
              onClick={() => setIsOpen(false)}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
