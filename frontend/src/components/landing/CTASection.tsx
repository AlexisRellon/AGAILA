import React from 'react';
import { Link } from 'react-router-dom';

export const CTASection: React.FC = () => {
  return (
    <div className="w-full bg-[#f8fafc] border-y border-slate-200">
      <div className="box-border flex flex-col gap-6 items-center justify-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 sm:py-20 w-full max-w-screen-xl mx-auto">
        {/* Orange accent line */}
        <div className="w-12 h-1 bg-[#FF7A00] rounded-full" />

        <div className="box-border flex flex-col gap-3 items-center justify-center px-[20px] py-0 text-center text-[#334155]">
          <h2 className="flex flex-col font-lato font-extrabold justify-center text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2]">
            Get Actionable Hazard Intelligence
          </h2>
          <p className="flex flex-col font-lato justify-center max-w-[600px] text-[14px] sm:text-[16px] leading-[24px] text-[rgba(0,0,0,0.6)]">
            Equip your response team with the AI-driven insights needed to act faster and protect your community. Get started with AGAILA today.
          </p>
        </div>

        <div className="flex flex-wrap gap-[12px] sm:gap-[16px] items-center justify-center w-full">
          <Link
            to="/map"
            className="bg-[#0a2a4d] text-white hover:bg-[#0a2a4d]/90 px-[20px] py-[10px] text-[14px] sm:text-[15px] font-lato font-semibold rounded-[8px] transition-colors shadow-sm"
          >
            View Live Map
          </Link>
          <Link
            to="/login"
            className="border border-[#005a9c] border-solid text-[#005a9c] hover:bg-[#005a9c] hover:text-white px-[20px] py-[10px] text-[14px] sm:text-[15px] font-lato font-semibold rounded-[8px] transition-colors"
          >
            Login to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};
