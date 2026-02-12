/**
 * CompletedStep - Comprehensive summary with clickable step sections
 *
 * Displayed when the case workflow reaches the "completed" stage.
 * Shows a success banner, final payer statuses, and summary cards
 * for each prior step that can be clicked to drill back in.
 */

import {
  FileText,
  Brain,
  ThumbsUp,
  Lightbulb,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { PayerStatusBadge } from '@/components/domain/PayerStatusBadge'
import type { CaseState } from '@/types/case'
import type { Strategy } from '@/types/strategy'
import { formatDate } from '@/lib/utils'

interface CompletedStepProps {
  caseState: CaseState
  strategies?: Strategy[]
  onViewStep?: (step: number) => void
}

export function CompletedStep({
  caseState,
  strategies = [],
  onViewStep,
}: CompletedStepProps) {
  const payerEntries = Object.entries(caseState.payer_states || {})
  const primaryAssessment = caseState.coverage_assessments?.[caseState.patient.primary_payer]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedStrategy = (caseState.available_strategies as any[])?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => s.strategy_id === caseState.selected_strategy_id
  )

  return (
    <WizardStep
      title="Case Complete"
      description="All steps have been completed successfully. Click any section to view details."
      icon={<CheckCircle2 className="w-6 h-6 text-grey-900" />}
    >
      {/* Success Banner */}
      <div className="p-6 rounded-xl bg-grey-900 text-white mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Workflow Complete</h3>
            <p className="text-sm text-grey-300">
              PA request processed successfully. Click the step indicators above or the sections below to review details.
            </p>
          </div>
        </div>

        {/* Final Payer Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {payerEntries.map(([payerName, payerState]) => (
            <div
              key={payerName}
              className="flex items-center justify-between p-3 bg-white/10 rounded-lg"
            >
              <span className="text-sm font-medium text-white">{payerName}</span>
              <PayerStatusBadge status={payerState.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Step Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Patient Review Summary */}
        <button
          onClick={() => onViewStep?.(0)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <FileText className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Patient Review</h4>
              <p className="text-xs text-grey-500">Step 1</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            <p>{caseState.patient.first_name} {caseState.patient.last_name} &middot; DOB {formatDate(caseState.patient.date_of_birth)}</p>
            <p>{caseState.medication.medication_name} &middot; {caseState.medication.dose}</p>
            <p className="text-xs text-grey-400">DX: {caseState.patient.diagnosis_codes.join(', ')}</p>
          </div>
        </button>

        {/* Policy Analysis Summary (includes cohort + AI analysis) */}
        <button
          onClick={() => onViewStep?.(1)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <Brain className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Policy Analysis</h4>
              <p className="text-xs text-grey-500">Step 2</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            {primaryAssessment ? (
              <>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p>Coverage: <span className="font-medium">{((primaryAssessment as any).coverage_status || 'assessed').replace(/_/g, ' ')}</span></p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p>Approval likelihood: <span className="font-medium">{Math.round(((primaryAssessment as any).approval_likelihood || 0) * 100)}%</span></p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p className="text-xs text-grey-400">{(primaryAssessment as any).criteria_met_count || 0} of {(primaryAssessment as any).criteria_total_count || 0} criteria met</p>
              </>
            ) : (
              <p>Policy analysis completed</p>
            )}
          </div>
        </button>

        {/* Decision Summary */}
        <button
          onClick={() => onViewStep?.(2)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <ThumbsUp className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Decision</h4>
              <p className="text-xs text-grey-500">Step 3</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            {caseState.human_decisions && caseState.human_decisions.length > 0 ? (
              <>
                <p>Action: <span className="font-medium capitalize">{caseState.human_decisions[0].action || 'approved'}</span></p>
                {caseState.human_decisions[0].reviewer_id && (
                  <p className="text-xs text-grey-400">By: {caseState.human_decisions[0].reviewer_id}</p>
                )}
              </>
            ) : (
              <p>Human decision recorded</p>
            )}
          </div>
        </button>

        {/* Strategy Summary */}
        <button
          onClick={() => onViewStep?.(3)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <Lightbulb className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Strategy</h4>
              <p className="text-xs text-grey-500">Step 4</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            {selectedStrategy ? (
              <>
                <p className="font-medium">{selectedStrategy.name}</p>
                <p className="text-xs text-grey-400 line-clamp-2">{selectedStrategy.description}</p>
              </>
            ) : strategies.length > 0 ? (
              <p className="font-medium">{strategies[0].name}</p>
            ) : (
              <p>Strategy selected and executed</p>
            )}
          </div>
        </button>
      </div>

      {/* Submission Details */}
      {payerEntries.some(([, state]) => state.reference_number) && (
        <div className="mt-4 p-4 rounded-xl border border-grey-200 bg-grey-50">
          <h4 className="text-sm font-semibold text-grey-900 mb-3">Submission Details</h4>
          <div className="space-y-2">
            {payerEntries.map(([payerName, payerState]) => (
              <div key={payerName} className="flex items-center justify-between text-sm">
                <span className="text-grey-600">{payerName}</span>
                <div className="flex items-center gap-3">
                  {payerState.reference_number && (
                    <span className="text-xs text-grey-400 font-mono">Ref: {payerState.reference_number}</span>
                  )}
                  {payerState.submitted_at && (
                    <span className="text-xs text-grey-400">Submitted: {formatDate(payerState.submitted_at)}</span>
                  )}
                  <PayerStatusBadge status={payerState.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WizardStep>
  )
}
