import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MetricCardProps {
  label: string
  value: string | number
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  icon?: React.ReactNode
  variant?: 'default' | 'compact'
  className?: string
}

const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      className,
      label,
      value,
      trend,
      trendValue,
      icon,
      variant = 'default',
    },
    ref
  ) => {
    const trendIcons = {
      up: <TrendingUp className="w-3 h-3" />,
      down: <TrendingDown className="w-3 h-3" />,
      neutral: <Minus className="w-3 h-3" />,
    }

    const trendColors = {
      up: 'text-semantic-success',
      down: 'text-semantic-error',
      neutral: 'text-grey-300',
    }

    if (variant === 'compact') {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl bg-grey-50',
            className
          )}
        >
          {icon && (
            <div className="flex-shrink-0 text-grey-400">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-grey-400 truncate font-medium">{label}</p>
            <p className="text-[17px] font-semibold text-grey-900 tabular-nums">{value}</p>
          </div>
          {trend && (
            <div className={cn('flex items-center gap-0.5', trendColors[trend])}>
              {trendIcons[trend]}
              {trendValue && <span className="text-[11px] font-semibold">{trendValue}</span>}
            </div>
          )}
        </div>
      )
    }

    return (
      <motion.div
        ref={ref}
        className={cn(
          'p-5 surface-card',
          className
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-start justify-between mb-2">
          <span className="text-label">{label}</span>
          {icon && (
            <span className="text-grey-300">
              {icon}
            </span>
          )}
        </div>
        <div className="flex items-end gap-3">
          <span className="text-4xl font-semibold text-grey-900 tabular-nums">
            {value}
          </span>
          {trend && (
            <div className={cn('flex items-center gap-0.5 mb-1', trendColors[trend])}>
              {trendIcons[trend]}
              {trendValue && (
                <span className="text-[12px] font-semibold">{trendValue}</span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    )
  }
)

MetricCard.displayName = 'MetricCard'

export { MetricCard }
