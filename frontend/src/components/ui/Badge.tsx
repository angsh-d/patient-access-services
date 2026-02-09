import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
  dot?: boolean
  pulse?: boolean
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = 'neutral',
      size = 'md',
      dot = false,
      pulse = false,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'inline-flex items-center font-semibold rounded-full',
      'no-select'
    )

    const variants = {
      neutral: 'bg-grey-100 text-grey-600',
      success: 'bg-semantic-success/8 text-semantic-success',
      warning: 'bg-semantic-warning/8 text-semantic-warning',
      error: 'bg-semantic-error/8 text-semantic-error',
      info: 'bg-accent-light text-accent',
    }

    const sizes = {
      sm: 'text-[10px] px-2 py-[2px] gap-1',
      md: 'text-[11px] px-2.5 py-[3px] gap-1.5',
    }

    const dotColors = {
      neutral: 'bg-grey-400',
      success: 'bg-semantic-success',
      warning: 'bg-semantic-warning',
      error: 'bg-semantic-error',
      info: 'bg-accent',
    }

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              'w-[5px] h-[5px] rounded-full',
              dotColors[variant],
              pulse && 'animate-pulse-subtle'
            )}
          />
        )}
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export { Badge }
