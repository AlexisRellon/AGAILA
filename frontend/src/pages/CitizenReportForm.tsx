/**
 * Citizen Report Form (CR-01, CR-06)
 * Allows citizens to submit hazard reports with optional image upload
 * 
 * Features:
 * - Form validation with Zod schema
 * - Character limits and field sanitization
 * - Image upload component integration
 * - Required map location picker (pin on map or use GPS)
 * - Cloudflare Turnstile integration
 * - Honeypot field for spam prevention
 * - Mobile responsive design
 * - Accessibility support (keyboard navigation, screen readers)
 */

import React, { useState, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate, Link } from 'react-router-dom';
// import { Turnstile } from '@marsidev/react-turnstile'; // TEMPORARILY DISABLED
// import type { TurnstileInstance } from '@marsidev/react-turnstile'; // TEMPORARILY DISABLED
import { AlertCircle, Send, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { ALL_HAZARD_TYPES } from '../hooks/useHazardFilters';
import { HAZARD_ICON_REGISTRY, HazardIcon } from '../constants/hazard-icons';
import ImageUpload from '../components/reports/ImageUpload';
// LocationPicker wraps Leaflet (~150KB+). Lazy-load it so it's excluded from
// the initial CitizenReportForm chunk and only fetched when the form renders.
const LocationPicker = React.lazy(() => import('../components/reports/LocationPicker'));
// import { supabase } from '../lib/supabase'; // TEMPORARILY DISABLED - backend handles image upload
import { API_BASE_URL } from '../lib/api';
import { isValidPhilippinePhoneNumber } from '../utils/phoneValidation';
import { z } from 'zod';

/** Must match backend SUBMISSION_COOLDOWN_SECONDS. Cooldown starts on successful submit. */
const SUBMISSION_COOLDOWN_SECONDS = 300;
const COOLDOWN_STORAGE_KEY = 'citizen_report_cooldown_until';

// ============================================================================
// TYPES
// ============================================================================

interface FormData {
  hazardType: string;
  description: string;
  name: string;
  contactNumber: string;
  latitude?: number;
  longitude?: number;
  image?: File;
  imageMetadata?: {
    timestamp?: string;
    device?: string;
  };
  // Honeypot field (hidden, should remain empty)
  website?: string;
}

interface FormErrors {
  hazardType?: string;
  description?: string;
  name?: string;
  contactNumber?: string;
  location?: string;
  captcha?: string;
  submit?: string;
}

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const descriptionMax = 1000;
const nameMax = 100;

/**
 * Zod schema that mirrors the FormData interface.
 * Validates all user-facing fields; optional/internal fields pass through.
 */
const CitizenReportSchema = z.object({
  hazardType: z.string()
    .min(1, 'Please select a hazard type')
    .refine(val => ALL_HAZARD_TYPES.includes(val), 'Invalid hazard type selected'),

  // latitude and longitude are required — must be a number (not undefined).
  // Use optional() so Zod accepts the field being present-but-undefined, then
  // the refine() rejects the undefined case with the correct user-facing message.
  latitude: z.number().optional().refine(
    (val): val is number => typeof val === 'number',
    'Please select the hazard location on the map (click the map or use "Use My Current Location")'
  ),
  longitude: z.number().optional().refine(
    (val): val is number => typeof val === 'number',
    'Please select the hazard location on the map (click the map or use "Use My Current Location")'
  ),

  description: z.string()
    .min(1, 'Description is required')
    .min(20, 'Description must be at least 20 characters')
    .max(descriptionMax, `Description must be ${descriptionMax} characters or less`),

  name: z.string()
    .min(1, 'Name is required')
    .max(nameMax, `Name must be ${nameMax} characters or less`)
    .min(2, 'Name must be at least 2 characters'),

  contactNumber: z.string()
    .min(1, 'Contact number is required')
    .refine(
      isValidPhilippinePhoneNumber,
      'Please enter a valid Philippine phone number (e.g., 09123456789, +63 912 345 6789)'
    ),
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const CitizenReportForm: React.FC = () => {
  const navigate = useNavigate();
  // const turnstileRef = useRef<TurnstileInstance | null>(null); // TEMPORARILY DISABLED
  // const [turnstileToken, setTurnstileToken] = useState<string | null>(null); // TEMPORARILY DISABLED
  
  // Form state
  const [formData, setFormData] = useState<FormData>({
    hazardType: '',
    description: '',
    name: '',
    contactNumber: '',
    latitude: undefined,
    longitude: undefined,
    image: undefined,
    imageMetadata: undefined,
    website: '', // Honeypot
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** When set, user is rate-limited until this timestamp (ms). Drives live countdown. */
  const [rateLimitRetryAt, setRateLimitRetryAt] = useState<number | null>(null);

  // Restore cooldown from localStorage on mount (e.g. user submitted, went to confirmation, then "Submit Another Report")
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COOLDOWN_STORAGE_KEY);
      if (!stored) return;
      const retryAt = Number(stored);
      if (!Number.isFinite(retryAt) || retryAt <= Date.now()) {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
        return;
      }
      setRateLimitRetryAt(retryAt);
    } catch {
      localStorage.removeItem(COOLDOWN_STORAGE_KEY);
    }
  }, []);

  // Character counts
  const descriptionLength = formData.description.length;

  // Live countdown when rate-limited (updates every second)
  useEffect(() => {
    if (rateLimitRetryAt == null) return;
    const formatRemaining = (sec: number): string => {
      if (sec <= 0) return '0 sec';
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      if (min > 0) return `${min} min ${s} sec`;
      return `${s} sec`;
    };
    const tick = () => {
      const remaining = Math.ceil((rateLimitRetryAt - Date.now()) / 1000);
      if (remaining <= 0) {
        setRateLimitRetryAt(null);
        setErrors(prev => ({ ...prev, submit: undefined }));
        try {
          localStorage.removeItem(COOLDOWN_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      setErrors(prev => ({
        ...prev,
        submit: `Too many report submissions. You can submit again in ${formatRemaining(remaining)}.`,
      }));
    };
    tick(); // run immediately
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [rateLimitRetryAt]);

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateForm = (): boolean => {
    const result = CitizenReportSchema.safeParse(formData);
    if (result.success) {
      setErrors({});
      return true;
    }

    // Map the first Zod issue per field path into the FormErrors shape.
    // latitude and longitude both funnel into the single `location` error key.
    const newErrors: FormErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if ((field === 'latitude' || field === 'longitude') && !newErrors.location) {
        newErrors.location = issue.message;
      } else if (field === 'hazardType' && !newErrors.hazardType) {
        newErrors.hazardType = issue.message;
      } else if (field === 'description' && !newErrors.description) {
        newErrors.description = issue.message;
      } else if (field === 'name' && !newErrors.name) {
        newErrors.name = issue.message;
      } else if (field === 'contactNumber' && !newErrors.contactNumber) {
        newErrors.contactNumber = issue.message;
      }
    }

    setErrors(newErrors);
    return false;
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleImageUpload = useCallback((file: File | undefined, metadata?: { timestamp?: string; device?: string }) => {
    setFormData(prev => ({
      ...prev,
      image: file,
      imageMetadata: metadata,
    }));

    // If image has GPS coordinates, auto-populate location
    // This will be handled in ImageUpload component callback
  }, []);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setFormData(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }));
    setErrors(prev => ({ ...prev, location: undefined }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check honeypot (should be empty)
    if (formData.website) {
      console.log('Bot detected via honeypot');
      return;
    }

    // Validate form
    if (!validateForm()) {
      return;
    }

    // // Check Turnstile token - TEMPORARILY DISABLED
    // if (!turnstileToken) {
    //   setErrors(prev => ({ ...prev, captcha: 'Please complete the security verification' }));
    //   return;
    // }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Backend handles image upload to Supabase Storage
      // Submit form to backend using FormData (backend expects multipart/form-data)

      // Guard (TypeScript can't infer validation guarantees these exist)
      if (formData.latitude == null || formData.longitude == null) {
        setErrors(prev => ({ ...prev, location: 'Location is required' }));
        setIsSubmitting(false);
        return;
      }

      const sanitizedName = DOMPurify.sanitize(formData.name.trim());
      const sanitizedDescription = DOMPurify.sanitize(formData.description.trim());

      const formDataPayload = new FormData();
      formDataPayload.append('hazard_type', formData.hazardType);
      formDataPayload.append('description', sanitizedDescription);
      formDataPayload.append('name', sanitizedName);
      formDataPayload.append('contact_number', formData.contactNumber.trim());
      formDataPayload.append('latitude', formData.latitude.toString());
      formDataPayload.append('longitude', formData.longitude.toString());
      
      // CAPTCHA token - temporarily disabled, backend accepts null
      // if (turnstileToken) {
      //   formDataPayload.append('captcha_token', turnstileToken);
      // }
      
      // Add image if uploaded (NOT imageUrl - backend handles upload)
      if (formData.image) {
        formDataPayload.append('image', formData.image);
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/citizen-reports/submit`, {
        method: 'POST',
        // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
        body: formDataPayload,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail;
        if (response.status === 429) {
          const retryAfter = typeof detail === 'object' && detail?.retry_after != null
            ? Number(detail.retry_after)
            : SUBMISSION_COOLDOWN_SECONDS;
          const retryAt = Date.now() + retryAfter * 1000;
          setRateLimitRetryAt(retryAt);
          try {
            localStorage.setItem(COOLDOWN_STORAGE_KEY, String(retryAt));
          } catch {
            /* ignore */
          }
          setErrors(prev => ({
            ...prev,
            submit: `Too many report submissions. You can submit again in ${retryAfter} sec.`,
          }));
          setIsSubmitting(false);
          return;
        }
        throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Failed to submit report');
      }

      const result = await response.json();

      // Start cooldown timer immediately on successful submit (so it's active when user returns via "Submit Another Report")
      const retryAt = Date.now() + SUBMISSION_COOLDOWN_SECONDS * 1000;
      setRateLimitRetryAt(retryAt);
      try {
        localStorage.setItem(COOLDOWN_STORAGE_KEY, String(retryAt));
      } catch {
        /* ignore */
      }

      // // Reset Turnstile for potential resubmission - TEMPORARILY DISABLED
      // turnstileRef.current?.reset();
      // setTurnstileToken(null);
      
      // Navigate to confirmation page with tracking ID
      navigate(`/report/confirmation/${result.tracking_id}`, {
        state: { trackingId: result.tracking_id }
      });

    } catch (error) {
      console.error('Submission failed:', error);
      // // Reset Turnstile on error for retry - TEMPORARILY DISABLED
      // turnstileRef.current?.reset();
      // setTurnstileToken(null);
      setErrors(prev => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Failed to submit report. Please try again.',
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#F0F4F8] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Back Navigation */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Report a Hazard
          </h1>
          <p className="text-gray-600">
            Help your community by reporting environmental hazards you&apos;ve witnessed.
            All reports are reviewed by local authorities.
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-lg shadow-md p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Hazard Type Select */}
            <div>
              <label htmlFor="hazard-type" className="block text-sm font-medium text-gray-700 mb-2">
                Hazard Type <span className="text-red-500">*</span>
              </label>
              
              {/* Custom styled hazard type buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {ALL_HAZARD_TYPES.map((type) => {
                  const config = HAZARD_ICON_REGISTRY[type as keyof typeof HAZARD_ICON_REGISTRY];
                  const isSelected = formData.hazardType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleInputChange('hazardType', type)}
                      disabled={isSubmitting}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      aria-pressed={isSelected}
                    >
                      <div 
                        className="p-1.5 rounded-md"
                        style={{ 
                          backgroundColor: config?.bgColor || 'rgba(100, 116, 139, 0.15)',
                          color: config?.color || '#64748b'
                        }}
                      >
                        <HazardIcon hazardType={type} size={16} useHazardColor />
                      </div>
                      <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                        {config?.label || type.replace(/_/g, ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              {errors.hazardType && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.hazardType}
                </p>
              )}
            </div>

            {/* Name Input */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                maxLength={nameMax}
                placeholder="Enter your full name"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              <div className="mt-1 flex justify-between items-center">
                {errors.name ? (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle size={14} />
                    {errors.name}
                  </p>
                ) : (
                  <span className="text-sm text-gray-500">
                    {formData.name.length}/{nameMax}
                  </span>
                )}
              </div>
            </div>

            {/* Contact Number Input */}
            <div>
              <label htmlFor="contact-number" className="block text-sm font-medium text-gray-700 mb-2">
                Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-number"
                type="tel"
                value={formData.contactNumber}
                onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                placeholder="e.g., 09123456789 or +63 912 345 6789"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.contactNumber ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {errors.contactNumber && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.contactNumber}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Philippine mobile or landline number (e.g., 09123456789, +63 912 345 6789, (02) 123-4567)
              </p>
            </div>

            {/* Description Textarea */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                maxLength={descriptionMax}
                rows={5}
                placeholder="Please describe what you observed, when it happened, and any immediate dangers..."
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              <div className="mt-1 flex justify-between items-center">
                {errors.description ? (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle size={14} />
                    {errors.description}
                  </p>
                ) : (
                  <span className="text-sm text-gray-500">
                    Minimum 20 characters
                  </span>
                )}
                <span className={`text-sm ${
                  descriptionLength > descriptionMax ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {descriptionLength}/{descriptionMax}
                </span>
              </div>
            </div>

            {/* Image Upload Component */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Photo Evidence (Optional)
              </label>
              <ImageUpload
                onFileSelect={handleImageUpload}
                disabled={isSubmitting}
              />
              <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                <ImageIcon size={12} />
                Max 5MB. JPEG or PNG format. GPS coordinates will be extracted if available.
              </p>
            </div>

            {/* Location Picker (Required) - Pin on map or use GPS */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hazard Location <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-gray-500 mb-2">
                Click on the map to place a marker, drag to adjust, or use &quot;Use My Current Location&quot; for GPS.
              </p>
              {errors.location && (
                <p className="mb-2 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.location}
                </p>
              )}
              <div className={`border rounded-lg overflow-hidden ${errors.location ? 'ring-2 ring-red-200' : ''}`}>
                <React.Suspense fallback={
                  <div className="h-[300px] flex items-center justify-center bg-slate-50 rounded-lg">
                    <div className="w-6 h-6 rounded-full border-3 border-[#0A2A4D] border-t-transparent animate-spin" />
                  </div>
                }>
                  <LocationPicker
                    initialLat={formData.latitude}
                    initialLng={formData.longitude}
                    onLocationSelect={handleLocationSelect}
                    autoLocateOnMount
                  />
                </React.Suspense>
              </div>
            </div>

            {/* Honeypot Field (Hidden) */}
            <input
              type="text"
              name="website"
              value={formData.website}
              onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              style={{ position: 'absolute', left: '-9999px' }}
              tabIndex={-1}
              autoComplete="off"
            />

            {/* Cloudflare Turnstile - TEMPORARILY DISABLED */}
            {/* <div className="flex justify-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={process.env.REACT_APP_TURNSTILE_SITE_KEY || ''}
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setErrors(prev => ({ ...prev, captcha: undefined }));
                }}
                onError={() => {
                  setTurnstileToken(null);
                  setErrors(prev => ({ ...prev, captcha: 'Security verification failed. Please try again.' }));
                }}
                onExpire={() => {
                  setTurnstileToken(null);
                  setErrors(prev => ({ ...prev, captcha: 'Security verification expired. Please refresh.' }));
                }}
              />
            </div> */}

            {/* Submit Error */}
            {(errors.submit) && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {errors.submit}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || rateLimitRetryAt != null}
                className="flex items-center gap-2 px-6 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2" role="status" aria-live="polite">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    <span>Submitting...</span>
                  </span>
                ) : (
                  <>
                    <Send size={16} aria-hidden="true" />
                    Submit Report
                  </>
                )}
              </button>
            </div>

            {/* Privacy Notice */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Your report will be reviewed by local authorities. This form collects personal
                information (name and contact number) solely for follow-up purposes by the
                responding authorities. Your data is handled in accordance with our{' '}
                <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CitizenReportForm;
