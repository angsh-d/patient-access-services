/**
 * ProcessingAnimation - Multi-step progress indicator for stage processing
 *
 * Shows an animated step-by-step progress that auto-advances through
 * configured steps on timers. Used to provide visual feedback during
 * cached data retrieval that would otherwise appear instant.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ProcessingStep {
  label: string
  duration: number // ms before advancing to next step
}

interface ProcessingAnimationProps {
  steps: ProcessingStep[]
  isActive: boolean
  className?: string
}

export function ProcessingAnimation({ steps, isActive, className }: ProcessingAnimationProps) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    let accumulated = 0

    steps.forEach((_, idx) => {
      if (idx === 0) return
      accumulated += steps[idx - 1].duration
      timers.push(setTimeout(() => setCurrentStep(idx), accumulated))
    })

    return () => timers.forEach(clearTimeout)
  }, [isActive, steps])

  if (!isActive) return null

  return (
    <div className={cn('p-5 rounded-xl bg-grey-50 border border-grey-200', className)}>
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.2 }}
            className="flex items-center gap-3"
          >
            <AnimatePresence mode="wait">
              {idx < currentStep ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="w-5 h-5 rounded-full bg-grey-200 flex items-center justify-center"
                >
                  <Check className="w-3 h-3 text-grey-600" />
                </motion.div>
              ) : idx === currentStep ? (
                <motion.div key="spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Loader2 className="w-5 h-5 text-grey-500 animate-spin" />
                </motion.div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-grey-300" />
              )}
            </AnimatePresence>
            <span className={cn(
              'text-sm transition-colors duration-200',
              idx < currentStep
                ? 'text-grey-600'
                : idx === currentStep
                  ? 'text-grey-900 font-medium'
                  : 'text-grey-400'
            )}>
              {step.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Per-stage step configurations                                       */
/* ------------------------------------------------------------------ */

export const DATA_EXTRACTION_STEPS: ProcessingStep[] = [
  { label: 'Scanning clinical documents...', duration: 1000 },
  { label: 'Extracting patient demographics...', duration: 1000 },
  { label: 'Parsing medication history...', duration: 1200 },
  { label: 'Verifying diagnosis codes...', duration: 800 },
]

export const POLICY_ANALYSIS_STEPS: ProcessingStep[] = [
  { label: 'Reading payer policy documents...', duration: 1200 },
  { label: 'Evaluating coverage criteria...', duration: 1200 },
  { label: 'Identifying documentation gaps...', duration: 1000 },
  { label: 'Generating policy assessment...', duration: 1000 },
]

export const COHORT_ANALYSIS_STEPS: ProcessingStep[] = [
  { label: 'Searching similar patient cases...', duration: 1000 },
  { label: 'Analyzing approval patterns...', duration: 1200 },
  { label: 'Identifying key differentiators...', duration: 1000 },
  { label: 'Building cohort insights...', duration: 800 },
]

export const AI_RECOMMENDATION_STEPS: ProcessingStep[] = [
  { label: 'Reviewing policy analysis results...', duration: 1000 },
  { label: 'Analyzing cohort evidence patterns...', duration: 1200 },
  { label: 'Evaluating risk factors...', duration: 1000 },
  { label: 'Synthesizing recommendation...', duration: 1000 },
]
