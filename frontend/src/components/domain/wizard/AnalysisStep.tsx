/**
 * AnalysisStep (Step 1) - AI policy analysis
 *
 * Shows:
 * - Payer toggle (when secondary payer exists)
 * - SSE streaming progress or static LLM analysis status
 * - Documentation gaps
 * - Collapsible policy criteria details
 * - Payer comparison card
 * - Re-analyze button
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Brain,
  ChevronRight,
  ChevronDown,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Database,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import {
  PayerComparisonCard,
  createPayerSummary,
} from '@/components/domain/PayerComparisonCard'
import { PolicyValidationCard } from '@/components/domain/PolicyValidationCard'
import { StreamingOutput } from '@/components/domain/StreamingOutput'
import { ChainOfThought } from '@/components/domain/ChainOfThought'
import type { ThoughtStep } from '@/components/domain/ChainOfThought'
import { ReferenceInfoContent } from '@/components/domain/wizard/ReferenceInfoContent'
import { ProcessingAnimation, POLICY_ANALYSIS_STEPS } from '@/components/domain/wizard/ProcessingAnimation'
import type { StageAnalysis } from '@/hooks/useCase'
import type { SSEStatus, SSEEvent } from '@/hooks/useSSEStream'
import type { CaseState } from '@/types/case'
import { cn } from '@/lib/utils'

interface AnalysisStepProps {
  caseState: CaseState
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  currentAnalysis: StageAnalysis | null
  onRunAnalysis: () => void
  onReAnalyze?: () => void
  onApprove: () => void
  isProcessing: boolean
  readOnly?: boolean
  onRefresh?: () => void
  sseStream?: {
    status: SSEStatus
    events: SSEEvent[]
    percent: number
    message: string
    error: string | null
    result: SSEEvent | null
  }
}

export function AnalysisStep({
  caseState,
  assessment: _assessment,
  currentAnalysis,
  onRunAnalysis,
  onReAnalyze,
  onApprove,
  isProcessing,
  readOnly = false,
  onRefresh,
  sseStream,
}: AnalysisStepProps) {
  // Force-refresh case data on mount to ensure we have the latest from backend
  const refreshed = useRef(false)
  useEffect(() => {
    if (!refreshed.current && onRefresh) {
      refreshed.current = true
      onRefresh()
    }
  }, [onRefresh])

  // Auto-trigger LLM analysis when step mounts if no analysis results exist
  const hasAnalysisResults = !!(caseState.coverage_assessments && Object.keys(caseState.coverage_assessments).length > 0)
  const analysisTriggered = useRef(false)
  const onRunAnalysisRef = useRef(onRunAnalysis)
  useEffect(() => { onRunAnalysisRef.current = onRunAnalysis }, [onRunAnalysis])

  useEffect(() => {
    if (!readOnly && !hasAnalysisResults && !isProcessing && !analysisTriggered.current) {
      analysisTriggered.current = true
      onRunAnalysisRef.current()
    }
  }, [readOnly, hasAnalysisResults, isProcessing])

  // Check for secondary payer
  const primaryPayerName = caseState.patient.primary_payer
  const secondaryPayerName = caseState.patient.secondary_payer
  const primaryAssessment = caseState.coverage_assessments?.[primaryPayerName]
  const secondaryAssessment = secondaryPayerName
    ? caseState.coverage_assessments?.[secondaryPayerName]
    : null
  const hasSecondaryPayer = !!secondaryPayerName && !!secondaryAssessment

  // State for toggling between payers in detailed view
  const [selectedPayer, setSelectedPayer] = useState<'primary' | 'secondary'>('primary')
  // State for collapsible policy criteria details
  const [criteriaDetailsExpanded, setCriteriaDetailsExpanded] = useState(false)

  // Get the currently selected payer's data
  const selectedPayerName = selectedPayer === 'primary' ? primaryPayerName : secondaryPayerName

  // Create payer summaries for comparison
  const primarySummary = createPayerSummary(primaryPayerName, true, primaryAssessment ?? null)
  const secondarySummary = secondaryPayerName
    ? createPayerSummary(secondaryPayerName, false, secondaryAssessment ?? null)
    : null

  const selectedAssessment = caseState.coverage_assessments?.[selectedPayerName || primaryPayerName]

  // Low-confidence criteria from analysis
  const lowConfCriteria = useMemo(
    () => currentAnalysis?.confidence_details?.low_confidence_criteria || [],
    [currentAnalysis?.confidence_details?.low_confidence_criteria]
  )

  // State for low-confidence banner collapse
  const [lowConfExpanded, setLowConfExpanded] = useState(true)

  // Build reasoning chain ThoughtSteps for the selected payer
  const effectivePayer = selectedPayerName || primaryPayerName
  const thoughtSteps: ThoughtStep[] = useMemo(() => {
    const chain = currentAnalysis?.reasoning_chains?.[effectivePayer] || []
    return chain.map((step: string, i: number) => {
      // Parse step titles like "[PolicyAnalyzer] Evidence gap..." -> "Evidence gap..."
      const titleMatch = step.match(/^\[.*?\]\s*(.+?)(?:\.|$)/)
      const title = titleMatch ? titleMatch[1] : step.slice(0, 60) + (step.length > 60 ? '...' : '')
      return {
        id: `${effectivePayer}-step-${i}`,
        stepNumber: i + 1,
        title,
        reasoning: step,
        source: { type: 'policy' as const, name: effectivePayer },
        status: 'complete' as const,
      }
    })
  }, [currentAnalysis?.reasoning_chains, currentAnalysis?.confidence, effectivePayer])

  // Format relative time from provenance timestamp (stable across re-renders)
  const provenanceTime = useMemo(() => {
    const ts = currentAnalysis?.provenance?.timestamp
    if (!ts) return null
    const diff = Date.now() - new Date(ts).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
    return `${Math.round(diff / 3600000)}h ago`
  }, [currentAnalysis?.provenance?.timestamp])

  return (
    <WizardStep
      title="Policy Analysis"
      description={readOnly ? "AI analysis results" : "AI analyzes payer policies and assesses coverage criteria"}
      icon={<Brain className="w-6 h-6" />}
      primaryAction={readOnly ? undefined : {
        label: 'Continue to Cohort Analysis',
        onClick: onApprove,
        disabled: isProcessing,
        icon: <ChevronRight className="w-4 h-4" />,
      }}
      referenceInfo={{
        title: 'Patient & Medication Details',
        content: <ReferenceInfoContent caseState={caseState} />,
      }}
    >
      {/* 1. Payer Toggle (if secondary payer exists) */}
      {hasSecondaryPayer && (
        <div className="flex items-center gap-2 p-1 bg-grey-100 rounded-lg w-fit mb-6">
          <button
            type="button"
            onClick={() => setSelectedPayer('primary')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all',
              selectedPayer === 'primary'
                ? 'bg-white text-grey-900 shadow-sm'
                : 'text-grey-600 hover:text-grey-900'
            )}
          >
            {primaryPayerName}
            <span className="ml-2 text-xs text-grey-500">Primary</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedPayer('secondary')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all',
              selectedPayer === 'secondary'
                ? 'bg-white text-grey-900 shadow-sm'
                : 'text-grey-600 hover:text-grey-900'
            )}
          >
            {secondaryPayerName}
            <span className="ml-2 text-xs text-grey-500">Secondary</span>
          </button>
        </div>
      )}

      {/* 2. LLM Analysis Status - SSE streaming or static fallback */}
      {sseStream && sseStream.status !== 'idle' && !hasAnalysisResults && (
        <div className="mb-6">
          <StreamingOutput
            status={sseStream.status}
            events={sseStream.events}
            percent={sseStream.percent}
            message={sseStream.message}
            error={sseStream.error}
          />
        </div>
      )}
      {isProcessing && !hasAnalysisResults && (!sseStream || sseStream.status === 'idle') && (
        <div className="mb-6">
          <ProcessingAnimation steps={POLICY_ANALYSIS_STEPS} isActive={true} />
        </div>
      )}

      {/* AI Analysis Summary (from LLM) */}
      {currentAnalysis && (
        <div className="mb-6 p-4 rounded-xl bg-grey-50 border border-grey-200">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-grey-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-grey-900">AI Analysis Complete</h4>
                {currentAnalysis.provenance && (
                  <span className="text-[11px] text-grey-400 flex items-center gap-1">
                    {currentAnalysis.provenance.is_cached ? (
                      <><Database className="w-3 h-3" /> Cached</>
                    ) : (
                      <>
                        {currentAnalysis.provenance.model && (
                          <span>{currentAnalysis.provenance.model}</span>
                        )}
                        {provenanceTime && <span>· {provenanceTime}</span>}
                      </>
                    )}
                  </span>
                )}
              </div>
              <p className="text-sm text-grey-700">{currentAnalysis.reasoning}</p>
              {currentAnalysis.recommendations && currentAnalysis.recommendations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {currentAnalysis.recommendations.map((rec: string, idx: number) => (
                    <li key={idx} className="text-xs text-grey-600 flex items-start gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-grey-500 flex-shrink-0 mt-0.5" />
                      {rec}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Low-confidence criteria warning */}
      {lowConfCriteria.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-grey-50 border border-grey-200">
          <button
            type="button"
            onClick={() => setLowConfExpanded(!lowConfExpanded)}
            className="w-full flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-grey-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-grey-900">
                  {lowConfCriteria.length} criteria assessed with low confidence (&lt;70%)
                </h4>
                {lowConfExpanded ? (
                  <ChevronDown className="w-4 h-4 text-grey-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-grey-400" />
                )}
              </div>
              {lowConfExpanded && (
                <ul className="mt-2 space-y-1.5">
                  {lowConfCriteria.map((c, idx) => (
                    <li key={idx} className="text-xs text-grey-600 flex items-start gap-1.5">
                      <span className="font-medium text-grey-700 shrink-0">
                        {c.criterion} ({Math.round(c.confidence * 100)}%):
                      </span>
                      <span className="line-clamp-2">{c.reasoning}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </button>
        </div>
      )}

      {/* 3. Documentation Gaps from AI Analysis (actionable -- visible by default) */}
      {caseState.documentation_gaps && caseState.documentation_gaps.length > 0 && (
        <div className="mt-6 p-4 rounded-xl bg-grey-50 border border-grey-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-grey-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-grey-900 mb-2">Documentation Gaps Identified</h4>
              <ul className="space-y-2">
                {caseState.documentation_gaps.map((gap, idx) => (
                  <li key={idx} className="text-sm text-grey-700 flex items-start gap-2">
                    <span className="flex items-center gap-1.5 mt-1 shrink-0">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (gap as any).priority === 'high' ? 'bg-grey-900' : 'bg-grey-400'
                      )} />
                      <span className="text-[10px] font-medium uppercase text-grey-500">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(gap as any).priority || 'medium'}
                      </span>
                    </span>
                    <span>{gap.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 5. Collapsible Policy Criteria Details (collapsed by default) */}
      <div className="mt-6 border border-grey-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCriteriaDetailsExpanded(!criteriaDetailsExpanded)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-grey-50 hover:bg-grey-100 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            {criteriaDetailsExpanded ? (
              <ChevronDown className="w-4 h-4 text-grey-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-grey-500" />
            )}
            <span className="text-sm font-semibold text-grey-900">
              Policy Criteria Details
            </span>
          </div>
        </button>
        {criteriaDetailsExpanded && (
          <div className="p-5 border-t border-grey-200 space-y-4">
            {thoughtSteps.length > 0 && (
              <ChainOfThought
                agentType="PolicyAnalyzer"
                agentLabel="Policy Analysis Reasoning"
                steps={thoughtSteps}
                summary={currentAnalysis?.reasoning}
                totalConfidence={currentAnalysis?.confidence}
              />
            )}
            <PolicyValidationCard
              patientId={(caseState.metadata?.source_patient_id || caseState.patient?.patient_id) as string}
              payerName={selectedPayerName || primaryPayerName}
              medicationName={caseState.medication.medication_name}
              coverageAssessment={selectedAssessment}
            />
          </div>
        )}
      </div>

      {/* Re-analyze button (if analysis was already done) */}
      {!readOnly && hasAnalysisResults && !isProcessing && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onReAnalyze ?? onRunAnalysis}
            className="text-xs text-grey-500 hover:text-grey-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-analyze policies
          </button>
        </div>
      )}

      {/* 6. Payer Comparison Summary (if secondary payer exists) */}
      {hasSecondaryPayer && secondarySummary && (
        <div className="mt-6">
          <PayerComparisonCard
            primaryPayer={primarySummary}
            secondaryPayer={secondarySummary}
            onViewDetails={(payerName) => {
              setSelectedPayer(payerName === primaryPayerName ? 'primary' : 'secondary')
            }}
          />
        </div>
      )}
    </WizardStep>
  )
}
