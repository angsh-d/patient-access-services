import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Star, Clock, AlertTriangle, TrendingUp, Zap, ChevronDown, Brain } from 'lucide-react'
import { cn, formatDays, formatPercent } from '@/lib/utils'
import { Card, Button, Badge } from '@/components/ui'
import { STRATEGY_TYPES } from '@/lib/constants'
import { ScoringRationale, createScoreFactors } from './ScoringRationale'
import type { Strategy, StrategyType } from '@/types/strategy'

interface StrategyComparisonProps {
  strategies: Strategy[]
  recommendedId?: string
  selectedId?: string
  onSelect?: (strategy: Strategy) => void
  isLoading?: boolean
  className?: string
}

export function StrategyComparison({
  strategies,
  recommendedId,
  selectedId,
  onSelect,
  isLoading,
  className
}: StrategyComparisonProps) {
  const sortedStrategies = [...strategies].sort((a, b) => {
    // Put recommended first
    if (a.id === recommendedId) return -1
    if (b.id === recommendedId) return 1
    return 0
  })

  // Use single column for 1 strategy, responsive grid for multiple
  const gridClass = strategies.length === 1
    ? 'max-w-lg mx-auto'
    : strategies.length === 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto'
      : 'grid grid-cols-1 md:grid-cols-3 gap-6'

  return (
    <div className={cn(gridClass, className)}>
      {sortedStrategies.map((strategy, index) => (
        <StrategyCard
          key={strategy.id}
          strategy={strategy}
          isRecommended={strategy.id === recommendedId || strategies.length === 1}
          isSelected={strategy.id === selectedId}
          onSelect={() => onSelect?.(strategy)}
          index={index}
          isLoading={isLoading}
          isSingleStrategy={strategies.length === 1}
        />
      ))}
    </div>
  )
}

interface StrategyCardProps {
  strategy: Strategy
  isRecommended?: boolean
  isSelected?: boolean
  onSelect?: () => void
  index: number
  isLoading?: boolean
  isSingleStrategy?: boolean
}

function StrategyCard({
  strategy,
  isRecommended,
  isSelected,
  onSelect,
  index,
  isLoading,
  isSingleStrategy
}: StrategyCardProps) {
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false)

  // Strategy icons - now only sequential primary-first is valid
  const strategyIcons: Record<StrategyType, React.ReactNode> = {
    sequential_primary_first: <Clock className="w-5 h-5" />,
    // Legacy types (for backwards compatibility with existing data)
    sequential_cigna_first: <Clock className="w-5 h-5" />,
    sequential_uhc_first: <Clock className="w-5 h-5" />,
    parallel: <Zap className="w-5 h-5" />,  // Should no longer be generated
    optimized: <Star className="w-5 h-5" />,  // Should no longer be generated
  }

  // Generate scoring rationale
  const scoreFactors = createScoreFactors(strategy.score)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      <Card
        variant={isRecommended ? 'elevated' : 'default'}
        padding="none"
        className={cn(
          'relative overflow-hidden',
          isSelected && 'ring-2 ring-grey-900',
          isRecommended && 'border-grey-900'
        )}
      >
        {/* Recommended badge with AI reasoning indicator */}
        {isRecommended && (
          <div className="absolute top-0 left-0 right-0 bg-grey-900 text-white text-xs font-medium py-1.5 text-center flex items-center justify-center gap-1.5">
            <Brain className="w-3 h-3" />
            AI Recommended
          </div>
        )}

        <div className={cn('p-6', isRecommended && 'pt-10')}>
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                isRecommended ? 'bg-grey-900 text-white' : 'bg-grey-100 text-grey-600'
              )}>
                {strategyIcons[strategy.type]}
              </div>
              <div>
                <h3 className="font-semibold text-grey-900">
                  {strategy.name}
                </h3>
                <p className="text-xs text-grey-500">
                  {STRATEGY_TYPES[strategy.type]}
                </p>
              </div>
            </div>
          </div>

          {/* Score with expandable breakdown */}
          <div className="mb-6">
            <button
              onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
              className="w-full text-left hover:bg-grey-50 rounded-lg p-2 -m-2 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-4xl font-semibold text-grey-900 tracking-tight">
                    {(strategy.score.total_score * 100).toFixed(0)}
                  </div>
                  <p className="text-xs text-grey-500 mt-1 flex items-center gap-1">
                    Overall Score
                    <ChevronDown className={cn(
                      'w-3 h-3 transition-transform',
                      showScoreBreakdown && 'rotate-180'
                    )} />
                  </p>
                </div>
                <Badge variant="neutral" size="sm" className="text-xs">
                  Why this score?
                </Badge>
              </div>
            </button>

            {/* Score breakdown */}
            <AnimatePresence>
              {showScoreBreakdown && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-3"
                >
                  <ScoringRationale
                    totalScore={strategy.score.total_score}
                    factors={scoreFactors}
                    explanation={isRecommended
                      ? 'This strategy scores highest due to optimal balance of approval likelihood and time to therapy.'
                      : 'Score calculated based on weighted factors below.'
                    }
                    isExpanded={true}
                    showWeights={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Metrics */}
          <div className="space-y-3 mb-6">
            <MetricRow
              icon={<TrendingUp className="w-4 h-4" />}
              label="Approval Confidence"
              value={formatPercent(strategy.score.approval_probability)}
              highlight={strategy.score.approval_probability >= 0.7}
            />
            <MetricRow
              icon={<Clock className="w-4 h-4" />}
              label="Days to Therapy"
              value={formatDays(strategy.score.days_to_therapy)}
              highlight={strategy.score.days_to_therapy <= 5}
            />
            <MetricRow
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Rework Risk"
              value={formatPercent(strategy.score.rework_risk)}
              isWarning={strategy.score.rework_risk > 0.3}
            />
          </div>

          {/* AI Reasoning for recommendation */}
          {isRecommended && (
            <div className="mb-6 p-3 bg-grey-50 rounded-lg border border-grey-200">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-grey-600" />
                <span className="text-xs font-semibold text-grey-700">AI Reasoning</span>
              </div>
              <p className="text-xs text-grey-600 leading-relaxed">
                {isSingleStrategy ? (
                  <>
                    This is the industry-standard approach for PA submissions.
                    Always submit to primary insurance first, then coordinate with secondary after receiving a decision.
                    This ensures proper Coordination of Benefits (COB) and avoids claim coordination issues.
                  </>
                ) : (
                  <>
                    Recommended based on {strategy.advantages[0]?.toLowerCase() || 'optimal balance of approval likelihood and timeline'}.
                    {strategy.score.approval_probability >= 0.7 && ' High approval confidence reduces risk of delays.'}
                    {strategy.score.days_to_therapy <= 5 && ' Fast time to therapy prioritized.'}
                  </>
                )}
              </p>
            </div>
          )}

          {/* Advantages */}
          {strategy.advantages.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-grey-500 mb-2">Key Advantages</p>
              <ul className="space-y-1.5">
                {strategy.advantages.slice(0, 3).map((advantage, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-semantic-success mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-grey-600">{advantage}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Select button */}
          <Button
            variant={isSelected ? 'primary' : 'secondary'}
            size="md"
            className="w-full"
            onClick={onSelect}
            isLoading={isLoading}
            disabled={isSelected}
          >
            {isSelected ? 'Selected' : 'Select Strategy'}
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

interface MetricRowProps {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
  isWarning?: boolean
}

function MetricRow({ icon, label, value, highlight, isWarning }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-grey-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className={cn(
        'text-sm font-medium',
        highlight && 'text-semantic-success',
        isWarning && 'text-semantic-warning',
        !highlight && !isWarning && 'text-grey-700'
      )}>
        {value}
      </span>
    </div>
  )
}

export default StrategyComparison
