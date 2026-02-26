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

// ── Gap-Driven Cohort Analysis Types ──────────────────────────────────

/** Denial rate statistics for a documentation gap cohort split */
export interface GapCohortStats {
  denial_rate_when_missing: number
  denial_rate_when_present: number
  impact_delta: number
  sample_size_missing: number
  sample_size_present: number
  approved_when_missing?: number
  denied_when_missing?: number
  approved_when_present?: number
  denied_when_present?: number
  payer_name?: string
}

/** Data availability status for a gap's historical cohort data */
export type GapDataStatus = 'sufficient' | 'no_missing_cases' | 'low_sample'

/** Per-gap analysis result from gap-driven cohort analysis */
export interface GapAnalysis {
  gap_id: string
  gap_description: string
  priority: string
  historical_doc_key: string
  data_status: GapDataStatus
  interpretation: string
  overall: GapCohortStats
  this_payer: GapCohortStats & { payer_name: string }
  other_payers: GapCohortStats
  by_payer: Array<{ payer_name: string; denial_rate_missing: number; sample_size: number }>
  top_denial_reasons: Array<{ reason: string; count: number; pct: number }>
  appeal_stats?: { total_appeals: number; successful_appeals: number }
  compensating_factors: Array<{
    pattern_type: string
    missing_documentation?: string
    description: string
    approval_uplift: number
    priority: string
    is_missing_in_current_case?: boolean
    current_case_has_compensation?: boolean
    current_compensating_factors?: string[]
    recommendation?: string
  }>
  severity_breakdown: Record<string, { denial_rate: number; sample_size: number }>
  time_trend: Array<{ period: string; denial_rate: number; sample_size: number }>
  /** Per-gap clinical differentiator analysis (PRPA) */
  gap_differentiators?: {
    status: string
    differentiating_insights?: Array<{
      insight_id: string
      category: string
      headline: string
      finding: string
      current_patient_status: 'at_risk' | 'favorable' | 'neutral'
      current_patient_detail: string
      evidence_strength: 'strong' | 'moderate' | 'weak'
      cases_supporting: number
      non_obvious_factor?: boolean
    }>
    actionable_recommendations?: Array<{
      priority: number
      action: string
      rationale: string
      expected_impact: string
    }>
    current_patient_position?: {
      favorable_factors: string[]
      at_risk_factors: string[]
      overall_summary: string
      estimated_cohort_match: number
    }
    hidden_patterns?: Array<{
      headline: string
      finding: string
      variables_involved: string[]
    }>
  }
}

/** LLM synthesis of multi-gap risk */
export interface GapCohortSynthesis {
  analysis_strategy?: string
  overall_risk_assessment: string
  hidden_insights?: Array<{
    headline: string
    finding: string
    gaps_involved: string[]
  }>
  patient_position_summary?: string
  gap_priority_ranking: Array<{ gap_id: string; rank: number; rationale: string }>
  recommended_actions: Array<{ action: string; rationale: string; expected_impact: string }>
}

/** Full gap-driven cohort analysis response */
export interface GapCohortAnalysisData {
  case_id: string
  status: string
  message?: string
  payer_name: string
  total_cohort_size: number
  gap_analyses: GapAnalysis[]
  llm_synthesis: GapCohortSynthesis
  filter_metadata: {
    available_payers: string[]
    available_severity_buckets: string[]
    date_range: { earliest: string; latest: string }
  }
  analysis_timestamp?: string
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
