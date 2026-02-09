import { forwardRef } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface GlassPanelProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'light' | 'dark' | 'interactive' | 'ai-active' | 'success' | 'warning' | 'error'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  blur?: 'sm' | 'md' | 'lg'
  glowing?: boolean
}

const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    {
      className,
      variant = 'default',
      padding = 'md',
      blur = 'md',
      glowing = false,
      children,
      ...props
    },
    ref
  ) => {
    const variants = {
      default: 'surface-card',
      light: cn(
        'bg-white/55 border border-grey-200/30 rounded-2xl',
        'backdrop-blur-lg'
      ),
      dark: cn(
        'bg-grey-900/85 border border-white/10 rounded-2xl text-white',
        'backdrop-blur-lg'
      ),
      interactive: cn(
        'surface-card surface-card-hover cursor-pointer'
      ),
      'ai-active': cn(
        'bg-white border border-accent/20 rounded-2xl',
        'ring-1 ring-accent/10',
        'shadow-[0_0_0_1px_rgba(0,122,255,0.06),0_0_16px_rgba(0,122,255,0.06)]'
      ),
      success: cn(
        'bg-semantic-success/[0.04] border border-semantic-success/15 rounded-2xl'
      ),
      warning: cn(
        'bg-semantic-warning/[0.04] border border-semantic-warning/15 rounded-2xl'
      ),
      error: cn(
        'bg-semantic-error/[0.04] border border-semantic-error/15 rounded-2xl'
      ),
    }

    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
    }

    const getMotionProps = () => {
      if (variant === 'interactive') {
        return {
          whileHover: { y: -1 },
          whileTap: { scale: 0.995 },
          transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
        }
      }

      if (variant === 'ai-active' && glowing) {
        return {
          animate: {
            boxShadow: [
              '0 0 0 1px rgba(0,122,255,0.06), 0 0 16px rgba(0,122,255,0.06)',
              '0 0 0 1px rgba(0,122,255,0.12), 0 0 24px rgba(0,122,255,0.1)',
              '0 0 0 1px rgba(0,122,255,0.06), 0 0 16px rgba(0,122,255,0.06)',
            ],
          },
          transition: {
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }
      }

      return {}
    }

    return (
      <motion.div
        ref={ref}
        className={cn(variants[variant], paddings[padding], className)}
        {...getMotionProps()}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

GlassPanel.displayName = 'GlassPanel'

export { GlassPanel }
