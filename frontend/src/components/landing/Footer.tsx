import React from 'react';
import { Link } from 'react-router-dom';
import { landingAssets } from '../../constants/landingAssets';


export const Footer: React.FC = () => {
  const navigationLinks = [
    { label: 'Home', to: '/' },
    { label: 'Documentation', to: 'https://github.com/AlexisRellon/GAIA/blob/main/README.md' },
    { label: 'Hazard Map', to: '/map' },
    { label: 'Status', to: '/status' },
  ];

  const currentYear = new Date().getFullYear(); // Get the current four-digit year

  return (
    <footer className="w-full bg-[#171717]">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 overflow-visible py-10">
          {/* Column 1: Branding */}
          <div className="flex flex-col gap-[16px] items-start justify-center px-[10px]">
            <div className="flex flex-wrap gap-[10px] items-center justify-start w-full">
              <img 
                src={landingAssets.logos.gaiaWhite} 
                alt="GAIA Logo" 
                className="h-[40px] w-[100px] sm:h-[53px] sm:w-[133px]" 
              />
            <p className="font-lato font-bold text-[14px] sm:text-[16px] leading-[24px] text-white">
              Geospatial AI-driven Assessment
            </p>
          </div>
          
          <p className="font-lato text-[14px] sm:text-[16px] leading-[24px] text-white">
            An Undergraduate Thesis Project
          </p>
          
          <img 
            src={landingAssets.logos.lpuc} 
            alt="LPU-C Logo" 
            className="h-[56px] w-[140px] sm:h-[71px] sm:w-[168px] object-cover" 
          />
          
          <img 
            src={landingAssets.logos.astars} 
            alt="A-STARS Logo" 
            className="h-[44px] w-[46px] sm:h-[52px] sm:w-[55px]" 
          />
        </div>

        {/* Column 2: Navigation */}
        <div className="flex flex-col gap-[12px] items-start justify-center px-[10px] font-lato text-[14px] sm:text-[16px] leading-[24px] text-white">
          {navigationLinks.map(({ label, to }, index) => {
            const isExternal = to.startsWith('http');
            return isExternal ? (
              <a
                key={index}
                href={to}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#d9d9d9] transition-colors"
              >
                {label}
              </a>
            ) : (
              <Link
                key={index}
                to={to}
                className="hover:text-[#d9d9d9] transition-colors"
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Column 3: Contact */}
        <div className="flex flex-col gap-[12px] items-start justify-center px-[10px] font-lato text-[14px] sm:text-[16px] leading-[24px]">
          <p className="text-white">
            contact@gaia-assessment.com.ph
          </p>
          <p className="text-[#d9d9d9]">
            +63-998 7654 3210
          </p>
        </div>

        {/* Column 4: Description */}
        <div className="flex flex-col gap-[12px] items-start justify-center px-[10px]">
          <p className="font-lato text-[14px] sm:text-[16px] leading-[24px] text-white w-full">
            GAIA (Geospatial AI-driven Assessment) is an AI framework designed to provide real-time environmental hazard reporting by integrating zero-shot classification and Geo-NER.
          </p>
        </div>
      </div>


        {/* Copyright Bar */}
        <div className="border-t border-white py-5 flex items-center justify-center">
          <p className="font-lato text-[12px] sm:text-[13px] leading-[20px] text-white text-center">
            © {currentYear} AGAILA. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
