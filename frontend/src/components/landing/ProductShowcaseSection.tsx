import React from 'react';
import { landingAssets } from '../../constants/landingAssets';

export const ProductShowcaseSection: React.FC = () => {
  const showcaseItems = [
    {
      title: 'Live Hazard Map',
      description: 'The central dashboard view, showing all active, geolocated hazard reports in real-time.',
      backgroundImage: landingAssets.hero.showcaseImage,
    },
    {
      title: 'AI-Classified Report Feed',
      description: 'The central dashboard view, showing all active, geolocated hazard reports in real-time.',
      backgroundImage: landingAssets.hero.aiClassification,
    },
    {
      title: 'Hazard Density Heatmap',
      description: 'The central dashboard view, showing all active, geolocated hazard reports in real-time.',
      backgroundImage: landingAssets.hero.hazardDensityMap,
    },
    {
      title: 'Real-Time Filtering',
      description: 'The central dashboard view, showing all active, geolocated hazard reports in real-time.',
      backgroundImage: landingAssets.hero.realTimeFiltering,
    },
  ];

  return (
    <section 
      className="box-border flex flex-col gap-10 items-center justify-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 w-full max-w-screen-xl mx-auto"
      aria-labelledby="showcase-heading"
    >
      <div className="box-border flex flex-col gap-3 items-center justify-center px-[20px] py-0 text-center">
        <h2 
          id="showcase-heading"
          className="font-lato font-extrabold text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2] text-[#334155]"
        >
          AGAILA&apos;s AI-Generated Assessments
        </h2>
        <p className="font-lato max-w-[720px] text-[14px] sm:text-[16px] leading-[24px] text-black">
          Explore the real-time outputs from our AI pipeline, turning unstructured reports into live intelligence.
        </p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 items-stretch justify-center overflow-visible w-full list-none p-0">
        {showcaseItems.map((item, index) => (
          <li 
            key={index}
            className="bg-[#d9d9d9] flex flex-col gap-[10px] h-[256px] sm:h-[288px] md:h-[320px] lg:h-[360px] items-start justify-end w-full bg-cover bg-center rounded-lg overflow-hidden"
            style={{ backgroundImage: `url(${item.backgroundImage})` }}
          >
            <div className="bg-gradient-to-t box-border flex flex-col from-10% from-[rgba(10,42,77,0.9)] gap-[10px] items-start justify-end overflow-clip px-[20px] py-[40px] sm:py-[50px] text-white to-95% to-[rgba(0,0,0,0)] w-full">
              <h3 className="font-lato font-semibold text-[18px] sm:text-[20px] leading-[28px] sm:leading-[30px]">
                {item.title}
              </h3>
              <p className="font-lato font-medium text-[14px] sm:text-[16px] leading-[24px] w-full">
                {item.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
