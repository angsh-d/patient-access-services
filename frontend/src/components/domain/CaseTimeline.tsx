import { motion } from 'framer-motion'
import { Check, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CASE_STAGES } from '@/lib/constants'
import type { CaseStage } from '@/types/case'

interface CaseTimelineProps {
  currentStage: CaseStage
  className?: string
  vertical?: boolean
}

export function CaseTimeline({ currentStage, className, vertical = false }: CaseTimelineProps) {
  // Filter out 'failed' from display - it's a terminal error state, not a progression step
  const displayStages = CASE_STAGES.filter(s => s !== 'failed') as readonly CaseStage[]
  const currentIndex = displayStages.indexOf(currentStage)
  // If stage is 'failed', show it at the end position
  const effectiveIndex = currentStage === 'failed' ? displayStages.length : currentIndex

  return (
    <div
      className={cn(
        'w-full',
        vertical ? 'flex flex-col' : 'flex items-center justify-between',
        className
      )}
    >
      {displayStages.map((stage, index) => {
        const isCompleted = index < effectiveIndex
        const isCurrent = index === effectiveIndex
        const isUpcoming = index > effectiveIndex

        return (
          <div
            key={stage}
            className={cn(
              'flex items-center',
              vertical ? 'mb-4 last:mb-0' : 'flex-1',
              !vertical && index < displayStages.length - 1 && 'mr-2'
            )}
          >
            {/* Stage indicator */}
            <div className={cn('flex items-center relative', vertical && 'flex-row gap-3')}>
              <motion.div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center',
                  'transition-colors duration-normal',
                  isCompleted && 'bg-semantic-success text-white',
                  isCurrent && stage === 'completed' && 'bg-semantic-success text-white',
                  isCurrent && stage !== 'completed' && 'bg-grey-900 text-white',
                  isUpcoming && 'bg-grey-200 text-grey-400'
                )}
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                }}
                transition={{ duration: 0.2 }}
              >
                {isCompleted || (isCurrent && stage === 'completed') ? (
                  <Check className="w-4 h-4" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </motion.div>
            </div>

            {/* Connector line (horizontal) */}
            {!vertical && index < displayStages.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 relative">
                <div className="absolute inset-0 bg-grey-200 rounded-full" />
                <motion.div
                  className="absolute inset-y-0 left-0 bg-semantic-success rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: isCompleted ? '100%' : '0%'
                  }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            )}

            {/* Connector line (vertical) */}
            {vertical && index < displayStages.length - 1 && (
              <div className="w-0.5 h-8 ml-4 relative mt-1">
                <div className="absolute inset-0 bg-grey-200 rounded-full" />
                <motion.div
                  className="absolute inset-x-0 top-0 bg-semantic-success rounded-full"
                  initial={{ height: 0 }}
                  animate={{
                    height: isCompleted ? '100%' : '0%'
                  }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default CaseTimeline
