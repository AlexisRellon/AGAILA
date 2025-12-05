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
import { Eye, EyeOff } from 'lucide-react';
import { landingAssets } from '../constants/landingAssets';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        {/* Header with Logo */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src={landingAssets.logo.gaia} 
              alt="GAIA Logo" 
              className="h-16 w-auto"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Stakeholder Login</h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the dashboard
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="bg-red-50 border-red-200">
            <p className="text-sm text-red-800">{error}</p>
          </Alert>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
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
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded"
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2" role="status" aria-live="polite">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>
                <span>Logging in...</span>
              </span>
            ) : (
              'Login'
            )}
          </Button>
        </form>

        {/* Cloudflare Turnstile - TEMPORARILY DISABLED */}
        {/* <div className="flex justify-center">
          <Turnstile
            ref={turnstileRef}
            siteKey={process.env.REACT_APP_TURNSTILE_SITE_KEY || ''}
            onSuccess={handleTurnstileSuccess}
            onError={handleTurnstileError}
            onExpire={handleTurnstileExpire}
          />
        </div> */}

        {/* Forgot Password Link */}
        <div className="text-center">
          <Link 
            to="/reset-password" 
            className="text-sm text-primary hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        {/* Back to Home */}
        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
            ← Back to Home
          </Link>
        </div>

        {/* Admin Note */}
        <div className="pt-4 border-t">
          <p className="text-xs text-center text-muted-foreground">
            Account registration is managed by administrators.
            <br />
            Contact your organization&apos;s admin for access.
          </p>
        </div>
      </Card>
    </div>
  );
}
