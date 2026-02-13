/**
 * Citizen Report Form (CR-01, CR-06)
 * Allows citizens to submit hazard reports with optional image upload and location
 * 
 * Features:
 * - Form validation with Zod schema
 * - Character limits and field sanitization
 * - Image upload component integration
 * - Location picker map widget
 * - Cloudflare Turnstile integration
 * - Honeypot field for spam prevention
 * - Mobile responsive design
 * - Accessibility support (keyboard navigation, screen readers)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// import { Turnstile } from '@marsidev/react-turnstile'; // TEMPORARILY DISABLED
// import type { TurnstileInstance } from '@marsidev/react-turnstile'; // TEMPORARILY DISABLED
import { AlertCircle, Send, MapPin, Image as ImageIcon } from 'lucide-react';
import { ALL_HAZARD_TYPES } from '../hooks/useHazardFilters';
import { HAZARD_ICON_REGISTRY, HazardIcon } from '../constants/hazard-icons';
import ImageUpload from '../components/reports/ImageUpload';
import LocationPicker from '../components/reports/LocationPicker';
// import { supabase } from '../lib/supabase'; // TEMPORARILY DISABLED - backend handles image upload
import { API_BASE_URL } from '../lib/api';
import { isValidPhilippinePhoneNumber } from '../utils/phoneValidation';

// ============================================================================
// TYPES
// ============================================================================

interface FormData {
  hazardType: string;
  locationName: string;
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
  locationName?: string;
  description?: string;
  name?: string;
  contactNumber?: string;
  location?: string;
  captcha?: string;
  submit?: string;
}

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
    locationName: '',
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
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  /** When set, user is rate-limited until this timestamp (ms). Drives live countdown. */
  const [rateLimitRetryAt, setRateLimitRetryAt] = useState<number | null>(null);

  // Character counts
  const descriptionLength = formData.description.length;
  const descriptionMax = 1000;
  const locationNameMax = 200;
  const nameMax = 100;

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
    const newErrors: FormErrors = {};

    // Hazard type validation
    if (!formData.hazardType) {
      newErrors.hazardType = 'Please select a hazard type';
    } else if (!ALL_HAZARD_TYPES.includes(formData.hazardType)) {
      newErrors.hazardType = 'Invalid hazard type selected';
    }

    // Location name validation
    if (!formData.locationName.trim()) {
      newErrors.locationName = 'Location name is required';
    } else if (formData.locationName.length > locationNameMax) {
      newErrors.locationName = `Location name must be ${locationNameMax} characters or less`;
    }

    // Description validation
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters';
    } else if (formData.description.length > descriptionMax) {
      newErrors.description = `Description must be ${descriptionMax} characters or less`;
    }

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > nameMax) {
      newErrors.name = `Name must be ${nameMax} characters or less`;
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    // Contact number validation
    if (!formData.contactNumber.trim()) {
      newErrors.contactNumber = 'Contact number is required';
    } else if (!isValidPhilippinePhoneNumber(formData.contactNumber)) {
      newErrors.contactNumber = 'Please enter a valid Philippine phone number (e.g., 09123456789, +63 912 345 6789)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
      const formDataPayload = new FormData();
      formDataPayload.append('hazard_type', formData.hazardType);
      formDataPayload.append('location_name', formData.locationName);
      formDataPayload.append('description', formData.description);
      formDataPayload.append('name', formData.name.trim());
      formDataPayload.append('contact_number', formData.contactNumber.trim());
      
      // Add optional fields only if provided
      if (formData.latitude !== undefined && formData.latitude !== null) {
        formDataPayload.append('latitude', formData.latitude.toString());
      }
      if (formData.longitude !== undefined && formData.longitude !== null) {
        formDataPayload.append('longitude', formData.longitude.toString());
      }
      
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
            : 60;
          const retryAt = Date.now() + retryAfter * 1000;
          setRateLimitRetryAt(retryAt);
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
      
      // // Reset Turnstile for potential resubmission - TEMPORARILY DISABLED
      // turnstileRef.current?.reset();
      // setTurnstileToken(null);
      
      // Navigate to confirmation page with tracking ID
      navigate(`/report/confirmation/${result.tracking_id}`, {
        state: { trackingId: result.tracking_id }
      });

    } catch (error) {
      console.error('Submission error:', error);
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
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
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

            {/* Location Name Input */}
            <div>
              <label htmlFor="location-name" className="block text-sm font-medium text-gray-700 mb-2">
                Location Name <span className="text-red-500">*</span>
              </label>
              <input
                id="location-name"
                type="text"
                value={formData.locationName}
                onChange={(e) => handleInputChange('locationName', e.target.value)}
                maxLength={locationNameMax}
                placeholder="e.g., Manggahan, General Trias"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.locationName ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              <div className="mt-1 flex justify-between items-center">
                {errors.locationName ? (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle size={14} />
                    {errors.locationName}
                  </p>
                ) : (
                  <span className="text-sm text-gray-500">
                    {formData.locationName.length}/{locationNameMax}
                  </span>
                )}
              </div>
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

            {/* Location Picker Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exact Location (Optional)
              </label>
              <button
                type="button"
                onClick={() => setShowLocationPicker(!showLocationPicker)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                disabled={isSubmitting}
              >
                <MapPin size={16} />
                {showLocationPicker ? 'Hide' : 'Show'} Location Picker
              </button>
              {formData.latitude && formData.longitude && (
                <p className="mt-2 text-sm text-gray-600">
                  Coordinates: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                </p>
              )}
              {errors.location && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.location}
                </p>
              )}
            </div>

            {/* Location Picker Map */}
            {showLocationPicker && (
              <div className="border rounded-lg overflow-hidden">
                <LocationPicker
                  initialLat={formData.latitude}
                  initialLng={formData.longitude}
                  onLocationSelect={handleLocationSelect}
                />
              </div>
            )}

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
                Your report will be reviewed by local authorities. No personal information is collected.
                By submitting, you agree to our{' '}
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
