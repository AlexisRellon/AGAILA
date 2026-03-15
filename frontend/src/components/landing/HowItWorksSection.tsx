import React from 'react';
import { landingAssets } from '../../constants/landingAssets';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      number: '01',
      title: 'Multi-Source Ingestion',
      description: 'The system continuously monitors and ingests data from a wide array of sources, including official RSS feeds from News Outlets like GMA News, Rappler, and Inquirer.',
    },
    {
      number: '02',
      title: 'AI Hazard Classification',
      description: 'Our AI model (Zero-Shot) instantly reads and understands each report, classifying the specific environmental hazard (e.g., flood, fire, landslide).',
    },
    {
      number: '03',
      title: 'Geo-NER Location Extraction',
      description: 'An advanced Geo-Named Entity Recognition (Geo-NER) model automatically identifies and extracts precise location data from the text.',
    },
    {
      number: '04',
      title: 'Actionable Visualization',
      description: 'All verified and geolocated alerts are instantly plotted on the central command dashboard and hazard map, ready for LGU responders.',
    },
  ];

  return (
    <div id="how-it-works-section" className="box-border flex flex-col gap-6 items-center justify-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 w-full max-w-screen-xl mx-auto">
      <div className="box-border flex flex-col gap-3 items-center justify-center px-[20px] py-0 text-center">
        <h2 className="flex flex-col font-lato font-extrabold justify-center text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2] text-[#334155]">
          From Raw Data to Real-Time Decision
        </h2>
        <p className="flex flex-col font-lato justify-center max-w-[720px] text-[14px] sm:text-[16px] leading-[24px] text-black">
          GAIA&apos;s intelligent pipeline transforms unstructured text reports into verified, actionable geospatial alerts in four steps.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row lg:items-start lg:gap-0 gap-6 w-full">
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            <div className="flex flex-col gap-2 items-start overflow-visible w-full lg:flex-1">
              <p className="flex flex-col font-lato font-black justify-center text-[44px] sm:text-[52px] md:text-[61px] leading-[1.1] text-[#575757] w-full">
                {step.number}
              </p>
              <h3 className="flex flex-col font-lato font-bold justify-center text-[18px] sm:text-[20px] leading-[28px] sm:leading-[30px] text-black">
                {step.title}
              </h3>
              <p className="flex flex-col font-lato justify-center text-[14px] sm:text-[16px] leading-[24px] text-black w-full">
                {step.description}
              </p>
            </div>

            {index < steps.length - 1 && (
              <div className="hidden lg:flex items-start justify-center flex-shrink-0 pt-8 px-2">
                <img
                  src={landingAssets.icons.arrowRight}
                  alt=""
                  aria-hidden="true"
                  className="w-[40px] h-[40px] opacity-50"
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
