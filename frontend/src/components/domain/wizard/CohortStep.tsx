/**
 * CohortStep (Step 2) - Historical cohort evidence validation
 *
 * Shows the full CohortInsightsPanel in non-embedded mode.
 * Auto-triggers cohort analysis on mount via the panel's self-fetch.
 * Includes processing animation for cached results.
 */

import { useState, useRef, useEffect } from 'react'
import { Users, ChevronRight } from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { CohortInsightsPanel } from '@/components/domain/CohortInsightsPanel'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { ReferenceInfoContent } from '@/components/domain/wizard/ReferenceInfoContent'
import { ProcessingAnimation, COHORT_ANALYSIS_STEPS } from '@/components/domain/wizard/ProcessingAnimation'
import type { CaseState } from '@/types/case'

interface CohortStepProps {
  caseState: CaseState
  onApprove: () => void
  isProcessing: boolean
  readOnly?: boolean
  onRefresh?: () => void
}

export function CohortStep({
  caseState,
  onApprove,
  isProcessing,
  readOnly = false,
  onRefresh,
}: CohortStepProps) {
  const refreshed = useRef(false)
  useEffect(() => {
    if (!refreshed.current && onRefresh) {
      refreshed.current = true
      onRefresh()
    }
  }, [onRefresh])

  // Processing animation: show for minimum time before revealing panel
  const [animationDone, setAnimationDone] = useState(readOnly)
  useEffect(() => {
    if (readOnly) return
    const timer = setTimeout(() => setAnimationDone(true), 4000)
    return () => clearTimeout(timer)
  }, [readOnly])

  return (
    <WizardStep
      title="Cohort Analysis"
      description={readOnly ? "Historical evidence from similar cases" : "Validating policy analysis with historical case evidence"}
      icon={<Users className="w-6 h-6" />}
      primaryAction={readOnly ? undefined : {
        label: 'Continue to AI Recommendation',
        onClick: onApprove,
        disabled: isProcessing || !animationDone,
        icon: <ChevronRight className="w-4 h-4" />,
      }}
      referenceInfo={{
        title: 'Patient & Medication Details',
        content: <ReferenceInfoContent caseState={caseState} />,
      }}
    >
      {/* Processing animation */}
      {!animationDone && (
        <ProcessingAnimation steps={COHORT_ANALYSIS_STEPS} isActive={true} />
      )}

      {/* Cohort panel — mounted hidden during animation so it prefetches data */}
      <div className={animationDone ? '' : 'hidden'}>
        <SectionErrorBoundary fallbackTitle="Failed to load cohort analysis">
          <CohortInsightsPanel
            caseId={caseState.case_id}
            patientId={caseState.patient?.patient_id}
            documentationGaps={caseState.documentation_gaps}
            payerName={caseState.patient?.primary_payer}
            embedded={false}
          />
        </SectionErrorBoundary>
      </div>
    </WizardStep>
  )
}
