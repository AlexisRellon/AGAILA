/**
 * Register Page (AUTH-02)
 *
 * Self-registration is disabled. Only administrators can create new accounts.
 * This page informs visitors and directs them to contact an administrator.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { landingAssets } from '../constants/landingAssets';

/**
 * Render the registration page informing users that self-registration is disabled.
 *
 * Only administrators can create accounts in this system. The page displays a
 * two-panel layout (desktop) or single-panel (mobile) with a clear message
 * directing users to contact their administrator.
 *
 * @returns The JSX element for the registration-disabled page.
 */
export default function Register() {
  return (
    <div className="min-h-screen flex">
      {/* ── Brand Panel (desktop left column) ── */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[460px] flex-shrink-0 auth-brand-panel flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-accent" />

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
              Account creation is managed by system administrators to ensure authorized access.
            </p>
          </div>

          <div className="w-10 h-0.5 bg-accent rounded-full" />

          <p className="text-[11px] font-medium text-blue-300 uppercase tracking-[0.15em]">
            Authorized Personnel Only
          </p>
        </div>
      </div>

      {/* ── Info Panel (right / full on mobile) ── */}
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

          {/* Info Card */}
          <Card className="p-8 space-y-6 shadow-lg bg-white rounded-xl border border-slate-200 border-t-[3px] border-t-primary">

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldAlert className="h-7 w-7 text-primary" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-primary">
                  Registration Restricted
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Self-registration is disabled for this system. Only administrators can create new accounts.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 w-full text-left space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Need an account?
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Please contact your system administrator or DRRMO office to request access to GAIA.
                </p>
              </div>
            </div>

            {/* Footer links */}
            <div className="pt-2 border-t border-slate-100 space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-secondary hover:text-primary hover:underline font-medium transition-colors">
                  Log In
                </Link>
              </p>
              <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-primary transition-colors">
                &larr; Back to Home
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
