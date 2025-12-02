import React from 'react';
import { landingAssets } from '../../constants/landingAssets';

export const FeaturesSection: React.FC = () => {
  const features = [
    {
      title: 'AI-Driven Classification',
      description: 'Utilizes Zero-Shot Classification to instantly understand and categorize environmental hazards from unstructured RSS feeds.',
      image: landingAssets.features.aiClassification,
    },
    {
      title: 'Automated Geo-NER',
      description: 'Incorporates Geo-Named Entity Recognition to automatically extract, verify, and pinpoint precise locations from text.',
      image: landingAssets.features.geoNer,
    },
    {
      title: 'Unified Command Dashboard',
      description: 'A multi-channel hub that visualizes all verified hazard data on an interactive map for real-time situational awareness.',
      image: landingAssets.features.commandDashboard,
    },
  ];

  return (
    <section 
      className="box-border flex flex-col gap-6 sm:gap-8 items-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 sm:py-24 w-full max-w-screen-xl mx-auto"
      aria-labelledby="features-heading"
    >
      <h2 
        id="features-heading"
        className="font-lato font-extrabold text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2] text-[#334155] text-center"
      >
        The Core Components of GAIA
      </h2>
      <ul className="box-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-start justify-center overflow-visible p-0 w-full list-none">
        {features.map((feature, index) => (
          <li 
            key={index}
            className="flex flex-col gap-4 sm:gap-6 items-start w-full rounded-[8px]"
          >
            <div className="h-[224px] sm:h-[280px] md:h-[320px] lg:h-[350px] w-full rounded-[16px] overflow-hidden">
              <img 
                src={feature.image} 
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-2 items-start w-full">
              <h3 className="font-inter font-semibold text-[18px] sm:text-[20px] md:text-[22px] lg:text-[24px] leading-[1.2] tracking-[-0.48px] text-black">
                {feature.title}
              </h3>
              <p className="font-inter font-medium text-[14px] sm:text-[16px] md:text-[18px] leading-[1.45] tracking-[-0.09px] text-[rgba(0,0,0,0.55)]">
                {feature.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
