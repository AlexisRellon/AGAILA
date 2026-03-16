/**
 * Login Page (AUTH-01)
 * 
 * Allows users to authenticate with email and password via Supabase Auth.
 * Redirects to dashboard on successful login.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile'; // TEMPORARILY DISABLED
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { landingAssets } from '../constants/landingAssets';

/**
 * Renders the stakeholder login page with email/password inputs, password visibility toggle, error display, and branding.
 *
 * The component redirects to '/dashboard' when a user is already authenticated and navigates to '/dashboard' after a successful sign-in. On login failure it clears the password and surfaces a user-friendly error message.
 *
 * @returns The React element for the login page containing the brand panel and the login form UI.
 */
export default function Login() {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  // const turnstileRef = useRef<TurnstileInstance>(null); // TEMPORARILY DISABLED

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // const [turnstileToken, setTurnstileToken] = useState<string | null>(null); // TEMPORARILY DISABLED
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // // Validate Turnstile token - TEMPORARILY DISABLED
    // if (!turnstileToken) {
    //   setError('Please complete the security verification.');
    //   return;
    // }

    setLoading(true);

    try {
      await signIn(email, password, undefined); // CAPTCHA DISABLED
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      
      // User-friendly error messages
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Please verify your email address before logging in.');
      } else if (errorMessage.includes('captcha')) {
        setError('Security verification failed. Please try again.');
      } else {
        setError('Unable to connect. Please try again.');
      }
      
      // Clear password for security
      setPassword('');
      // setTurnstileToken(null); // TEMPORARILY DISABLED
      // turnstileRef.current?.reset(); // TEMPORARILY DISABLED
    } finally {
      setLoading(false);
    }
  };

  // // Turnstile handlers - TEMPORARILY DISABLED
  // const handleTurnstileSuccess = (token: string) => {
  //   setTurnstileToken(token);
  //   setError(null);
  // };

  // const handleTurnstileError = () => {
  //   setTurnstileToken(null);
  //   setError('Security verification failed. Please refresh the page.');
  // };

  // const handleTurnstileExpire = () => {
  //   setTurnstileToken(null);
  //   setError('Security verification expired. Please try again.');
  // };

  return (
    <div className="min-h-screen flex">
      {/* ── Brand Panel (desktop left column) ── */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[460px] flex-shrink-0 auth-brand-panel flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Orange accent strip */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#FF7A00]" />

        <div className="relative z-10 flex flex-col items-center text-center gap-8">
          <img
            src={landingAssets.logos.gaiaWhite}
            alt="GAIA Logo"
            className="w-44 h-auto"
          />

          <div className="space-y-3">
            <h2 className="text-2xl font-lato font-bold text-white leading-snug">
              Geospatial AI-driven<br />Assessment
            </h2>
            <p className="text-sm text-blue-200 leading-relaxed max-w-[260px]">
              Real-time environmental hazard intelligence for disaster risk reduction across the Philippines.
            </p>
          </div>

          <div className="w-10 h-0.5 bg-[#FF7A00] rounded-full" />

          <p className="text-[11px] font-medium text-blue-300 uppercase tracking-[0.15em]">
            Authorized Personnel Only
          </p>
        </div>
      </div>

      {/* ── Form Panel (right / full on mobile) ── */}
      <div className="flex-1 flex items-center justify-center bg-auth px-4 py-12 min-h-screen">
        <div className="w-full max-w-md">

          {/* Mobile-only logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img
              src={landingAssets.logo.gaia}
              alt="GAIA Logo"
              className="h-14 w-auto"
            />
          </div>

          {/* Form Card */}
          <Card className="p-8 space-y-6 shadow-lg bg-white rounded-xl border border-slate-200 border-t-[3px] border-t-[#0A2A4D]">

            {/* Heading */}
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-[#0A2A4D]">
                Stakeholder Login
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access the dashboard
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </Alert>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-10"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005A9C] rounded transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div className="flex justify-end -mt-1">
                <Link
                  to="/reset-password"
                  className="text-xs text-[#005A9C] hover:text-[#0A2A4D] hover:underline transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-[#0A2A4D] hover:bg-[#0A2A4D]/90 text-white font-medium"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2" role="status" aria-live="polite">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                    <span>Logging in…</span>
                  </span>
                ) : (
                  'Login'
                )}
              </Button>
            </form>

            {/* Cloudflare Turnstile - TEMPORARILY DISABLED */}
            {/* <div className="flex justify-center">
              <Turnstile ref={turnstileRef} ... />
            </div> */}

            {/* Footer links */}
            <div className="pt-2 border-t border-slate-100 space-y-3 text-center">
              <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-[#0A2A4D] transition-colors">
                ← Back to Home
              </Link>
              <p className="text-xs text-muted-foreground">
                Account registration is managed by administrators.
                <br />
                Contact your organization&apos;s admin for access.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
