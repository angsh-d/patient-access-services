import { forwardRef } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  children: React.ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'inline-flex items-center justify-center font-semibold rounded-xl',
      'transition-all duration-200 ease-out-expo',
      'focus-visible:outline-none',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
      'no-select'
    )

    const variants = {
      primary: cn(
        'bg-grey-900 text-white',
        'hover:bg-grey-800 active:bg-grey-950',
        'shadow-sm hover:shadow-md'
      ),
      secondary: cn(
        'bg-white text-grey-800 border border-grey-200/80',
        'hover:bg-grey-50 hover:border-grey-300 active:bg-grey-100',
        'shadow-subtle'
      ),
      ghost: cn(
        'text-grey-500',
        'hover:bg-black/[0.04] hover:text-grey-800 active:bg-black/[0.06]'
      ),
      destructive: cn(
        'bg-semantic-error text-white',
        'hover:bg-red-600 active:bg-red-700',
        'shadow-sm'
      ),
      accent: cn(
        'bg-accent text-white',
        'hover:bg-accent-hover active:bg-blue-700',
        'shadow-sm hover:shadow-md'
      ),
    }

    const sizes = {
      sm: 'h-[30px] px-3 text-[12px] gap-1.5 rounded-lg',
      md: 'h-[36px] px-4 text-[13px] gap-2',
      lg: 'h-[42px] px-5 text-[14px] gap-2.5',
    }

    return (
      <motion.button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        whileTap={{ scale: disabled ? 1 : 0.97 }}
        transition={{ duration: 0.1 }}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-80"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          leftIcon
        )}
        {children}
        {rightIcon}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
