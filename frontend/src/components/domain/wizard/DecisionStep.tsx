/**
 * DecisionStep (Step 4) - Human decision and next steps
 *
 * Shows:
 * - AI recommendation summary from previous step
 * - Documentation gaps notice
 * - Decision notes textarea
 * - 3 clear action buttons: Submit to Payer, Return to Provider, Follow AI Recommendation
 * - Read-only decision summary when viewing completed case
 */

import {
  Brain,
  Send,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { Button } from '@/components/ui'
import {
  AIAnalysisCard,
  type CriterionResult,
} from '@/components/domain/AIAnalysisCard'
import type { CaseState, HumanDecision, HumanDecisionAction } from '@/types/case'
import { formatDate } from '@/lib/utils'

interface DecisionStepProps {
  caseState: CaseState
  criteriaResults: CriterionResult[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  decisionReason: string
  onReasonChange: (reason: string) => void
  onConfirmDecision: (action: HumanDecisionAction) => void
  isProcessing: boolean
  readOnly?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiRecommendation?: Record<string, any> | null
}

export function DecisionStep({
  caseState,
  criteriaResults,
  assessment,
  decisionReason,
  onReasonChange,
  onConfirmDecision,
  isProcessing,
  readOnly = false,
  aiRecommendation,
}: DecisionStepProps) {
  const confidence = assessment?.approval_likelihood || 0

  return (
    <WizardStep
      title="Human Decision Required"
      description="Review the AI recommendation and choose your next step"
      icon={<Brain className="w-6 h-6" />}
      referenceInfo={{
        title: 'AI Analysis Summary',
        content: (
          <AIAnalysisCard
            summary={
              assessment?.approval_likelihood_reasoning ||
              `${criteriaResults.filter(c => c.status === 'met').length} of ${criteriaResults.length} criteria met for ${caseState.patient.primary_payer}.`
            }
            criteria={criteriaResults}
            recommendation={{
              action: confidence > 0.7 ? 'approve' : confidence > 0.4 ? 'pend' : 'review',
              label: confidence > 0.7 ? 'Approve' : confidence > 0.4 ? 'Pend' : 'Review',
              confidence,
            }}
          />
        ),
        defaultExpanded: false,
      }}
    >
      <div className="space-y-6">
        {/* AI Recommendation Summary (from previous step) */}
        {aiRecommendation && (
          <div className="p-5 rounded-xl bg-grey-50 border border-grey-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-grey-900 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-grey-900">AI Recommendation</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 text-xs font-medium bg-grey-200 text-grey-800 rounded">
                    {((aiRecommendation.recommended_action as string) || 'submit_to_payer').replace(/_/g, ' ')}
                  </span>
                  {aiRecommendation.confidence && (
                    <span className="text-xs text-grey-500">
                      {Math.round((aiRecommendation.confidence as number) * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-grey-700">{aiRecommendation.summary as string}</p>
          </div>
        )}

        {/* Documentation Gaps Notice */}
        {caseState.documentation_gaps && caseState.documentation_gaps.length > 0 && (
          <div className="p-4 rounded-lg bg-grey-100 border border-grey-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-grey-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-grey-900">Documentation Gaps</h4>
                <ul className="mt-2 space-y-1">
                  {caseState.documentation_gaps.slice(0, 3).map((gap, idx) => (
                    <li key={idx} className="text-sm text-grey-700">
                      <span className="font-medium">{gap.gap_type}:</span> {gap.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Decision made summary (read-only view) */}
        {readOnly && caseState.human_decisions && caseState.human_decisions.length > 0 ? (
          <div className="p-4 rounded-lg bg-grey-50 border border-grey-200">
            <h4 className="text-sm font-semibold text-grey-900 mb-2">Decision Recorded</h4>
            {caseState.human_decisions.map((decision: HumanDecision, idx: number) => (
              <div key={idx} className="text-sm text-grey-600 space-y-1">
                <p><span className="font-medium">Action:</span> {(decision.action || 'approve').replace(/_/g, ' ')}</p>
                {decision.reviewer_id && <p><span className="font-medium">Reviewer:</span> {decision.reviewer_id}</p>}
                {decision.timestamp && <p><span className="font-medium">Time:</span> {formatDate(decision.timestamp)}</p>}
                {decision.notes && <p><span className="font-medium">Notes:</span> {decision.notes}</p>}
              </div>
            ))}
          </div>
        ) : readOnly ? (
          <div className="p-4 rounded-lg bg-grey-50 border border-grey-200">
            <p className="text-sm text-grey-500">Decision was approved during workflow processing.</p>
          </div>
        ) : (
          <>
            {/* Decision Notes */}
            <div>
              <label className="block text-sm font-medium text-grey-700 mb-2">
                Decision Notes (optional)
              </label>
              <textarea
                value={decisionReason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Enter your decision rationale..."
                className="w-full p-3 text-sm border border-grey-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-grey-900/20 resize-none"
                rows={3}
              />
            </div>

            {/* Decision Buttons — 3 clear actions */}
            <div className="space-y-3 pt-4 border-t border-grey-200">
              <Button
                variant="primary"
                onClick={() => onConfirmDecision('submit_to_payer')}
                disabled={isProcessing}
                className="w-full justify-center py-3"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Submit to Payer
              </Button>
              <Button
                variant="secondary"
                onClick={() => onConfirmDecision('return_to_provider')}
                disabled={isProcessing}
                className="w-full justify-center py-3"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Provider
              </Button>
              <Button
                variant="secondary"
                onClick={() => onConfirmDecision('follow_recommendation')}
                disabled={isProcessing}
                className="w-full justify-center py-3"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Follow AI Recommendation
              </Button>
            </div>
          </>
        )}
      </div>
    </WizardStep>
  )
}
