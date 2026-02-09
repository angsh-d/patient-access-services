/**
 * CounterfactualPanel - What-if analysis showing alternative strategies
 *
 * Design Philosophy:
 * - Greyscale-first with minimal semantic colors
 * - Apple HIG inspired - clean, professional
 * - Color only for semantic meaning (current = dark, diff direction)
 *
 * Displays:
 * - Current strategy with score
 * - Alternative strategies with comparison
 * - Trade-offs and when to choose each option
 */

import { motion, AnimatePresence } from 'framer-motion'
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { cn } from '@/lib/utils'
import { staggerContainer, listItem } from '@/lib/animations'

export interface StrategyOption {
  id: string
  name: string
  score: number
  approvalProbability: number
  daysToTherapy: number
  reworkRisk: number
  isRecommended?: boolean
  isCurrent?: boolean
  tradeoffs?: string[]
  bestWhen?: string
}

export interface CounterfactualPanelProps {
  currentStrategy: StrategyOption
  alternatives: StrategyOption[]
  onSelectStrategy?: (strategyId: string) => void
  className?: string
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export function CounterfactualPanel({
  currentStrategy,
  alternatives,
  onSelectStrategy,
  className,
  isExpanded = true,
  onToggleExpand,
}: CounterfactualPanelProps) {
  return (
    <GlassPanel variant="light" padding="md" className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-grey-100 border border-grey-200/50 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-grey-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-grey-900">
              What-If Analysis
            </h3>
            <p className="text-xs text-grey-500">
              Compare alternative strategies
            </p>
          </div>
        </div>
        {onToggleExpand && (
          <button
            onClick={onToggleExpand}
            className="text-xs text-grey-500 hover:text-grey-700 flex items-center gap-1"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
            <ChevronRight
              className={cn(
                'w-3 h-3 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        )}
      </div>

      {/* Current Strategy - Distinguished with dark styling */}
      <div className="p-3 rounded-lg bg-grey-900 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
              Current
            </span>
            <span className="text-sm font-medium text-white">
              {currentStrategy.name}
            </span>
          </div>
          <span className="text-lg font-semibold text-white">
            {currentStrategy.score.toFixed(1)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <MetricDisplay
            label="Approval"
            value={`${Math.round(currentStrategy.approvalProbability * 100)}%`}
            variant="dark"
          />
          <MetricDisplay
            label="Days"
            value={`${currentStrategy.daysToTherapy}d`}
            variant="dark"
          />
          <MetricDisplay
            label="Rework Risk"
            value={`${Math.round(currentStrategy.reworkRisk * 100)}%`}
            variant="dark"
          />
        </div>
      </div>

      {/* Alternatives */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-3"
          >
            {alternatives.map((alt) => {
              const scoreDiff = alt.score - currentStrategy.score
              const daysDiff = alt.daysToTherapy - currentStrategy.daysToTherapy
              const riskDiff = alt.reworkRisk - currentStrategy.reworkRisk

              return (
                <motion.div
                  key={alt.id}
                  variants={listItem}
                  className={cn(
                    'p-3 rounded-lg border transition-all',
                    'hover:border-grey-300 cursor-pointer',
                    alt.isCurrent
                      ? 'bg-grey-100 border-grey-300'
                      : 'bg-white border-grey-200'
                  )}
                  onClick={() => onSelectStrategy?.(alt.id)}
                >
                  {/* Strategy Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-grey-400" />
                      <span className="text-sm font-medium text-grey-900">
                        {alt.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-grey-700">
                        {alt.score.toFixed(1)}
                      </span>
                      <DiffBadge value={scoreDiff} suffix="" />
                    </div>
                  </div>

                  {/* Metrics Comparison */}
                  <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                    <MetricDisplay
                      label="Approval"
                      value={`${Math.round(alt.approvalProbability * 100)}%`}
                      diff={alt.approvalProbability - currentStrategy.approvalProbability}
                      isPercentage
                    />
                    <MetricDisplay
                      label="Days"
                      value={`${alt.daysToTherapy}d`}
                      diff={daysDiff}
                      inverted
                    />
                    <MetricDisplay
                      label="Risk"
                      value={`${Math.round(alt.reworkRisk * 100)}%`}
                      diff={riskDiff}
                      inverted
                      isPercentage
                    />
                  </div>

                  {/* Trade-offs */}
                  {alt.tradeoffs && alt.tradeoffs.length > 0 && (
                    <div className="pt-2 border-t border-grey-200">
                      <span className="text-xs font-medium text-grey-600">Trade-offs:</span>
                      <ul className="mt-1 space-y-0.5">
                        {alt.tradeoffs.map((tradeoff, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-grey-500 flex items-start gap-1"
                          >
                            <AlertTriangle className="w-3 h-3 text-grey-400 mt-0.5 flex-shrink-0" />
                            {tradeoff}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Best When */}
                  {alt.bestWhen && (
                    <div className="mt-2 p-2 bg-grey-50 rounded text-xs text-grey-600">
                      <span className="font-medium">Choose when: </span>
                      {alt.bestWhen}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassPanel>
  )
}

/**
 * MetricDisplay - Individual metric with optional diff
 *
 * Design: Greyscale-first, subtle semantic colors for diff direction
 */
function MetricDisplay({
  label,
  value,
  diff,
  inverted = false,
  isPercentage = false,
  variant = 'light',
}: {
  label: string
  value: string
  diff?: number
  inverted?: boolean
  isPercentage?: boolean
  variant?: 'light' | 'dark'
}) {
  // Determine if the diff is positive or negative (considering inversion)
  const isPositive = inverted ? (diff ?? 0) < 0 : (diff ?? 0) > 0
  const isNegative = inverted ? (diff ?? 0) > 0 : (diff ?? 0) < 0

  const isDark = variant === 'dark'

  return (
    <div className="text-center">
      <span className={cn('block', isDark ? 'text-white/60' : 'text-grey-500')}>{label}</span>
      <span className={cn('font-medium', isDark ? 'text-white' : 'text-grey-900')}>{value}</span>
      {diff !== undefined && diff !== 0 && (
        <span
          className={cn(
            'ml-1 text-xs',
            isPositive && (isDark ? 'text-white/80' : 'text-grey-700'),
            isNegative && (isDark ? 'text-white/60' : 'text-grey-500'),
            !isPositive && !isNegative && (isDark ? 'text-white/50' : 'text-grey-500')
          )}
        >
          ({diff > 0 ? '+' : ''}{isPercentage ? Math.round(diff * 100) + '%' : diff})
        </span>
      )}
    </div>
  )
}

/**
 * DiffBadge - Small badge showing difference from baseline
 *
 * Design: Greyscale-first approach
 * - Better scores (positive) = dark prominent badge
 * - Worse scores (negative) = lighter subdued badge
 */
function DiffBadge({
  value,
  suffix = '',
}: {
  value: number
  suffix?: string
}) {
  const isPositive = value > 0
  const isNegative = value < 0

  if (Math.abs(value) < 0.1) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium',
        isPositive && 'bg-grey-900 text-white',
        isNegative && 'bg-grey-200 text-grey-600'
      )}
    >
      {isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {isPositive ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  )
}

/**
 * CounterfactualPanelCompact - Inline summary version
 */
export function CounterfactualPanelCompact({
  currentScore,
  alternativeCount,
  bestAlternativeScore,
  onExpand,
}: {
  currentScore: number
  alternativeCount: number
  bestAlternativeScore?: number
  onExpand?: () => void
}) {
  const diff = bestAlternativeScore ? bestAlternativeScore - currentScore : 0

  return (
    <button
      className="w-full p-3 rounded-lg border border-grey-200 bg-grey-50 text-left hover:bg-grey-100 transition-colors group"
      onClick={onExpand}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-grey-500" />
          <span className="text-sm text-grey-700">
            {alternativeCount} alternative strategies
          </span>
        </div>
        <div className="flex items-center gap-2">
          {diff !== 0 && (
            <span className="text-xs text-grey-500">
              Best: {bestAlternativeScore?.toFixed(1)} ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-grey-400 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  )
}

export default CounterfactualPanel
