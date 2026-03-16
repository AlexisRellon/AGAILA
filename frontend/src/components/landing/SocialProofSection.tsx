import React from 'react';

interface HighlightItem {
  label: string;
  description: string;
}

export const SocialProofSection: React.FC = () => {
  const highlights: HighlightItem[] = [
    {
      label: 'Multi-Source Ingestion',
      description: 'Monitors RSS feeds from GMA News, Rappler, Inquirer, and more.',
    },
    {
      label: 'AI-Powered Classification',
      description: 'Zero-Shot model categorizes floods, earthquakes, typhoons instantly.',
    },
    {
      label: 'Philippines-Wide Coverage',
      description: 'Geo-NER extracts and plots locations across all 17 regions.',
    },
  ];

  return (
    <div className="bg-primary w-full relative overflow-hidden">
      {/* Subtle dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none dot-grid"
        aria-hidden="true"
      />
      {/* Orange top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-accent" />

      <div className="relative z-10 box-border flex flex-col gap-10 items-center justify-center px-4 sm:px-6 lg:px-16 py-16 sm:py-20 w-full max-w-screen-xl mx-auto">

        <div className="box-border flex flex-col gap-3 items-center justify-center px-[20px] py-0 text-primary-foreground text-center">
          <h2 className="flex flex-col font-lato font-extrabold justify-center text-[26px] sm:text-[32px] md:text-[38px] leading-[1.2]">
            A Tool Built for Responders
          </h2>
          <p className="flex flex-col font-lato justify-center max-w-[680px] text-[14px] sm:text-[16px] leading-[26px] text-blue-200">
            GAIA is designed to meet the critical needs of Local Government Units (LGUs) and Disaster Risk Reduction and Management Offices (DRRMOs) across the Philippines.
          </p>
        </div>

        {/* Feature highlights */}
        <ul aria-label="Feature highlights" className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full max-w-4xl">
          {highlights.map((item) => (
            <li
              key={item.label}
              className="flex flex-col gap-2 items-start bg-white/[0.08] border border-white/10 rounded-xl px-5 py-5 backdrop-blur-sm"
            >
              {/* Accent dot */}
              <div className="w-2 h-2 rounded-full bg-accent mb-1" />
              <h3 className="font-lato font-bold text-[15px] sm:text-[16px] text-white leading-snug">
                {item.label}
              </h3>
              <p className="font-lato text-[13px] sm:text-[14px] leading-[22px] text-blue-200">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
