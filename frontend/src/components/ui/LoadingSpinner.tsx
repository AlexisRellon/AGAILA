import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class for the spinner */
  className?: string;
  /** Loading message for screen readers */
  label?: string;
  /** Whether the spinner is currently active */
  isLoading?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-2',
};

/**
 * Accessible loading spinner with aria-live announcement.
 * Use this component to indicate loading states while properly
 * informing screen reader users.
 */
export function LoadingSpinner({
  size = 'md',
  className,
  label = 'Loading...',
  isLoading = true,
}: LoadingSpinnerProps) {
  if (!isLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={isLoading}
      className={cn('flex items-center justify-center', className)}
    >
      <div
        className={cn(
          'animate-spin rounded-full border-b-2 border-current',
          sizeClasses[size]
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
