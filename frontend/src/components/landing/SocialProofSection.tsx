import React from 'react';

export const SocialProofSection: React.FC = () => {
  return (
    <div className="bg-[#0a2a4d] box-border flex flex-col gap-4 items-center justify-center overflow-visible px-4 sm:px-6 lg:px-16 py-12 sm:py-16 w-full mx-auto">
      <div className="box-border flex flex-col gap-2 items-center justify-center px-[20px] py-0 text-[#f0f4f8] text-center">
        <h2 className="flex flex-col font-lato font-extrabold justify-center text-[26px] sm:text-[32px] md:text-[36px] leading-[1.2]">
          A Tool Built for Responders
        </h2>
        <p className="flex flex-col font-lato justify-center max-w-[760px] text-[14px] sm:text-[16px] leading-[24px]">
          AGAILA is designed to meet the critical needs of Local Government Units (LGUs) and Disaster Risk Reduction and Management Offices (DRRMOs) across the Philippines.
        </p>
      </div>
    </div>
  );
};
