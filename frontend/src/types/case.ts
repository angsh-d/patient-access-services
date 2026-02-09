import { CoverageAssessment, DocumentationGap } from './coverage'
import { Strategy } from './strategy'

/**
 * Case stage in the workflow
 * Must match backend CaseStage enum
 */
export type CaseStage =
  | 'intake'
  | 'policy_analysis'
  | 'awaiting_human_decision'
  | 'strategy_generation'
  | 'strategy_selection'
  | 'action_coordination'
  | 'monitoring'
  | 'recovery'
  | 'completed'
  | 'failed'

/**
 * Human decision action types
 * Must match backend HumanDecisionAction
 */
export type HumanDecisionAction = 'approve' | 'reject' | 'override' | 'escalate'

/**
 * Human decision record - captures HITL decision at gates
 */
export interface HumanDecision {
  action: HumanDecisionAction
  reviewer_id: string
  reviewer_name?: string
  timestamp: string
  original_recommendation?: string
  override_reason?: string
  notes?: string
}

/**
 * Patient information - matches backend PatientInfo model
 */
export interface PatientInfo {
  patient_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  primary_payer: string
  primary_member_id: string
  secondary_payer?: string
  secondary_member_id?: string
  diagnosis_codes: string[]
  allergies: string[]
  contraindications: string[]
}

/**
 * Prior treatment record
 */
export interface PriorTreatment {
  medication_name: string
  generic_name: string
  dose: string
  frequency: string
  start_date: string
  end_date: string
  duration_weeks: number
  outcome: string
  reason_discontinued: string
  side_effects: string[]
}

/**
 * Supporting lab result
 */
export interface SupportingLab {
  test_name: string
  value: string
  unit: string
  reference_range: string
  date: string
  interpretation: string
}

/**
 * Medication request details - matches backend MedicationRequest model
 */
export interface MedicationRequest {
  medication_name: string
  generic_name: string
  ndc_code: string
  dose: string
  frequency: string
  route: string
  duration: string
  diagnosis: string
  icd10_code: string
  prescriber_npi: string
  prescriber_name: string
  clinical_rationale: string
  prior_treatments: PriorTreatment[]
  supporting_labs: SupportingLab[]
}

/**
 * Payer authorization status
 * Must match backend PayerStatus enum
 */
export type PayerStatus =
  | 'not_submitted'
  | 'submitted'
  | 'pending_info'
  | 'under_review'
  | 'approved'
  | 'denied'
  | 'appeal_submitted'
  | 'appeal_approved'
  | 'appeal_denied'

/**
 * Payer state for a single payer
 */
export interface PayerState {
  payer_name: string
  status: PayerStatus
  reference_number?: string | null
  submitted_at?: string | null
  last_updated?: string | null
  response_details?: string | null
  required_documents: string[]
  denial_reason?: string | null
  appeal_deadline?: string | null
}

/**
 * Full case state - matches backend CaseState model
 */
export interface CaseState {
  case_id: string
  version: number
  stage: CaseStage
  created_at: string
  updated_at: string
  patient: PatientInfo
  medication: MedicationRequest
  payer_states: Record<string, PayerState>
  selected_strategy_id?: string | null
  strategy_rationale?: string | null
  error_message?: string | null
  // HITL workflow data
  coverage_assessments?: Record<string, CoverageAssessment> | null
  available_strategies?: Strategy[] | null
  documentation_gaps?: DocumentationGap[] | null
  // Human decision gate fields (Anthropic skill pattern)
  requires_human_decision?: boolean
  human_decision_reason?: string | null
  human_decisions?: HumanDecision[]
  // Metadata from intake
  metadata?: {
    intake_timestamp?: string
    source_patient_id?: string
    validation_result?: Record<string, unknown>
    mcp_validation?: Record<string, unknown>
    [key: string]: unknown
  }
}

/**
 * Case list item (summary) - derived from CaseState for list display
 */
export interface CaseListItem {
  case_id: string
  patient_name: string
  medication: string
  stage: CaseStage
  payer_status: PayerStatus
  payer_name: string
  updated_at: string
  confidence: number
}

/**
 * Case creation input
 */
export interface CreateCaseInput {
  patient_id: string
}

/**
 * Helper to get full patient name
 */
export function getPatientFullName(patient: PatientInfo): string {
  return `${patient.first_name} ${patient.last_name}`
}

/**
 * Helper to get primary payer state
 */
export function getPrimaryPayerState(caseState: CaseState): PayerState | undefined {
  const primaryPayer = caseState.patient.primary_payer
  return caseState.payer_states[primaryPayer]
}
