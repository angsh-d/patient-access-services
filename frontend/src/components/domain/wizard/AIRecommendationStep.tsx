/**
 * AIRecommendationStep (Step 3) - Synthesized AI recommendation
 *
 * Displays the AI's synthesized recommendation combining policy analysis
 * and cohort evidence. Auto-triggers ai_recommendation stage on mount
 * if no results exist.
 */

import { useRef, useEffect } from 'react'
import {
  Sparkles,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  FileText,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { ReferenceInfoContent } from '@/components/domain/wizard/ReferenceInfoContent'
import { ProcessingAnimation, AI_RECOMMENDATION_STEPS } from '@/components/domain/wizard/ProcessingAnimation'
import type { StageAnalysis } from '@/hooks/useCase'
import type { CaseState } from '@/types/case'
import { cn } from '@/lib/utils'

interface AIRecommendationStepProps {
  caseState: CaseState
  currentAnalysis: StageAnalysis | null
  onRunRecommendation: () => void
  onApprove: () => void
  isProcessing: boolean
  readOnly?: boolean
  onRefresh?: () => void
}

export function AIRecommendationStep({
  caseState,
  currentAnalysis,
  onRunRecommendation,
  onApprove,
  isProcessing,
  readOnly = false,
  onRefresh,
}: AIRecommendationStepProps) {
  const refreshed = useRef(false)
  useEffect(() => {
    if (!refreshed.current && onRefresh) {
      refreshed.current = true
      onRefresh()
    }
  }, [onRefresh])

  // Auto-trigger AI recommendation on mount if no results
  const triggered = useRef(false)
  const onRunRef = useRef(onRunRecommendation)
  useEffect(() => { onRunRef.current = onRunRecommendation }, [onRunRecommendation])

  useEffect(() => {
    if (!currentAnalysis && !isProcessing && !triggered.current) {
      triggered.current = true
      onRunRef.current()
    }
  }, [currentAnalysis, isProcessing])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recommendation = (currentAnalysis as any)?.recommendation as Record<string, unknown> | undefined

  return (
    <WizardStep
      title="AI Recommendation"
      description={readOnly ? "Synthesized recommendation from AI" : "AI synthesizes policy analysis and cohort evidence into a recommendation"}
      icon={<Sparkles className="w-6 h-6" />}
      primaryAction={readOnly ? undefined : {
        label: 'Continue to Decision',
        onClick: onApprove,
        disabled: isProcessing || !currentAnalysis,
        icon: <ChevronRight className="w-4 h-4" />,
      }}
      referenceInfo={{
        title: 'Patient & Medication Details',
        content: <ReferenceInfoContent caseState={caseState} />,
      }}
    >
      {/* Loading state with step-by-step animation */}
      {isProcessing && !currentAnalysis && (
        <ProcessingAnimation steps={AI_RECOMMENDATION_STEPS} isActive={true} />
      )}

      {/* Recommendation content */}
      {currentAnalysis && (
        <div className="space-y-4">
          {/* Recommended action banner */}
          {recommendation && (
            <div className={cn(
              'p-5 rounded-xl border',
              (recommendation.recommended_action as string) === 'submit_to_payer'
                ? 'bg-grey-50 border-grey-300'
                : 'bg-grey-50 border-grey-200'
            )}>
              <div className="flex items-start gap-3">
                {(recommendation.recommended_action as string) === 'submit_to_payer' ? (
                  <CheckCircle className="w-5 h-5 text-grey-700 flex-shrink-0 mt-0.5" />
                ) : (
                  <ArrowLeft className="w-5 h-5 text-grey-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-grey-900">
                      Recommended: {((recommendation.recommended_action as string) || 'submit_to_payer').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </h4>
                    {typeof recommendation.confidence === 'number' && (
                      <span className="text-xs font-medium px-2 py-0.5 bg-grey-200 text-grey-700 rounded">
                        {Math.round(recommendation.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-grey-700">{String(recommendation.summary || '')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Evidence items */}
          {(() => {
            const evidenceItems = (Array.isArray(recommendation?.evidence) ? recommendation.evidence as Array<Record<string, string>> : []).slice(0, 4)
            if (evidenceItems.length === 0) return null
            return (
              <div className="p-4 rounded-xl bg-white border border-grey-200">
                <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider mb-3">Supporting Evidence</h4>
                <div className="space-y-2">
                  {evidenceItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-grey-50 rounded-lg">
                      <FileText className="w-4 h-4 text-grey-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-grey-900">{String(item.label || '')}</p>
                        <p className="text-xs text-grey-600 mt-0.5">{String(item.detail || '')}</p>
                        {item.source && (
                          <span className="text-xs text-grey-400 mt-1 inline-block">
                            Source: {String(item.source).replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Risk factors */}
          {currentAnalysis.warnings && currentAnalysis.warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-grey-50 border border-grey-200">
              <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider mb-3">Risk Factors</h4>
              <div className="space-y-2">
                {currentAnalysis.warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-grey-700">
                    <AlertTriangle className="w-4 h-4 text-grey-400 flex-shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Provider actions needed (if return_to_provider) */}
          {(() => {
            const actions = (Array.isArray(recommendation?.provider_actions) ? recommendation.provider_actions as string[] : []).slice(0, 4)
            if (actions.length === 0) return null
            return (
              <div className="p-4 rounded-xl bg-grey-50 border border-grey-300">
                <h4 className="text-xs font-medium text-grey-500 uppercase tracking-wider mb-3">Provider Actions Needed</h4>
                <ul className="space-y-2">
                  {actions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-grey-700">
                      <span className="w-5 h-5 rounded-full bg-grey-900 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span>{String(action)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}
        </div>
      )}
    </WizardStep>
  )
}
