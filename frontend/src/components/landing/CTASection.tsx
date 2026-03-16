import React from 'react';
import { Link } from 'react-router-dom';

export const CTASection: React.FC = () => {
  return (
    <section className="w-full bg-slate-50 border-y border-slate-200" aria-labelledby="cta-heading">
      <div className="box-border flex flex-col gap-6 items-center justify-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 sm:py-20 w-full max-w-screen-xl mx-auto">
        {/* Orange accent line */}
        <div className="w-12 h-1 bg-accent rounded-full" />

        <div className="box-border flex flex-col gap-3 items-center justify-center px-[20px] py-0 text-center text-slate-700">
          <h2 id="cta-heading" className="flex flex-col font-lato font-extrabold justify-center text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2]">
            Get Actionable Hazard Intelligence
          </h2>
          <p className="flex flex-col font-lato justify-center max-w-[600px] text-[14px] sm:text-[16px] leading-[24px] text-black/60">
            Equip your response team with the AI-driven insights needed to act faster and protect your community. Get started with GAIA today.
          </p>
        </div>

        <div className="flex flex-wrap gap-[12px] sm:gap-[16px] items-center justify-center w-full">
          <Link
            to="/map"
            aria-label="View Live Map"
            className="bg-primary text-white hover:bg-primary/90 px-[20px] py-[10px] text-[14px] sm:text-[15px] font-lato font-semibold rounded-[8px] transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            View Live Map
          </Link>
          <Link
            to="/login"
            aria-label="Login to Dashboard"
            className="border border-secondary border-solid text-secondary hover:bg-secondary hover:text-white px-[20px] py-[10px] text-[14px] sm:text-[15px] font-lato font-semibold rounded-[8px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            Login to Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
};
