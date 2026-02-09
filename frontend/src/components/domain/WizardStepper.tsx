/**
 * WizardStepper - Step indicator for the case processing wizard
 *
 * Replaces the old CaseTimeline component with a cleaner, more focused
 * step-by-step wizard interface following the persona-driven UX redesign.
 *
 * Design principles:
 * - Single workflow (no duplicate timelines)
 * - Clear step progression
 * - Current step is visually prominent
 * - AI assistance shown at each step
 */

import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface WizardStep {
  id: string
  label: string
  shortLabel?: string // For mobile
  description?: string
}

interface WizardStepperProps {
  steps: WizardStep[]
  currentStep: number // 0-indexed
  completedSteps?: number[] // Array of completed step indices
  isProcessing?: boolean
  className?: string
  variant?: 'horizontal' | 'compact'
  onStepClick?: (stepIndex: number) => void
}

export function WizardStepper({
  steps,
  currentStep,
  completedSteps = [],
  isProcessing = false,
  className,
  variant = 'horizontal',
  onStepClick,
}: WizardStepperProps) {
  const isStepCompleted = (index: number) => completedSteps.includes(index) || index < currentStep
  const isStepCurrent = (index: number) => index === currentStep
  const isStepClickable = (index: number) => onStepClick && (isStepCompleted(index) || isStepCurrent(index))

  return (
    <div className={cn('w-full', className)}>
      {/* Step counter for mobile/compact */}
      {variant === 'compact' && (
        <div className="flex items-center justify-center gap-2 text-sm text-grey-600 mb-4">
          <span className="font-semibold text-grey-900">Step {currentStep + 1}</span>
          <span>of {steps.length}</span>
          <span className="text-grey-400">|</span>
          <span>{steps[currentStep]?.label}</span>
        </div>
      )}

      {/* Progress bar for compact variant */}
      {variant === 'compact' && (
        <div className="h-1 bg-grey-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-grey-900 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}

      {/* Full stepper for horizontal variant */}
      {variant === 'horizontal' && (
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const completed = isStepCompleted(index)
            const current = isStepCurrent(index)
            const clickable = isStepClickable(index)
            const isLast = index === steps.length - 1

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center',
                  !isLast && 'flex-1'
                )}
              >
                {/* Step indicator */}
                <button
                  type="button"
                  onClick={() => clickable && onStepClick?.(index)}
                  disabled={!clickable}
                  className={cn(
                    'flex flex-col items-center group',
                    clickable && 'cursor-pointer',
                    !clickable && 'cursor-default'
                  )}
                >
                  <motion.div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                      completed && 'bg-grey-700 text-white',
                      current && !completed && 'bg-grey-900 text-white ring-4 ring-grey-900/10',
                      !completed && !current && 'bg-grey-200 text-grey-400',
                      clickable && !current && 'group-hover:ring-2 group-hover:ring-grey-300'
                    )}
                    initial={false}
                    animate={{
                      scale: current ? 1.1 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    {completed ? (
                      <Check className="w-5 h-5" />
                    ) : current && isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      index + 1
                    )}
                  </motion.div>

                  {/* Step label */}
                  <span
                    className={cn(
                      'mt-2 text-xs font-medium text-center max-w-[80px] leading-tight',
                      completed && 'text-grey-700',
                      current && 'text-grey-900',
                      !completed && !current && 'text-grey-400'
                    )}
                  >
                    <span className="hidden sm:block">{step.label}</span>
                    <span className="sm:hidden">{step.shortLabel || step.label}</span>
                  </span>
                </button>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex-1 h-0.5 mx-3 relative">
                    <div className="absolute inset-0 bg-grey-200 rounded-full" />
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-grey-700 rounded-full"
                      initial={{ width: 0 }}
                      animate={{
                        width: completed ? '100%' : '0%'
                      }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Predefined wizard steps for PA case processing
 * These match the 5-step wizard defined in the UX redesign plan
 */
export const PA_WIZARD_STEPS: WizardStep[] = [
  {
    id: 'review',
    label: 'Review',
    shortLabel: 'Review',
    description: 'Review patient and medication data',
  },
  {
    id: 'analysis',
    label: 'AI Analysis',
    shortLabel: 'Analysis',
    description: 'AI analyzes policy criteria',
  },
  {
    id: 'decision',
    label: 'Decision',
    shortLabel: 'Decision',
    description: 'Confirm AI assessment',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    shortLabel: 'Strategy',
    description: 'Select submission strategy',
  },
  {
    id: 'submit',
    label: 'Submit',
    shortLabel: 'Submit',
    description: 'Execute and monitor',
  },
]

/**
 * Maps backend CaseStage to wizard step index
 */
export function stageToWizardStep(stage: string): number {
  const stageMapping: Record<string, number> = {
    intake: 0,
    policy_analysis: 1,
    awaiting_human_decision: 2,
    strategy_generation: 3,
    strategy_selection: 3,
    action_coordination: 4,
    monitoring: 4,
    completed: 4,
    failed: -1,
  }
  return stageMapping[stage] ?? 0
}

/**
 * Maps wizard step index to backend CaseStage
 */
export function wizardStepToStage(step: number): string {
  const stepMapping: Record<number, string> = {
    0: 'intake',
    1: 'policy_analysis',
    2: 'awaiting_human_decision',
    3: 'strategy_selection',
    4: 'monitoring',
  }
  return stepMapping[step] ?? 'intake'
}

export default WizardStepper
