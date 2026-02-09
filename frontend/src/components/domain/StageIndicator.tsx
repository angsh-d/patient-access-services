import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { cn, formatStage } from '@/lib/utils'
import { CASE_STAGES } from '@/lib/constants'
import type { CaseStage } from '@/types/case'

interface StageIndicatorProps {
  stage: CaseStage
  compact?: boolean
  showLabel?: boolean
  className?: string
}

export function StageIndicator({
  stage,
  compact = false,
  showLabel = true,
  className
}: StageIndicatorProps) {
  // Filter out 'failed' - it's a terminal error state, not a progression step
  const displayStages = CASE_STAGES.filter(s => s !== 'failed') as readonly CaseStage[]
  const currentIndex = displayStages.indexOf(stage)
  const totalStages = displayStages.length
  // For failed state, show full progress but with error styling
  const effectiveIndex = stage === 'failed' ? totalStages - 1 : currentIndex
  const progress = ((effectiveIndex + 1) / totalStages) * 100

  if (compact) {
    return (
      <div className={cn('w-full', className)}>
        {showLabel && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-grey-500">Stage</span>
            <span className="text-xs font-medium text-grey-700">
              {formatStage(stage)}
            </span>
          </div>
        )}
        <div className="h-1 bg-grey-200 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              stage === 'completed' ? 'bg-semantic-success' : 'bg-grey-900'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Progress circle */}
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          {/* Background circle */}
          <circle
            className="stroke-grey-200"
            fill="none"
            strokeWidth="4"
            r="20"
            cx="24"
            cy="24"
          />
          {/* Progress circle */}
          <motion.circle
            className={cn(
              stage === 'completed' ? 'stroke-semantic-success' : 'stroke-grey-900'
            )}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            r="20"
            cx="24"
            cy="24"
            initial={{ strokeDasharray: '0 126' }}
            animate={{
              strokeDasharray: `${(progress / 100) * 126} 126`
            }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {stage === 'completed' ? (
            <Check className="w-5 h-5 text-semantic-success" />
          ) : (
            <Loader2 className="w-5 h-5 text-grey-900 animate-spin" />
          )}
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div>
          <p className="text-sm font-medium text-grey-900">
            {formatStage(stage)}
          </p>
          <p className="text-xs text-grey-500">
            Step {effectiveIndex + 1} of {totalStages}
          </p>
        </div>
      )}
    </div>
  )
}

export default StageIndicator
