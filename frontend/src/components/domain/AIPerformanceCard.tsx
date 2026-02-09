/**
 * AIPerformanceCard - Display AI performance metrics
 *
 * Shows:
 * - Approval Rate
 * - Average Time to Decision
 * - AI Accuracy
 * - Override Rate
 * - Trend indicators
 */

import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Clock,
  Target,
  RotateCcw,
  Brain,
  ArrowRight,
} from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { cn } from '@/lib/utils'

export interface AIMetric {
  label: string
  value: string | number
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  icon: 'approval' | 'time' | 'accuracy' | 'override'
}

export interface AIPerformanceCardProps {
  metrics: AIMetric[]
  title?: string
  subtitle?: string
  onViewDetails?: () => void
  className?: string
  isLoading?: boolean
}

const METRIC_ICONS: Record<string, React.ElementType> = {
  approval: CheckCircle2,
  time: Clock,
  accuracy: Target,
  override: RotateCcw,
}

/**
 * Trend configuration - Uses semantic colors sparingly
 * Green/red only for clear positive/negative meaning
 */
const TREND_CONFIG = {
  up: {
    icon: TrendingUp,
    color: 'text-grey-700',
    bgColor: 'bg-grey-200',
  },
  down: {
    icon: TrendingDown,
    color: 'text-grey-600',
    bgColor: 'bg-grey-100',
  },
  neutral: {
    icon: Minus,
    color: 'text-grey-500',
    bgColor: 'bg-grey-100',
  },
}

export function AIPerformanceCard({
  metrics,
  title = 'AI Performance',
  subtitle = 'Last 30 days',
  onViewDetails,
  className,
  isLoading = false,
}: AIPerformanceCardProps) {
  if (isLoading) {
    return <AIPerformanceCardSkeleton />
  }

  return (
    <GlassPanel variant="default" padding="md" className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-grey-100 border border-grey-200/50 flex items-center justify-center">
            <Brain className="w-4 h-4 text-grey-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-grey-900">{title}</h3>
            <p className="text-xs text-grey-500">{subtitle}</p>
          </div>
        </div>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="text-xs text-grey-500 hover:text-grey-700 flex items-center gap-1 transition-colors"
          >
            Details
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric, index) => {
          const Icon = METRIC_ICONS[metric.icon]
          const trendConfig = metric.trend ? TREND_CONFIG[metric.trend] : null
          const TrendIcon = trendConfig?.icon

          return (
            <motion.div
              key={metric.label}
              className="p-3 rounded-xl bg-grey-50 border border-grey-200/50"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-grey-400" />
                <span className="text-xs text-grey-600">{metric.label}</span>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-xl font-semibold text-grey-900">
                  {metric.value}
                </span>
                {trendConfig && TrendIcon && (
                  <div
                    className={cn(
                      'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs',
                      trendConfig.bgColor,
                      trendConfig.color
                    )}
                  >
                    <TrendIcon className="w-3 h-3" />
                    {metric.trendValue && <span>{metric.trendValue}</span>}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

/**
 * AIPerformanceCardCompact - Horizontal layout for dashboard
 */
export function AIPerformanceCardCompact({
  approvalRate,
  avgDecisionDays,
  aiAccuracy,
  casesToday,
  className,
}: {
  approvalRate: number
  avgDecisionDays: number
  aiAccuracy: number
  casesToday: number
  className?: string
}) {
  const metrics = [
    { label: 'Approval Rate', value: `${approvalRate}%`, icon: CheckCircle2 },
    { label: 'Avg Decision', value: `${avgDecisionDays}d`, icon: Clock },
    { label: 'AI Accuracy', value: `${aiAccuracy}%`, icon: Target },
    { label: 'Cases Today', value: casesToday, icon: Brain },
  ]

  return (
    <div className={cn('grid grid-cols-4 gap-4', className)}>
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.label}
            className="flex items-center gap-3 p-3 rounded-xl bg-grey-50 border border-grey-200/50"
          >
            <div className="w-10 h-10 rounded-lg bg-white border border-grey-200 flex items-center justify-center">
              <Icon className="w-5 h-5 text-grey-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-grey-900">{metric.value}</p>
              <p className="text-xs text-grey-500">{metric.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * AIPerformanceCardSkeleton - Loading state
 */
function AIPerformanceCardSkeleton() {
  return (
    <GlassPanel variant="default" padding="md">
      <div className="flex items-center gap-2 mb-4 animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-grey-200" />
        <div className="space-y-1">
          <div className="h-4 bg-grey-200 rounded w-24" />
          <div className="h-3 bg-grey-200 rounded w-16" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-grey-50 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded bg-grey-200" />
              <div className="h-3 bg-grey-200 rounded w-16" />
            </div>
            <div className="h-6 bg-grey-200 rounded w-12" />
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

/**
 * Default metrics for when no data is available
 */
export const DEFAULT_AI_METRICS: AIMetric[] = [
  { label: 'Approval Rate', value: '87%', trend: 'up', trendValue: '+3%', icon: 'approval' },
  { label: 'Avg Decision', value: '3.2d', trend: 'down', trendValue: '-0.5d', icon: 'time' },
  { label: 'AI Accuracy', value: '94%', trend: 'up', trendValue: '+2%', icon: 'accuracy' },
  { label: 'Override Rate', value: '8%', trend: 'neutral', icon: 'override' },
]

export default AIPerformanceCard
