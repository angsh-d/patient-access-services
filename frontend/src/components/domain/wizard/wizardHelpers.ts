/**
 * Shared helper functions and types for wizard step components.
 *
 * These were originally inlined in CaseDetail.tsx and are now
 * extracted so every step component can import them without
 * circular dependencies.
 */

import type { CaseState, PayerState } from '@/types/case'
import type { CriterionResult } from '@/components/domain/AIAnalysisCard'

/** Get the full display name for a patient. */
export function getPatientName(patient: CaseState['patient']): string {
  return `${patient.first_name} ${patient.last_name}`
}

/** Return the primary payer state object, or null when not found. */
export function getPrimaryPayer(caseState: CaseState): PayerState | null {
  const primaryPayerName = caseState.patient.primary_payer
  return caseState.payer_states[primaryPayerName] || null
}

/**
 * Transform coverage assessment to AI criteria results for the primary payer.
 */
export function transformToCriteriaResults(caseState: CaseState): CriterionResult[] {
  const primaryPayerName = caseState.patient.primary_payer
  return transformToCriteriaResultsForPayer(caseState, primaryPayerName)
}

/**
 * Transform coverage assessment to AI criteria results for a specific payer.
 */
export function transformToCriteriaResultsForPayer(
  caseState: CaseState,
  payerName: string,
): CriterionResult[] {
  const assessment = caseState.coverage_assessments?.[payerName]
  const results: CriterionResult[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const criteriaDetails = (assessment as any)?.criteria_details ?? (assessment as any)?.criteria_assessments
  if (criteriaDetails && Array.isArray(criteriaDetails)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    criteriaDetails.forEach((detail: any, idx: number) => {
      results.push({
        id: `crit-${payerName}-${idx}`,
        name: detail.criterion_name || `Criterion ${idx + 1}`,
        status: detail.is_met === true || detail.met === true ? 'met' : detail.is_met === false || detail.met === false ? 'not_met' : detail.partial ? 'partial' : 'unknown',
        detail: detail.reasoning || detail.description,
        source: detail.source || detail.supporting_evidence?.join('; '),
        actionNeeded: detail.action_needed || (detail.gaps?.length ? detail.gaps.join('; ') : undefined),
      })
    })
  }

  // Add documentation gaps relevant to this payer
  if (caseState.documentation_gaps && caseState.documentation_gaps.length > 0) {
    caseState.documentation_gaps.forEach((gap, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gapType = (gap as any).gap_type || gap.description?.split(':')[0] || `Gap ${idx + 1}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requiredBy = (gap as any).required_by as string[] | undefined
      // Only include gaps relevant to this payer (or all gaps if no specific payer requirement)
      const isRelevant = !requiredBy || requiredBy.length === 0 || requiredBy.includes(payerName)
      if (isRelevant && !results.some(r => r.name.toLowerCase().includes(gapType.toLowerCase()))) {
        results.push({
          id: `gap-${payerName}-${idx}`,
          name: gapType,
          status: 'not_met',
          detail: gap.description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          actionNeeded: (gap as any).recommended_action || 'Provide missing documentation',
        })
      }
    })
  }

  return results
}
