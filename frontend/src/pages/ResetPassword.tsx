import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { landingAssets } from '../constants/landingAssets';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '../components/ui/input-otp';
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowLeft,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

type Step = 'email' | 'code' | 'password';

const RESEND_COOLDOWN_SECONDS = 60;

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      setStep('code');
      startResendCooldown();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send reset code';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      startResendCooldown();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to resend code';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (otpCode.length !== 6) {
      setError('Please enter the full 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'recovery',
      });

      if (error) throw error;

      setStep('password');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Invalid or expired code';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
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
        password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 3000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update password';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const stepIndicator = (
    <div className="flex items-center justify-center gap-2 mb-2">
      {(['email', 'code', 'password'] as Step[]).map((s, i) => (
        <React.Fragment key={s}>
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-colors ${
              step === s
                ? 'bg-primary text-primary-foreground'
                : (['email', 'code', 'password'].indexOf(step) > i)
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {(['email', 'code', 'password'].indexOf(step) > i) ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              i + 1
            )}
          </div>
          {i < 2 && (
            <div
              className={`h-0.5 w-8 transition-colors ${
                (['email', 'code', 'password'].indexOf(step) > i)
                  ? 'bg-green-500'
                  : 'bg-muted'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-auth px-4">
        <Card className="w-full max-w-md p-8 space-y-6 shadow-lg bg-white rounded-xl border border-slate-200 border-t-[3px] border-t-green-500">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
                <ShieldCheck className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-primary">
                Password Updated!
              </h1>
              <p className="text-sm text-muted-foreground">
                Your password has been successfully changed. Redirecting to
                login…
              </p>
            </div>
          </div>
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <div className="ml-2">
              <p className="text-sm text-green-700">
                You can now log in with your new password.
              </p>
            </div>
          </Alert>
          <div className="text-center">
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate('/login');
              }}
              className="text-sm text-secondary hover:text-primary hover:underline font-medium transition-colors"
            >
              Go to Login now
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-auth px-4 py-12">
      <div className="w-full max-w-md">
        <Card className="p-8 space-y-6 shadow-lg bg-white rounded-xl border border-slate-200 border-t-[3px] border-t-primary">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src={landingAssets.logo.gaia}
              alt="GAIA Logo"
              className="h-16 w-auto"
            />
          </div>
          {stepIndicator}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <div className="ml-2 text-sm text-red-800">{error}</div>
          </Alert>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">

              </div>
              <h1 className="text-2xl font-bold tracking-tight text-primary">
                Forgot Password?
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a 6-digit code to reset your
                password
              </p>
            </div>

            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="pl-10"
                    required
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending Code...' : 'Send Reset Code'}
              </Button>
            </form>
          </>
        )}

        {/* Step 2: OTP Code Verification */}
        {step === 'code' && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">

              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Enter Verification Code
              </h1>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to{' '}
                <strong className="text-foreground">{email}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <span className="text-muted-foreground px-1">-</span>
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || otpCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </Button>
            </form>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Didn&apos;t receive the code? Check your spam folder.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                className="text-sm"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend Code'}
              </Button>
            </div>

            <div className="text-center">
              <button
                onClick={() => {
                  setStep('email');
                  setOtpCode('');
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="h-3 w-3" />
                Use a different email
              </button>
            </div>
          </>
        )}

        {/* Step 3: New Password */}
        {step === 'password' && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                  <Lock className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Set New Password
              </h1>
              <p className="text-sm text-muted-foreground">
                Choose a strong password for your account
              </p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
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
                    placeholder="Enter new password"
                    className="pl-10 pr-10"
                    required
                    disabled={loading}
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium"
                >
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
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded-md">
                <p className="font-medium">Password requirements:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li
                    className={
                      password.length >= 8 ? 'text-green-600' : ''
                    }
                  >
                    At least 8 characters long
                  </li>
                  <li
                    className={
                      password &&
                      confirmPassword &&
                      password === confirmPassword
                        ? 'text-green-600'
                        : ''
                    }
                  >
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

        {/* Back to Login */}
        <div className="text-center">
          <button
            onClick={async () => {
              // Sign out user if authenticated (step 3) to prevent auto-redirect to dashboard
              if (step === 'password') {
                await supabase.auth.signOut();
              }
              navigate('/login');
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Login
          </button>
        </div>
      </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
