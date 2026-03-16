/**
 * Register Page (AUTH-02)
 *
 * Allows users to create new accounts with email and password.
 * Auto-logs in and redirects to dashboard on successful registration.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { landingAssets } from '../constants/landingAssets';

/**
 * Render the registration page allowing users to create an account with email and password.
 *
 * The component displays a responsive two-panel layout with brand content (desktop) and a card-based
 * registration form (mobile and desktop). It validates password match and minimum length, shows a
 * password strength indicator, maps common backend errors to user-friendly messages, auto-signs the
 * user in on successful registration, and navigates to the dashboard.
 *
 * @returns The JSX element for the registration page with form, validation, error alert, strength indicator, and footer links.
 */
export default function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Validate password length (Supabase default minimum is 6)
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password);
      navigate('/dashboard');
    } catch (err) {
      console.error('Registration error:', err);
      
      // User-friendly error messages
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('already registered')) {
        setError('This email is already registered. Please log in instead.');
      } else if (errorMessage.includes('Invalid email')) {
        setError('Please enter a valid email address.');
      } else if (errorMessage.includes('Password should be')) {
        setError('Password must be at least 6 characters long.');
      } else {
        setError('Unable to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate password strength
  const getPasswordStrength = (pwd: string): { label: string; color: string; width: string } => {
    if (pwd.length === 0) return { label: '', color: '', width: '0%' };
    if (pwd.length < 6) return { label: 'Too short', color: 'bg-red-500', width: '25%' };
    if (pwd.length < 8) return { label: 'Weak', color: 'bg-orange-500', width: '50%' };
    if (pwd.length < 12) return { label: 'Medium', color: 'bg-yellow-500', width: '75%' };
    return { label: 'Strong', color: 'bg-green-500', width: '100%' };
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <div className="min-h-screen flex">
      {/* ── Brand Panel (desktop left column) ── */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[460px] flex-shrink-0 auth-brand-panel flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#FF7A00]" />

        <div className="relative z-10 flex flex-col items-center text-center gap-8">
          <img
            src={landingAssets.logos.gaiaWhite}
            alt="GAIA Logo"
            className="w-44 h-auto"
          />

          <div className="space-y-3">
            <h2 className="text-2xl font-lato font-bold text-white leading-snug">
              Join the GAIA<br />Network
            </h2>
            <p className="text-sm text-blue-200 leading-relaxed max-w-[260px]">
              Create your account to start monitoring environmental hazards across the Philippines in real-time.
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

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-[#0A2A4D]">
                Create Account
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign up to start monitoring environmental hazards
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </Alert>
            )}

            {/* Registration Form */}
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
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-10"
                />
                {/* Password Strength Indicator */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${passwordStrength.color}`}
                        style={{ width: passwordStrength.width }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strength: <span className="font-medium">{passwordStrength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                  Confirm Password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-10"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-[#0A2A4D] hover:bg-[#0A2A4D]/90 text-white font-medium"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2" role="status" aria-live="polite">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                    <span>Creating account…</span>
                  </span>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            {/* Footer links */}
            <div className="pt-2 border-t border-slate-100 space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-[#005A9C] hover:text-[#0A2A4D] hover:underline font-medium transition-colors">
                  Log In
                </Link>
              </p>
              <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-[#0A2A4D] transition-colors">
                ← Back to Home
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
