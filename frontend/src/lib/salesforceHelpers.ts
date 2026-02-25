import type { CaseState } from '@/types/case'
import type { BackendCoverageStatus, CoverageAssessment } from '@/types/coverage'

export function formatCaseNumber(index: number): string {
  return String(1027 + index).padStart(8, '0')
}

export function generatePDIPool(medicationName: string, index: number): string {
  const prefix = (medicationName || 'MED').substring(0, 3).toUpperCase()
  return `${prefix}-${String(index + 1).padStart(3, '0')}`
}

export function getPrimaryAssessment(cs: CaseState): CoverageAssessment | null {
  if (!cs.coverage_assessments) return null
  const primaryPayer = cs.patient.primary_payer
  return cs.coverage_assessments[primaryPayer] ?? Object.values(cs.coverage_assessments)[0] ?? null
}

export function deriveEligibility(cs: CaseState): { label: string; color: string } {
  const assessment = getPrimaryAssessment(cs)
  if (!assessment) return { label: 'Pending', color: '#706E6B' }

  const status: BackendCoverageStatus | undefined = assessment.coverage_status
  switch (status) {
    case 'covered':
    case 'likely_covered':
      return { label: 'Eligible', color: '#2E844A' }
    case 'requires_pa':
    case 'conditional':
      return { label: 'Conditional', color: '#DD7A01' }
    case 'pend':
      return { label: 'Pend', color: '#DD7A01' }
    case 'not_covered':
      return { label: 'Not Eligible', color: '#EA001E' }
    case 'requires_human_review':
      return { label: 'Review Needed', color: '#DD7A01' }
    default:
      return { label: 'Pending', color: '#706E6B' }
  }
}

export function deriveImpact(cs: CaseState): { label: string; dotColor: string } {
  const assessment = getPrimaryAssessment(cs)
  if (!assessment) return { label: 'No Change', dotColor: '#706E6B' }

  const status = assessment.coverage_status
  if (status === 'not_covered') return { label: 'Negative', dotColor: '#EA001E' }
  if (status === 'requires_human_review') return { label: 'Review', dotColor: '#DD7A01' }
  if (status === 'conditional' || status === 'pend') return { label: 'Conditional', dotColor: '#DD7A01' }
  return { label: 'No Change', dotColor: '#2E844A' }
}

export function deriveRiskLevel(likelihood: number | undefined): string {
  if (likelihood === undefined || likelihood === null) return 'Pending'
  if (likelihood >= 0.7) return 'No Impact'
  if (likelihood >= 0.4) return 'At Risk'
  return 'Verdict Flip'
}

export function derivePlanType(payerName: string): string {
  const lower = (payerName || '').toLowerCase()
  if (lower.includes('medicare') || lower.includes('medicaid')) return 'Government'
  if (lower.includes('individual') || lower.includes('marketplace') || lower.includes('exchange')) return 'Individual and Family'
  return 'Employer'
}

export function formatApprovalLikelihood(likelihood: number | undefined): string {
  if (likelihood === undefined || likelihood === null) return '--'
  return `${(likelihood * 100).toFixed(2)}%`
}

export function derivePARequired(cs: CaseState): boolean {
  const assessment = getPrimaryAssessment(cs)
  if (!assessment) return false
  const status = assessment.coverage_status
  return status === 'requires_pa' || status === 'conditional' || status === 'pend'
}

export function derivePolicyVersion(_cs: CaseState): string {
  return 'v2'
}
