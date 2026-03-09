import React from 'react';

export const CTASection: React.FC = () => {
  return (
    <div className="box-border flex flex-col gap-6 items-center justify-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 w-full max-w-screen-xl mx-auto">
      <div className="box-border flex flex-col gap-3 items-center justify-center px-[20px] py-0 text-center text-[#334155]">
        <h2 className="flex flex-col font-lato font-extrabold justify-center text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2]">
          Get Actionable Hazard Intelligence
        </h2>
        <p className="flex flex-col font-lato justify-center max-w-[720px] text-[14px] sm:text-[16px] leading-[24px]">
          Equip your response team with the AI-driven insights needed to act faster and protect your community. Get started with AGAILA today.
        </p>
      </div>

      <div className="flex flex-wrap gap-[12px] sm:gap-[16px] items-end justify-center w-full">
        <a
          href="/map"
          className="bg-[#0a2a4d] text-white hover:bg-[#0a2a4d]/90 px-[16px] py-[8px] text-[14px] font-lato font-medium rounded-[6px] transition-colors"
        >
          View Live Map
        </a>
        <a
          href="/login"
          className="border border-[#005a9c] border-solid text-[#005a9c] hover:bg-[#005a9c] hover:text-white px-[16px] py-[8px] text-[14px] font-lato font-medium rounded-[6px] transition-colors"
        >
          Login
        </a>
      </div>
    </div>
  );
};
