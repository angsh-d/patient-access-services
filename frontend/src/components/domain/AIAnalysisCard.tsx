/**
 * AIAnalysisCard - Greyscale-first AI reasoning display
 *
 * Design Principles (Apple HIG-inspired):
 * - Greyscale-first: No semantic colors (green/amber/red)
 * - Typography-driven: Hierarchy through weight and size
 * - Minimal: Remove visual noise, focus on content
 * - Clear status: Use dots and text labels, not colored badges
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Circle,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CriterionResult {
  id: string
  name: string
  status: 'met' | 'partial' | 'not_met' | 'unknown'
  detail?: string
  source?: string
  actionNeeded?: string
}

export interface AIAnalysisCardProps {
  /** Agent type performing the analysis */
  agentType?: string
  /** Summary statement from AI */
  summary: string
  /** List of criteria evaluation results */
  criteria: CriterionResult[]
  /** AI's recommendation */
  recommendation: {
    action: 'approve' | 'pend' | 'deny' | 'review'
    label: string
    confidence: number // 0-1
  }
  /** Detailed reasoning (shown on expand) */
  detailedReasoning?: string
  /** Payer name */
  payerName?: string
  /** Policy name/ID */
  policyId?: string
  /** Callback when user wants to view source policy */
  onViewPolicy?: () => void
  /** Additional class name */
  className?: string
}

/**
 * Status indicator using greyscale dots
 */
function StatusDot({ status }: { status: CriterionResult['status'] }) {
  if (status === 'met') {
    return <CheckCircle className="w-4 h-4 text-grey-900 flex-shrink-0" />
  }
  return (
    <Circle
      className={cn(
        'w-4 h-4 flex-shrink-0',
        status === 'partial' && 'text-grey-500',
        status === 'not_met' && 'text-grey-300',
        status === 'unknown' && 'text-grey-200'
      )}
    />
  )
}

/**
 * Status label text
 */
function getStatusLabel(status: CriterionResult['status']): string {
  switch (status) {
    case 'met': return 'Satisfied'
    case 'partial': return 'Partial'
    case 'not_met': return 'Gap'
    case 'unknown': return 'Pending'
  }
}

export function AIAnalysisCard({
  agentType,
  summary,
  criteria,
  recommendation,
  detailedReasoning,
  payerName,
  policyId,
  onViewPolicy,
  className,
}: AIAnalysisCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [expandedCriterion, setExpandedCriterion] = useState<string | null>(null)

  const metCount = criteria.filter(c => c.status === 'met').length
  const partialCount = criteria.filter(c => c.status === 'partial').length
  const gapCount = criteria.filter(c => c.status === 'not_met').length
  const totalCount = criteria.length

  return (
    <div className={cn('rounded-xl border border-grey-200 bg-white overflow-hidden', className)}>
      {/* Minimal Header - Policy context only */}
      <div className="px-5 py-4 border-b border-grey-100">
        <div className="flex items-center justify-between">
          <div>
            {payerName && (
              <p className="text-sm font-medium text-grey-900">{payerName}</p>
            )}
            {policyId && (
              <p className="text-xs text-grey-500 font-mono mt-0.5">{policyId}</p>
            )}
            {agentType && !payerName && (
              <p className="text-sm font-medium text-grey-900">{agentType}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-grey-900 tabular-nums">
              {metCount}/{totalCount}
            </p>
            <p className="text-xs text-grey-500">criteria satisfied</p>
          </div>
        </div>
      </div>

      {/* Criteria Summary Bar */}
      <div className="px-5 py-3 bg-grey-50 border-b border-grey-100">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-grey-900" />
            <span className="text-grey-600">{metCount} satisfied</span>
          </span>
          {partialCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-grey-500" />
              <span className="text-grey-600">{partialCount} partial</span>
            </span>
          )}
          {gapCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-grey-300 ring-1 ring-grey-400" />
              <span className="text-grey-600">{gapCount} gaps</span>
            </span>
          )}
        </div>
      </div>

      {/* Criteria List - Clean, scannable */}
      <div className="divide-y divide-grey-100">
        {criteria.map((criterion) => {
          const isExpanded = expandedCriterion === criterion.id
          const hasDetails = criterion.detail || criterion.actionNeeded || criterion.source

          return (
            <div key={criterion.id} className="px-5">
              <button
                type="button"
                onClick={() => hasDetails && setExpandedCriterion(isExpanded ? null : criterion.id)}
                disabled={!hasDetails}
                className={cn(
                  'w-full py-3 flex items-start gap-3 text-left',
                  hasDetails && 'cursor-pointer hover:bg-grey-50 -mx-5 px-5'
                )}
              >
                <StatusDot status={criterion.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        'text-sm leading-tight',
                        criterion.status === 'met' ? 'text-grey-900' : 'text-grey-600'
                      )}
                    >
                      {criterion.name}
                    </span>
                    <span
                      className={cn(
                        'text-xs flex-shrink-0',
                        criterion.status === 'met' ? 'text-grey-900 font-medium' : 'text-grey-400'
                      )}
                    >
                      {getStatusLabel(criterion.status)}
                    </span>
                  </div>
                </div>
                {hasDetails && (
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-grey-400 transition-transform flex-shrink-0 mt-0.5',
                      isExpanded && 'rotate-90'
                    )}
                  />
                )}
              </button>

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && hasDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-3 pl-7 space-y-2">
                      {criterion.detail && (
                        <p className="text-xs text-grey-600">{criterion.detail}</p>
                      )}
                      {criterion.source && (
                        <p className="text-xs text-grey-500">
                          <span className="font-medium">Source:</span> {criterion.source}
                        </p>
                      )}
                      {criterion.actionNeeded && (
                        <p className="text-xs text-grey-700 bg-grey-100 px-2 py-1.5 rounded">
                          {criterion.actionNeeded}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Recommendation Footer */}
      <div className="px-5 py-4 border-t border-grey-200 bg-grey-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-grey-500 uppercase tracking-wider mb-1">
              Assessment
            </p>
            <p className="text-base font-semibold text-grey-900">
              {recommendation.label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-grey-500 mb-1">Confidence</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold text-grey-900 tabular-nums">
                {Math.round(recommendation.confidence * 100)}
              </span>
              <span className="text-sm text-grey-500">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary - Collapsible */}
      {summary && (
        <div className="border-t border-grey-200">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-grey-50 transition-colors"
          >
            <span className="text-sm text-grey-600">
              {showDetails ? 'Hide reasoning' : 'View reasoning'}
            </span>
            {showDetails ? (
              <ChevronDown className="w-4 h-4 text-grey-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-grey-400" />
            )}
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 space-y-3">
                  <p className="text-sm text-grey-700 leading-relaxed italic">
                    "{summary}"
                  </p>
                  {detailedReasoning && (
                    <p className="text-sm text-grey-600 leading-relaxed">
                      {detailedReasoning}
                    </p>
                  )}
                  {onViewPolicy && (
                    <button
                      type="button"
                      onClick={onViewPolicy}
                      className="flex items-center gap-2 text-sm text-grey-500 hover:text-grey-900 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      View source policy
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for inline display
 */
export function AIAnalysisCardCompact({
  summary,
  criteria,
  recommendation,
  className,
}: Pick<AIAnalysisCardProps, 'summary' | 'criteria' | 'recommendation' | 'className'>) {
  const metCount = criteria.filter(c => c.status === 'met').length
  const totalCount = criteria.length

  return (
    <div className={cn('p-4 rounded-lg border border-grey-200 bg-white', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-grey-900 tabular-nums">
            {metCount}/{totalCount}
          </span>
          <span className="text-sm text-grey-500">criteria met</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium text-grey-900">
            {Math.round(recommendation.confidence * 100)}%
          </span>
          <span className="text-xs text-grey-500 ml-1">{recommendation.label}</span>
        </div>
      </div>
      <p className="text-sm text-grey-600 line-clamp-2">{summary}</p>
    </div>
  )
}

export default AIAnalysisCard
