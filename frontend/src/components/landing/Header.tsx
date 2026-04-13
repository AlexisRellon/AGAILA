import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { landingAssets } from '../../constants/landingAssets';

export const Header: React.FC = () => {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-[#f0f4f8] w-full flex items-center justify-center px-4 sm:px-6 lg:px-16 py-3 sm:py-4 shadow-sm">
      <div className="w-full max-w-screen-xl flex items-center justify-between gap-3">
        {/* Company Logo + Tagline */}
        <Link to="/" className="flex gap-[8px] items-center">
          <div className="w-[100px] h-[40px] sm:w-[133px] sm:h-[53px]">
            <img 
              src={landingAssets.logo.gaia} 
              alt="GAIA Logo" 
              className="w-full h-full"
            />
          </div>
          <p className="hidden sm:block font-lato font-extrabold max-w-[180px] text-[14px] sm:text-[16px] leading-[1.45] tracking-[-0.48px] text-[#005a9c] whitespace-pre-wrap">
            Geospatial AI-driven Assessment
          </p>
        </Link>

        {/* Navigation Buttons */}
        <nav className="flex items-center gap-3 sm:gap-[24px]">
          <Link
            to="/report"
            className="bg-[#FF7A00] text-white font-inter font-semibold text-[14px] sm:text-[16px] leading-[1.45] tracking-[-0.08px] px-[12px] sm:px-[16px] py-[8px] sm:py-[12px] rounded-[10px] sm:rounded-[12px] whitespace-nowrap transition-colors hover:bg-[#e96d00]"
          >
            Report a Hazard
          </Link>
          <Link
            to="/track"
            className="font-inter font-medium text-[14px] sm:text-[16px] leading-[1.45] tracking-[-0.08px] text-[#0a2a4d] whitespace-nowrap transition-colors hover:text-[#005a9c]"
          >
            Track Report
          </Link>
          <Link
            to="/map"
            className="font-inter font-medium text-[14px] sm:text-[16px] leading-[1.45] tracking-[-0.08px] text-[#0a2a4d] whitespace-nowrap transition-colors hover:text-[#005a9c]"
          >
            View Live Map
          </Link>
          {user ? (
            <Link
              to="/dashboard"
              className="bg-[#0a2a4d] text-white font-inter font-medium text-[14px] sm:text-[16px] leading-[1.45] tracking-[-0.08px] px-[12px] sm:px-[16px] py-[8px] sm:py-[12px] rounded-[10px] sm:rounded-[12px] whitespace-nowrap transition-colors hover:bg-[#0a2a4d]/90"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="bg-[#0a2a4d] text-white font-inter font-medium text-[14px] sm:text-[16px] leading-[1.45] tracking-[-0.08px] px-[12px] sm:px-[16px] py-[8px] sm:py-[12px] rounded-[10px] sm:rounded-[12px] whitespace-nowrap transition-colors hover:bg-[#0a2a4d]/90"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};