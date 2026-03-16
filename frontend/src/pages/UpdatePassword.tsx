import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { landingAssets } from '../constants/landingAssets';
import { Lock, CheckCircle2, AlertTriangle, Eye, EyeOff, ArrowLeft } from 'lucide-react';

const UpdatePassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (!session) {
          navigate('/reset-password');
          return;
        }
        
        setValidatingToken(false);
      } catch {
        navigate('/reset-password');
      }
    };

    checkSession();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update password';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-auth px-4">
        <Card className="w-full max-w-md p-8 shadow-lg border border-slate-200 rounded-xl">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Validating reset link…</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-auth px-4 py-12">
      <div className="w-full max-w-md">
      <Card className="p-8 space-y-6 shadow-lg bg-white rounded-xl border border-slate-200 border-t-[3px] border-t-primary">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src={landingAssets.logo.gaia}
              alt="GAIA Logo"
              className="h-14 w-auto"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Set New Password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your new password below
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4">
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <div className="ml-2">
                <h3 className="text-sm font-medium text-green-800">Password updated successfully!</h3>
                <p className="text-sm text-green-700 mt-1">
                  Redirecting you to login page...
                </p>
              </div>
            </Alert>
            <div className="text-center">
              <Link to="/login" className="text-sm text-primary hover:underline font-medium">
                Go to Login now
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <div className="ml-2 text-sm text-red-800">{error}</div>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    className="pl-10 pr-10"
                    required
                    disabled={loading}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="pl-10 pr-10"
                    required
                    disabled={loading}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded-md">
                <p className="font-medium">Password requirements:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li className={password.length >= 8 ? 'text-green-600' : ''}>
                    At least 8 characters long
                  </li>
                  <li className={password && confirmPassword && password === confirmPassword ? 'text-green-600' : ''}>
                    Both passwords must match
                  </li>
                </ul>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Updating Password...' : 'Update Password'}
              </Button>
            </form>
          </>
        )}

        <div className="text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Login
          </Link>
        </div>
      </Card>
      </div>
    </div>
  );
};

export default UpdatePassword;
