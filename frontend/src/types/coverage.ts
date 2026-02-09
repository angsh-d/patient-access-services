/**
 * Overall coverage status — matches backend CoverageStatus enum exactly.
 * Conservative decision model: AI never recommends denial.
 * NOT_COVERED and REQUIRES_HUMAN_REVIEW always need human review.
 */
export type BackendCoverageStatus =
  | 'covered'              // All criteria met
  | 'likely_covered'       // High confidence, may need PA
  | 'requires_pa'          // Coverage with prior auth
  | 'conditional'          // Coverage with specific conditions
  | 'pend'                 // Needs additional documentation (not denial)
  | 'not_covered'          // Policy doesn't cover — REQUIRES HUMAN REVIEW
  | 'requires_human_review' // AI cannot determine — human must decide
  | 'unknown'              // Insufficient information

/**
 * Criterion-level status for display (derived from backend is_met boolean)
 */
export type CriterionStatus = 'met' | 'not_met' | 'pending'

/** @deprecated Use BackendCoverageStatus for overall, CriterionStatus for criteria */
export type CoverageStatus = 'met' | 'not_met' | 'partial' | 'unknown'

/**
 * Documentation gap severity
 */
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * Individual criterion assessment
 */
export interface CriterionAssessment {
  // Backend-native fields (primary — from CriterionAssessment model)
  criterion_id?: string
  criterion_name?: string
  criterion_description?: string
  is_met?: boolean
  confidence: number
  supporting_evidence?: string[]
  gaps?: string[]
  reasoning?: string
  // Frontend-native fields (fallback aliases)
  id?: string
  name?: string
  description?: string
  status?: CriterionStatus | CoverageStatus
  evidence?: string[]
  missing_documentation?: string[]
  recommendation?: string
}

/**
 * Documentation gap detail
 * Matches backend DocumentationGap model
 */
export interface DocumentationGap {
  id?: string
  gap_id?: string
  description: string
  gap_type?: string
  severity?: GapSeverity
  priority?: string
  impact?: string
  required_action?: string
  suggested_action?: string
  required_for?: string[]
  source_criterion?: string
  estimated_resolution_time?: string
  estimated_resolution_complexity?: string
}

/**
 * Step therapy requirement
 */
export interface StepTherapyRequirement {
  step: number
  drug_name: string
  required_duration: string
  patient_status: 'completed' | 'in_progress' | 'not_started' | 'failed'
  documentation_available: boolean
  notes?: string
}

/**
 * Full coverage assessment
 * Matches backend CoverageAssessment model
 */
export interface CoverageAssessment {
  assessment_id?: string
  policy_id?: string
  policy_name?: string
  payer_name: string
  medication_name?: string
  assessment_date?: string
  // Status fields — backend sends coverage_status as BackendCoverageStatus
  overall_status?: CoverageStatus  // deprecated: use coverage_status
  coverage_status?: BackendCoverageStatus
  overall_confidence?: number
  approval_likelihood: number
  approval_likelihood_reasoning?: string
  // Criteria assessments
  criteria?: CriterionAssessment[]
  criteria_assessments?: CriterionAssessment[]
  criteria_met_count?: number
  criteria_total_count?: number
  // Gaps and therapy
  documentation_gaps: DocumentationGap[]
  step_therapy?: StepTherapyRequirement[]
  step_therapy_required?: boolean
  step_therapy_options?: string[]
  step_therapy_satisfied?: boolean
  // Recommendations
  recommendations: string[]
  estimated_decision_time?: string
  // Raw data
  raw_policy_text?: string
  llm_raw_response?: Record<string, unknown>
}

/**
 * Policy analysis request
 */
export interface PolicyAnalysisInput {
  case_id: string
  policy_id?: string
  include_alternatives?: boolean
}

/**
 * Policy summary for listing
 */
export interface PolicySummary {
  policy_id: string
  policy_name: string
  payer_name: string
  drug_covered: boolean
  requires_pa: boolean
  step_therapy_required: boolean
  criteria_count: number
}
