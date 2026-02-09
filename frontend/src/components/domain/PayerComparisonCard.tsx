/**
 * PayerComparisonCard - Side-by-side payer comparison for multi-payer cases
 *
 * Shows AI's comparative analysis of primary vs secondary insurance:
 * - Approval likelihood comparison
 * - Criteria met comparison
 * - Turnaround time comparison
 * - AI recommendation on optimal path
 *
 * Key demo value: Demonstrates multi-payer analysis capability
 */

import { motion } from 'framer-motion'
import {
  ArrowRightLeft,
  TrendingUp,
  Clock,
  CheckCircle2,
  Lightbulb,
  ChevronRight,
  Shield,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui'

export interface PayerAssessmentSummary {
  payerName: string
  isPrimary: boolean
  approvalLikelihood: number // 0-1
  criteriaMet: number
  criteriaTotal: number
  estimatedTurnaround?: string // e.g., "3-5 days"
  coverageStatus?: string // Backend BackendCoverageStatus: covered, likely_covered, requires_pa, conditional, pend, not_covered, requires_human_review, unknown
  keyIssue?: string // Primary blocker if any
}

interface PayerComparisonCardProps {
  primaryPayer: PayerAssessmentSummary
  secondaryPayer: PayerAssessmentSummary
  onViewDetails?: (payerName: string) => void
  className?: string
}

function getRecommendation(
  primary: PayerAssessmentSummary,
  secondary: PayerAssessmentSummary
): { text: string; recommendedPayer: string; reasoning: string } {
  const primaryScore = primary.approvalLikelihood
  const secondaryScore = secondary.approvalLikelihood
  const difference = Math.abs(primaryScore - secondaryScore)

  // Clear winner (>10% difference)
  if (difference > 0.1) {
    if (primaryScore > secondaryScore) {
      return {
        text: `${primary.payerName} has higher approval likelihood`,
        recommendedPayer: primary.payerName,
        reasoning: `Recommend submitting to ${primary.payerName} first. ${Math.round((primaryScore - secondaryScore) * 100)}% higher likelihood of approval.`,
      }
    } else {
      return {
        text: `${secondary.payerName} shows better coverage, but COB rules require primary-first`,
        recommendedPayer: primary.payerName,
        reasoning: `${secondary.payerName} has ${Math.round((secondaryScore - primaryScore) * 100)}% higher likelihood, but Coordination of Benefits rules require submitting to ${primary.payerName} (primary) first. Prepare stronger documentation for primary submission.`,
      }
    }
  }

  // Close call - default to primary
  return {
    text: 'Both payers show similar approval likelihood',
    recommendedPayer: primary.payerName,
    reasoning: `Approval likelihood is similar. Recommend standard approach: submit to ${primary.payerName} (primary) first.`,
  }
}

function LikelihoodBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 bg-grey-200 rounded-full overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', color)}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
}

function PayerColumn({
  payer,
  isRecommended,
  isWinner,
}: {
  payer: PayerAssessmentSummary
  isRecommended: boolean
  isWinner: boolean
}) {
  const likelihoodColor =
    payer.approvalLikelihood >= 0.7
      ? 'bg-semantic-success'
      : payer.approvalLikelihood >= 0.5
        ? 'bg-semantic-warning'
        : 'bg-semantic-error'

  return (
    <div className={cn('flex-1 p-4 rounded-lg', isRecommended ? 'bg-grey-50 ring-1 ring-grey-300' : 'bg-white')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-grey-500" />
          <span className="font-semibold text-grey-900">{payer.payerName}</span>
        </div>
        <Badge variant={payer.isPrimary ? 'neutral' : 'warning'} size="sm">
          {payer.isPrimary ? 'Primary' : 'Secondary'}
        </Badge>
      </div>

      {/* Approval Likelihood */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-grey-500">Approval Likelihood</span>
          <span className={cn('text-lg font-bold', isWinner ? 'text-semantic-success' : 'text-grey-700')}>
            {Math.round(payer.approvalLikelihood * 100)}%
          </span>
        </div>
        <LikelihoodBar value={payer.approvalLikelihood} color={likelihoodColor} />
      </div>

      {/* Criteria Met */}
      <div className="flex items-center justify-between py-2 border-t border-grey-100">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-grey-400" />
          <span className="text-sm text-grey-600">Criteria Met</span>
        </div>
        <span className="text-sm font-medium text-grey-900">
          {payer.criteriaMet}/{payer.criteriaTotal}
        </span>
      </div>

      {/* Turnaround */}
      {payer.estimatedTurnaround && (
        <div className="flex items-center justify-between py-2 border-t border-grey-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-grey-400" />
            <span className="text-sm text-grey-600">Turnaround</span>
          </div>
          <span className="text-sm font-medium text-grey-900">{payer.estimatedTurnaround}</span>
        </div>
      )}

      {/* Key Issue */}
      {payer.keyIssue && (
        <div className="mt-3 p-2 rounded bg-semantic-warning/10 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-semantic-warning flex-shrink-0 mt-0.5" />
          <span className="text-xs text-grey-700">{payer.keyIssue}</span>
        </div>
      )}

      {/* Recommended Badge */}
      {isRecommended && (
        <div className="mt-3 flex items-center justify-center gap-1 text-xs font-medium text-semantic-success">
          <TrendingUp className="w-3 h-3" />
          Recommended
        </div>
      )}
    </div>
  )
}

export function PayerComparisonCard({
  primaryPayer,
  secondaryPayer,
  onViewDetails,
  className,
}: PayerComparisonCardProps) {
  const recommendation = getRecommendation(primaryPayer, secondaryPayer)
  const primaryWins = primaryPayer.approvalLikelihood >= secondaryPayer.approvalLikelihood

  return (
    <div className={cn('rounded-xl border border-grey-200 overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-grey-50 border-b border-grey-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-grey-500" />
          <h3 className="text-sm font-semibold text-grey-900">Payer Comparison</h3>
          <Badge variant="info" size="sm">
            Multi-Payer Analysis
          </Badge>
        </div>
      </div>

      {/* Comparison Columns */}
      <div className="p-4 bg-white">
        <div className="flex gap-4">
          <PayerColumn
            payer={primaryPayer}
            isRecommended={recommendation.recommendedPayer === primaryPayer.payerName}
            isWinner={primaryWins}
          />
          <div className="flex items-center">
            <div className="w-px h-full bg-grey-200" />
          </div>
          <PayerColumn
            payer={secondaryPayer}
            isRecommended={recommendation.recommendedPayer === secondaryPayer.payerName}
            isWinner={!primaryWins}
          />
        </div>
      </div>

      {/* AI Recommendation */}
      <div className="px-5 py-4 bg-gradient-to-r from-grey-50 to-white border-t border-grey-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-grey-900 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-grey-900">{recommendation.text}</p>
            <p className="text-sm text-grey-600 mt-1">{recommendation.reasoning}</p>
          </div>
        </div>
      </div>

      {/* View Details Link */}
      {onViewDetails && (
        <button
          type="button"
          onClick={() => onViewDetails(secondaryPayer.payerName)}
          className="w-full flex items-center justify-between px-5 py-3 bg-grey-50 hover:bg-grey-100 transition-colors border-t border-grey-200"
        >
          <span className="text-sm font-medium text-grey-600">
            View {secondaryPayer.payerName} full analysis
          </span>
          <ChevronRight className="w-4 h-4 text-grey-400" />
        </button>
      )}
    </div>
  )
}

/**
 * Helper to create PayerAssessmentSummary from backend coverage assessment
 */
export function createPayerSummary(
  payerName: string,
  isPrimary: boolean,
  assessment: {
    approval_likelihood?: number
    criteria_met_count?: number
    criteria_total_count?: number
    coverage_status?: string
    estimated_turnaround?: string
  } | null
): PayerAssessmentSummary {
  if (!assessment) {
    return {
      payerName,
      isPrimary,
      approvalLikelihood: 0,
      criteriaMet: 0,
      criteriaTotal: 0,
    }
  }

  return {
    payerName,
    isPrimary,
    approvalLikelihood: assessment.approval_likelihood || 0,
    criteriaMet: assessment.criteria_met_count || 0,
    criteriaTotal: assessment.criteria_total_count || 0,
    estimatedTurnaround: assessment.estimated_turnaround,
    coverageStatus: assessment.coverage_status as PayerAssessmentSummary['coverageStatus'],
  }
}

export default PayerComparisonCard
