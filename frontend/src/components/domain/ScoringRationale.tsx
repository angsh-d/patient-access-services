/**
 * ScoringRationale - Breakdown of how AI calculated a score
 *
 * Design Philosophy:
 * - Shows weight contribution of each scoring factor
 * - Visual bar representation for easy comparison
 * - Explains "why this score" with provenance
 * - Greyscale-first with semantic colors for status
 *
 * Key UX Principle: Every decision backed by transparent calculation
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calculator,
  ChevronDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  Scale,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'

export interface ScoreFactor {
  id: string
  name: string
  weight: number // 0-1, how much this factor contributes
  rawScore: number // 0-1, the actual score for this factor
  weightedScore: number // weight * rawScore
  reasoning: string
  isPositive?: boolean // true = higher is better, false = lower is better
  threshold?: { good: number; warning: number } // thresholds for color coding
}

export interface ScoringRationaleProps {
  totalScore: number
  factors: ScoreFactor[]
  explanation?: string
  isExpanded?: boolean
  onToggleExpand?: () => void
  showWeights?: boolean
  className?: string
}

export function ScoringRationale({
  totalScore,
  factors,
  explanation,
  isExpanded: controlledExpanded,
  onToggleExpand,
  showWeights = true,
  className,
}: ScoringRationaleProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = controlledExpanded ?? internalExpanded

  const toggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand()
    } else {
      setInternalExpanded(!internalExpanded)
    }
  }

  // Calculate total weight to ensure it sums to 1
  const totalWeight = factors.reduce((acc, f) => acc + f.weight, 0)

  return (
    <div className={cn('rounded-lg border border-grey-200 bg-white overflow-hidden', className)}>
      {/* Header - Always visible */}
      <button
        onClick={toggleExpand}
        className="w-full p-3 flex items-center justify-between hover:bg-grey-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-grey-500" />
          <span className="text-sm font-medium text-grey-700">Score Breakdown</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-grey-900">
            {(totalScore * 100).toFixed(0)}
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-grey-400 transition-transform',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Expanded breakdown */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-3 space-y-3 border-t border-grey-100">
              {/* Explanation */}
              {explanation && (
                <div className="p-2 bg-grey-50 rounded-lg mt-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-grey-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-grey-600">{explanation}</p>
                  </div>
                </div>
              )}

              {/* Factor breakdown */}
              <div className="space-y-2 mt-3">
                {factors.map((factor) => (
                  <ScoreFactorRow
                    key={factor.id}
                    factor={factor}
                    totalWeight={totalWeight}
                    showWeight={showWeights}
                  />
                ))}
              </div>

              {/* Total row */}
              <div className="pt-2 mt-2 border-t border-grey-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-grey-900">Total Score</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-grey-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-grey-900 rounded-full transition-all"
                        style={{ width: `${totalScore * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-grey-900 w-10 text-right">
                      {(totalScore * 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * ScoreFactorRow - Individual factor with visual bar
 */
function ScoreFactorRow({
  factor,
  totalWeight,
  showWeight,
}: {
  factor: ScoreFactor
  totalWeight: number
  showWeight: boolean
}) {
  const [showReasoning, setShowReasoning] = useState(false)

  // Determine color based on score and thresholds
  const getBarColor = () => {
    if (factor.threshold) {
      if (factor.isPositive !== false) {
        // Higher is better
        if (factor.rawScore >= factor.threshold.good) return 'bg-semantic-success'
        if (factor.rawScore >= factor.threshold.warning) return 'bg-semantic-warning'
        return 'bg-semantic-error'
      } else {
        // Lower is better (e.g., risk)
        if (factor.rawScore <= factor.threshold.good) return 'bg-semantic-success'
        if (factor.rawScore <= factor.threshold.warning) return 'bg-semantic-warning'
        return 'bg-semantic-error'
      }
    }
    return 'bg-grey-700'
  }

  const FACTOR_ICONS: Record<string, React.ReactNode> = {
    approval: <TrendingUp className="w-3.5 h-3.5" />,
    time: <Clock className="w-3.5 h-3.5" />,
    risk: <AlertTriangle className="w-3.5 h-3.5" />,
    default: <Scale className="w-3.5 h-3.5" />,
  }

  const iconKey = factor.name.toLowerCase().includes('approval')
    ? 'approval'
    : factor.name.toLowerCase().includes('time') || factor.name.toLowerCase().includes('day')
      ? 'time'
      : factor.name.toLowerCase().includes('risk')
        ? 'risk'
        : 'default'

  return (
    <div>
      <button
        onClick={() => setShowReasoning(!showReasoning)}
        className="w-full text-left hover:bg-grey-50 rounded p-1 -m-1 transition-colors"
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-grey-400">{FACTOR_ICONS[iconKey]}</span>
            <span className="text-xs text-grey-700">{factor.name}</span>
            {showWeight && (
              <Badge variant="neutral" size="sm" className="text-xs">
                {Math.round((factor.weight / totalWeight) * 100)}% weight
              </Badge>
            )}
          </div>
          <span className="text-xs font-medium text-grey-900">
            {(factor.rawScore * 100).toFixed(0)}
          </span>
        </div>

        {/* Visual bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-grey-200 rounded-full overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', getBarColor())}
              initial={{ width: 0 }}
              animate={{ width: `${factor.rawScore * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs text-grey-500 w-8 text-right">
            +{(factor.weightedScore * 100).toFixed(0)}
          </span>
        </div>
      </button>

      {/* Reasoning tooltip */}
      <AnimatePresence>
        {showReasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="p-2 mt-1 bg-grey-50 rounded text-xs text-grey-600 border-l-2 border-grey-300">
              {factor.reasoning}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * ScoringRationaleInline - Compact version for strategy cards
 */
export function ScoringRationaleInline({
  factors,
  className,
}: {
  factors: ScoreFactor[]
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {factors.slice(0, 3).map((factor) => {
        const isGood = factor.threshold
          ? factor.isPositive !== false
            ? factor.rawScore >= factor.threshold.good
            : factor.rawScore <= factor.threshold.good
          : factor.rawScore >= 0.7

        return (
          <div
            key={factor.id}
            className={cn(
              'px-1.5 py-0.5 rounded text-xs font-medium',
              isGood ? 'bg-grey-900 text-white' : 'bg-grey-200 text-grey-600'
            )}
            title={`${factor.name}: ${(factor.rawScore * 100).toFixed(0)}%`}
          >
            {(factor.rawScore * 100).toFixed(0)}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Helper to create score factors from strategy score
 */
export function createScoreFactors(score: {
  approval_probability?: number
  days_to_therapy?: number
  rework_risk?: number
  total_score?: number
  weighted_score?: number
}): ScoreFactor[] {
  const factors: ScoreFactor[] = []

  if (score.approval_probability !== undefined) {
    factors.push({
      id: 'approval',
      name: 'Approval Likelihood',
      weight: 0.4,
      rawScore: score.approval_probability,
      weightedScore: score.approval_probability * 0.4,
      reasoning: `Based on policy criteria match and historical approval patterns. ${
        score.approval_probability >= 0.7
          ? 'High likelihood based on strong evidence alignment.'
          : score.approval_probability >= 0.5
            ? 'Moderate likelihood, some criteria may need clarification.'
            : 'Lower likelihood due to potential policy gaps.'
      }`,
      isPositive: true,
      threshold: { good: 0.7, warning: 0.5 },
    })
  }

  if (score.days_to_therapy !== undefined) {
    // Normalize days to 0-1 score (assuming 0-14 day range)
    const normalizedDays = Math.max(0, Math.min(1, 1 - score.days_to_therapy / 14))
    factors.push({
      id: 'time',
      name: 'Time to Therapy',
      weight: 0.35,
      rawScore: normalizedDays,
      weightedScore: normalizedDays * 0.35,
      reasoning: `Estimated ${score.days_to_therapy} days to therapy access. ${
        score.days_to_therapy <= 5
          ? 'Fast track approach minimizes patient wait time.'
          : score.days_to_therapy <= 10
            ? 'Standard timeline with typical payer processing.'
            : 'Extended timeline may be needed for thorough documentation.'
      }`,
      isPositive: true,
      threshold: { good: 0.64, warning: 0.36 }, // ~5 days / ~9 days
    })
  }

  if (score.rework_risk !== undefined) {
    factors.push({
      id: 'risk',
      name: 'Rework Risk',
      weight: 0.25,
      rawScore: 1 - score.rework_risk, // Invert since lower risk is better
      weightedScore: (1 - score.rework_risk) * 0.25,
      reasoning: `${Math.round(score.rework_risk * 100)}% chance of requiring rework. ${
        score.rework_risk <= 0.2
          ? 'Low risk due to complete documentation.'
          : score.rework_risk <= 0.4
            ? 'Moderate risk, some documentation may need supplementation.'
            : 'Higher risk, recommend gathering additional evidence before submission.'
      }`,
      isPositive: false, // Lower is better, but we inverted the score
      threshold: { good: 0.8, warning: 0.6 }, // Inverted: 20% risk / 40% risk
    })
  }

  return factors
}

export default ScoringRationale
