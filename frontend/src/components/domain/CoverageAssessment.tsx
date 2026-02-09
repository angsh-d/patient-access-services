import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, AlertCircle, HelpCircle, ChevronRight, ChevronDown, Brain } from 'lucide-react'
import { cn, formatPercent } from '@/lib/utils'
import { Card, Badge, Progress } from '@/components/ui'
// ProvenanceIndicator removed — evidence now displayed inline from Claude's assessment
import type { CoverageAssessment as CoverageAssessmentType, CriterionAssessment, CriterionStatus, BackendCoverageStatus } from '@/types/coverage'

interface CoverageAssessmentProps {
  assessment: CoverageAssessmentType
  className?: string
}

/**
 * Derive criterion display status from backend data.
 * Backend sends is_met (boolean), frontend needs met/not_met/pending.
 */
function deriveCriterionStatus(criterion: CriterionAssessment): CriterionStatus {
  // Prefer backend is_met boolean (direct from Claude)
  if (criterion.is_met === true) return 'met'
  if (criterion.is_met === false) return 'not_met'
  // Fall back to frontend status field
  if (criterion.status === 'met') return 'met'
  if (criterion.status === 'not_met') return 'not_met'
  return 'pending'
}

export function CoverageAssessment({ assessment, className }: CoverageAssessmentProps) {
  // Handle both criteria and criteria_assessments (backend uses criteria_assessments)
  const criteria = assessment.criteria ?? assessment.criteria_assessments ?? []
  const overallStatus = (assessment.coverage_status ?? assessment.overall_status ?? 'unknown') as BackendCoverageStatus

  const statusCounts = criteria.reduce(
    (acc, criterion) => {
      const s = deriveCriterionStatus(criterion)
      acc[s]++
      return acc
    },
    { met: 0, not_met: 0, pending: 0 }
  )

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Card */}
      <Card variant="elevated" padding="md">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-grey-900">
              {assessment.policy_name}
            </h3>
            <p className="text-sm text-grey-500">{assessment.payer_name}</p>
          </div>
          <OverallCoverageStatusBadge status={overallStatus} large />
        </div>

        {/* Approval likelihood with reasoning */}
        <ApprovalLikelihoodSection assessment={assessment} />

        {/* Criteria summary */}
        <div className="grid grid-cols-3 gap-3">
          <CriteriaSummaryBox
            label="Met"
            count={statusCounts.met}
            color="success"
          />
          <CriteriaSummaryBox
            label="Not Met"
            count={statusCounts.not_met}
            color="error"
          />
          <CriteriaSummaryBox
            label="Pending"
            count={statusCounts.pending}
            color="neutral"
          />
        </div>
      </Card>

      {/* Criteria List */}
      <div>
        <h4 className="text-sm font-medium text-grey-700 mb-3">
          Criteria Assessment
        </h4>
        <div className="space-y-2">
          {criteria.map((criterion, index) => (
            <CriterionCard key={criterion.criterion_id || criterion.id || `criterion-${index}`} criterion={criterion} index={index} />
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {(assessment.recommendations?.length ?? 0) > 0 && (
        <div>
          <h4 className="text-sm font-medium text-grey-700 mb-3">
            Recommendations
          </h4>
          <Card variant="default" padding="md">
            <ul className="space-y-2">
              {assessment.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-grey-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-grey-600">{rec}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

interface OverallCoverageStatusBadgeProps {
  status: BackendCoverageStatus | string
  large?: boolean
}

/**
 * Maps all 8 backend CoverageStatus values to visual treatment.
 * REQUIRES_HUMAN_REVIEW is prominent — the conservative decision model's key output.
 */
function OverallCoverageStatusBadge({ status, large }: OverallCoverageStatusBadgeProps) {
  const config: Record<string, { variant: 'success' | 'warning' | 'error' | 'neutral', label: string }> = {
    covered: { variant: 'success', label: 'Covered' },
    likely_covered: { variant: 'success', label: 'Likely Covered' },
    requires_pa: { variant: 'warning', label: 'Requires PA' },
    conditional: { variant: 'warning', label: 'Conditional' },
    pend: { variant: 'warning', label: 'Pend — Docs Needed' },
    not_covered: { variant: 'error', label: 'Human Review Required' },
    requires_human_review: { variant: 'error', label: 'Human Review Required' },
    unknown: { variant: 'neutral', label: 'Pending Analysis' },
    // Legacy frontend values
    met: { variant: 'success', label: 'Criteria Met' },
    not_met: { variant: 'error', label: 'Not Met' },
    partial: { variant: 'warning', label: 'Partially Met' },
  }

  const cfg = config[status] ?? { variant: 'neutral' as const, label: status?.replace(/_/g, ' ') || 'Unknown' }

  return (
    <Badge
      variant={cfg.variant}
      size={large ? 'md' : 'sm'}
      dot
    >
      {cfg.label}
    </Badge>
  )
}

interface CriteriaSummaryBoxProps {
  label: string
  count: number
  color: 'success' | 'warning' | 'error' | 'neutral'
}

function CriteriaSummaryBox({ label, count, color }: CriteriaSummaryBoxProps) {
  const colorClasses = {
    success: 'text-semantic-success',
    warning: 'text-semantic-warning',
    error: 'text-semantic-error',
    neutral: 'text-grey-500',
  }

  return (
    <div className="p-3 rounded-xl bg-grey-50 text-center">
      <div className={cn('text-xl font-semibold', colorClasses[color])}>
        {count}
      </div>
      <div className="text-xs text-grey-500">{label}</div>
    </div>
  )
}

interface CriterionCardProps {
  criterion: CriterionAssessment
  index: number
}

function CriterionCard({ criterion, index }: CriterionCardProps) {
  const [showDetail, setShowDetail] = useState(false)
  const displayStatus = deriveCriterionStatus(criterion)

  const statusIcons: Record<CriterionStatus, React.ReactNode> = {
    met: <Check className="w-4 h-4 text-semantic-success" />,
    not_met: <X className="w-4 h-4 text-semantic-error" />,
    pending: <HelpCircle className="w-4 h-4 text-grey-400" />,
  }

  const statusBg: Record<CriterionStatus, string> = {
    met: 'bg-semantic-success/10',
    not_met: 'bg-semantic-error/10',
    pending: 'bg-grey-100',
  }

  // Use backend field names with frontend fallbacks
  const criterionName = criterion.criterion_name || criterion.name
  const criterionDesc = criterion.criterion_description || criterion.description
  const reasoning = criterion.reasoning || criterion.recommendation
  const gaps = criterion.gaps || criterion.missing_documentation || []
  const evidence = criterion.supporting_evidence || criterion.evidence || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      <Card variant="default" padding="sm" className="overflow-hidden">
        <button
          onClick={() => setShowDetail(!showDetail)}
          className="w-full flex items-start gap-3 text-left"
        >
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            statusBg[displayStatus]
          )}>
            {statusIcons[displayStatus]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h5 className="text-sm font-medium text-grey-900 truncate">
                {criterionName}
              </h5>
              <div className="flex items-center gap-2">
                <span className="text-xs text-grey-500">
                  {formatPercent(criterion.confidence)} confident
                </span>
                <ChevronDown className={cn(
                  'w-4 h-4 text-grey-400 transition-transform',
                  showDetail && 'rotate-180'
                )} />
              </div>
            </div>
            <p className="text-xs text-grey-500 line-clamp-2">
              {criterionDesc}
            </p>
            {reasoning && !showDetail && (
              <p className="text-xs text-semantic-info mt-2 line-clamp-2">
                {reasoning}
              </p>
            )}
          </div>
        </button>

        {/* Expanded detail */}
        <AnimatePresence>
          {showDetail && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-grey-200 space-y-3">
                {/* AI Reasoning */}
                {reasoning && (
                  <div className="p-2 bg-grey-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Brain className="w-4 h-4 text-grey-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-grey-700 mb-1">AI Reasoning</p>
                        <p className="text-xs text-grey-600">{reasoning}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Evidence */}
                {evidence.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-grey-500 mb-1">Supporting Evidence</p>
                    <ul className="space-y-1">
                      {evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-grey-600">
                          <ChevronRight className="w-3 h-3 text-grey-400 mt-0.5 flex-shrink-0" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Gaps */}
                {gaps.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-semantic-error mb-1">Documentation Gaps</p>
                    <ul className="space-y-1">
                      {gaps.map((g, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-grey-600">
                          <AlertCircle className="w-3 h-3 text-semantic-error mt-0.5 flex-shrink-0" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

/**
 * ApprovalLikelihoodSection - Shows approval likelihood with Claude's reasoning.
 * Uses backend approval_likelihood_reasoning (from Claude) instead of fabricated text.
 */
function ApprovalLikelihoodSection({ assessment }: { assessment: CoverageAssessmentType }) {
  const [showReasoning, setShowReasoning] = useState(false)
  const metCount = assessment.criteria_met_count ?? 0
  const totalCount = assessment.criteria_total_count ?? 0
  const llmReasoning = assessment.approval_likelihood_reasoning

  return (
    <div className="mb-6">
      <button
        onClick={() => setShowReasoning(!showReasoning)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-grey-600">Approval Likelihood</span>
            {llmReasoning && (
              <Badge variant="neutral" size="sm" className="text-xs">
                Why?
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-grey-500">
              {metCount}/{totalCount} criteria met
            </span>
            <span className={cn(
              'text-lg font-semibold',
              (assessment.approval_likelihood ?? 0) >= 0.7 ? 'text-semantic-success' :
              (assessment.approval_likelihood ?? 0) >= 0.4 ? 'text-semantic-warning' :
              'text-semantic-error'
            )}>
              {formatPercent(assessment.approval_likelihood ?? 0)}
            </span>
            {llmReasoning && (
              <ChevronDown className={cn(
                'w-4 h-4 text-grey-400 transition-transform',
                showReasoning && 'rotate-180'
              )} />
            )}
          </div>
        </div>
      </button>

      <Progress
        value={(assessment.approval_likelihood ?? 0) * 100}
        variant={
          (assessment.approval_likelihood ?? 0) >= 0.7 ? 'success' :
          (assessment.approval_likelihood ?? 0) >= 0.4 ? 'warning' : 'error'
        }
        size="lg"
      />

      {/* Expanded reasoning — uses Claude's actual reasoning */}
      <AnimatePresence>
        {showReasoning && llmReasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 p-3 bg-grey-50 rounded-lg border border-grey-200">
              <div className="flex items-start gap-2">
                <Brain className="w-4 h-4 text-grey-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-grey-700 mb-1">AI Reasoning</p>
                  <p className="text-sm text-grey-700 leading-relaxed whitespace-pre-line">{llmReasoning}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default CoverageAssessment
