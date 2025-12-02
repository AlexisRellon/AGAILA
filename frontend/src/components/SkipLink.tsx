/**
 * Skip Link Component
 * 
 * Accessibility feature that allows keyboard users to skip directly to main content.
 * Visible only when focused (keyboard navigation).
 * 
 * WCAG 2.4.1 Bypass Blocks (Level A)
 */

import React from 'react';

interface SkipLinkProps {
  /** Target element ID to skip to (without #) */
  targetId?: string;
  /** Custom label for the skip link */
  label?: string;
}

export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId = 'main-content',
  label = 'Skip to main content',
}) => {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      {label}
    </a>
  );
};

export default SkipLink;
