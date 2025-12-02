import React from "react";
import { landingAssets } from "../../constants/landingAssets";

export const HeroSection: React.FC = () => {
  return (
    <section className="relative bg-white min-h-[70vh] md:min-h-[calc(100vh-101px)] overflow-hidden w-full flex items-center justify-center">
      {/* Full-Width Background Container - Covers entire viewport */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Combined Background: Grid Plane + Heatmap Overlay - Centered and extending beyond viewport */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <img
            src={landingAssets.hero.background}
            alt=""
            aria-hidden="true"
            className="w-auto h-auto min-w-[100vw] min-h-[500px] sm:min-h-[650px] md:min-h-[750px] object-cover"
          />
        </div>
      </div>

      {/* Content Container - Centered with max-width for content positioning */}
      <div className="relative z-10 w-full max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-16 flex flex-col items-center gap-10 sm:gap-[72px] py-12 sm:py-16 md:py-[100px]">
        {/* Decorative Hazard Pins - Exact Figma positioning relative to 1280px container */}
        <div className="hidden md:block">
          <div
            className="absolute -left-[6vw] top-[1vh] w-[84px] h-[108px] lg:w-[108px] lg:h-[142px] blur-[7.5px] pointer-events-none"
            aria-hidden="true"
          >
            <img
              src={landingAssets.hero.pinVolcano}
              alt=""
              aria-hidden="true"
              className="w-full h-full"
            />
          </div>

          <div
            className="absolute -right-[13vw] top-[4vh] w-[84px] h-[108px] lg:w-[108px] lg:h-[142px] blur-[5px] pointer-events-none"
            aria-hidden="true"
          >
            <img
              src={landingAssets.hero.pinFlood}
              alt=""
              aria-hidden="true"
              className="w-full h-full"
            />
          </div>

          <div
            className="absolute -left-[15vw] bottom-[35vh] w-[84px] h-[108px] lg:w-[108px] lg:h-[142px] blur-[2.5px] pointer-events-none"
            aria-hidden="true"
          >
            <img
              src={landingAssets.hero.pinEarthquake}
              alt=""
              aria-hidden="true"
              className="w-full h-full"
            />
          </div>

          <div
            className="absolute right-[10vw] bottom-[30vh] w-[84px] h-[108px] lg:w-[108px] lg:h-[142px] blur-[3.5px] pointer-events-none"
            aria-hidden="true"
          >
            <img
              src={landingAssets.hero.pinLandslide}
              alt=""
              aria-hidden="true"
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Hero Content */}
        <div className="flex flex-col items-center gap-6 sm:gap-[48px] w-full max-w-[740px]">
          <h1 className="font-lato font-bold text-[32px] sm:text-[44px] md:text-[56px] lg:text-[64px] leading-[1.1] tracking-[-0.5px] sm:tracking-[-0.8px] md:tracking-[-1.1px] lg:tracking-[-1.28px] text-[#005a9c] text-center">
            Empower Your Response. Protect Your Community.
          </h1>

          <div className="flex flex-wrap gap-[12px] sm:gap-[16px] items-center justify-center">
            <button
              type="button"
              className="bg-[#0a2a4d] text-white hover:bg-[#0a2a4d]/90 px-[16px] py-[8px] text-[14px] font-lato font-medium rounded-[6px] transition-colors"
              onClick={() => window.location.assign("/map")}
            >
              View Live Hazard Map
            </button>
            <button
              type="button"
              className="border border-[#005a9c] border-solid text-[#005a9c] hover:bg-[#005a9c] hover:text-white px-[16px] py-[8px] text-[14px] font-lato font-medium rounded-[6px] transition-colors"
              onClick={() => {
                document
                  .getElementById("how-it-works-section")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              How It Works
            </button>
          </div>
        </div>

        {/* Glassmorphism Card Placeholder */}
        <div
          className="w-full max-w-[709px] h-[260px] sm:h-[340px] md:h-[415px] rounded-[24px] sm:rounded-[32px] backdrop-blur-[4.7px] bg-[rgba(26,66,224,0.2)] border border-[rgba(255,255,255,0.4)] opacity-80"
          style={{
            boxShadow:
              "inset 2.15px 1.72px 8.6px 0px rgba(255,255,255,0.15), inset 1.15px 0.92px 4.3px 0px rgba(255,255,255,0.15)",
          }}
        />
      </div>
    </section>
  );
};
