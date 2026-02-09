import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'
import { request } from '@/services/api'

const API_BASE = '/api/v1'

/**
 * Patient data types reflecting the extracted JSON structure
 */
export interface PatientDemographics {
  first_name: string
  last_name: string
  date_of_birth: string
  age?: number
  gender?: string
  ethnicity?: string
  address?: {
    street: string
    city: string
    state: string
    zip: string
  }
  phone?: string
  mrn?: string
  source_document?: string
}

export interface InsuranceInfo {
  primary: {
    payer_name: string
    payer_id?: string
    plan_name?: string
    plan_type?: string
    member_id: string
    group_number?: string
    source_document?: string
  }
  secondary?: {
    payer_name: string
    member_id: string
  }
}

export interface PrescriberInfo {
  name: string
  credentials?: string
  npi: string
  specialty?: string
  practice_name?: string
  address?: {
    street: string
    city: string
    state: string
    zip: string
  }
  phone?: string
  fax?: string
  source_document?: string
}

export interface MedicationRequest {
  medication_name: string
  brand_name?: string
  j_code?: string
  dose: string
  route?: string
  frequency?: string | { induction?: string; maintenance?: string }
  duration_requested?: string
  quantity_requested?: string
  site_of_care?: string
  start_date_requested?: string
  source_document?: string
}

export interface Diagnosis {
  rank: 'primary' | 'secondary'
  icd10_code: string
  description: string
  status?: string
  source_document?: string
  coding_note?: string
}

export interface DiseaseActivity {
  assessment_date?: string
  cdai_score?: number
  cdai_interpretation?: string
  ses_cd_score?: number
  ses_cd_interpretation?: string
  harvey_bradshaw_index?: number
  hbi_interpretation?: string
  disease_severity?: string
  disease_phenotype?: string
  source_documents?: string[]
}

export interface PriorTreatment {
  medication_name: string
  brand_name?: string
  drug_class?: string
  dose?: string
  start_date?: string
  end_date?: string
  duration_weeks?: number
  outcome: string
  outcome_description?: string
  adequate_trial?: boolean
  reason_inadequate?: string
  adverse_event?: {
    type: string
    details?: string
    severity?: string
  }
  therapeutic_drug_monitoring?: {
    six_tgn?: { value: number; interpretation: string }
    six_mmp?: { value: number; interpretation: string }
    tpmt_genotype?: string
  }
  source_document?: string
}

export interface LabResult {
  test: string
  value: number | string
  unit: string
  reference_range: string
  flag?: 'H' | 'L' | null
  interpretation_note?: string
}

export interface LabPanel {
  panel_name: string
  results: LabResult[]
  clinical_interpretation?: string
}

export interface LaboratoryResults {
  collection_date?: string
  accession_number?: string
  ordering_provider?: string
  facility?: string
  facility_clia?: string
  report_status?: string
  source_document?: string
  panels?: Record<string, LabPanel>
  interpretation?: string
}

export interface ProcedureReport {
  procedure_type: string
  procedure_date?: string
  performing_provider?: string
  indication?: string
  findings_summary?: string
  segment_findings?: Record<string, string>
  specimens?: Array<{
    site: string
    container: string
    description: string
  }>
  pathology?: {
    pathologist?: string
    findings?: string
    diagnosis?: string
  }
  source_document?: string
}

export interface ImagingReport {
  modality: string
  study_date?: string
  indication?: string
  technique?: string
  comparison?: string
  findings_summary?: string
  detailed_findings?: Record<string, string>
  impression?: string
  source_document?: string
}

export interface PreBiologicScreening {
  status?: string
  source_document?: string
  // Support both naming conventions
  tb_screening?: {
    status: string
    test_type?: string
    result?: string
    date?: string
    required_tests?: string[]
    documentation_available?: boolean
  }
  tuberculosis_screening?: {
    status: string
    test_type?: string
    result?: string
    date?: string
    required_tests?: string[]
    documentation_available?: boolean
  }
  hepatitis_b_screening?: {
    status: string
    results?: Record<string, string>
    required_tests?: string[]
    documentation_available?: boolean
  }
  hepatitis_c_screening?: {
    status: string
    required_tests?: string[]
    documentation_available?: boolean
    note?: string
  }
}

export interface DocumentationGap {
  gap_id: string
  gap_type: string
  description: string
  required_by_policy?: boolean
  payers_requiring?: string[]
  impact?: string
  recommended_action?: string
}

export interface PAReadiness {
  status: string
  summary: string
  total_criteria?: number
  met_criteria?: number
  key_gaps?: string[]
}

export interface Correction {
  field: string
  old_value: unknown
  new_value: unknown
  reason?: string
  timestamp: string
}

/**
 * Full patient data structure
 */
export interface PatientData {
  patient_id: string
  extraction_metadata?: {
    extracted_from: string[]
    extraction_date: string
    extraction_method?: string
  }
  demographics: PatientDemographics
  insurance: InsuranceInfo
  prescriber: PrescriberInfo
  medication_request: MedicationRequest
  diagnoses: Diagnosis[]
  disease_activity?: DiseaseActivity
  clinical_history?: {
    chief_complaint?: string
    history_of_present_illness?: string
    er_visits_recent?: {
      count: number
      timeframe: string
      reason: string
    }
    surgical_history?: Array<{
      procedure?: string
      date?: string
      indication?: string
    }>
    source_document?: string
  }
  prior_treatments?: PriorTreatment[]
  laboratory_results?: LaboratoryResults
  procedures?: ProcedureReport[]
  imaging?: ImagingReport[]
  pre_biologic_screening?: PreBiologicScreening
  documentation_gaps?: DocumentationGap[]
  pa_criteria_assessment?: Record<string, unknown>
  overall_pa_readiness?: PAReadiness
  corrections?: Correction[]
}

export interface PatientDocument {
  filename: string
  path: string
  size_bytes: number
  document_type: string
}

export interface PatientDocumentsResponse {
  patient_id: string
  document_count: number
  documents: PatientDocument[]
}

/**
 * Hook to fetch full patient data (raw JSON)
 * Uses indefinite caching - patient data doesn't change during a session
 */
export function usePatientData(patientId: string | undefined) {
  // Normalize patientId to prevent cache key issues with empty strings
  const normalizedId = patientId && patientId.trim() ? patientId.trim() : undefined

  return useQuery({
    queryKey: QUERY_KEYS.patientData(normalizedId ?? ''),
    queryFn: async (): Promise<PatientData> => {
      if (!normalizedId) {
        throw new Error('Patient ID is required')
      }
      return request<PatientData>(`${API_BASE}/patients/${normalizedId}/data`)
    },
    enabled: !!normalizedId,
    // Indefinite caching - patient data is immutable during session
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    // Explicitly disable all automatic refetching
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Hook to fetch patient documents list
 * Uses indefinite caching - document list is static during session
 */
export function usePatientDocuments(patientId: string | undefined) {
  // Normalize patientId to prevent cache key issues with empty strings
  const normalizedId = patientId && patientId.trim() ? patientId.trim() : undefined

  return useQuery({
    queryKey: QUERY_KEYS.patientDocuments(normalizedId ?? ''),
    queryFn: async (): Promise<PatientDocumentsResponse> => {
      if (!normalizedId) {
        throw new Error('Patient ID is required')
      }
      return request<PatientDocumentsResponse>(`${API_BASE}/patients/${normalizedId}/documents`)
    },
    enabled: !!normalizedId,
    // Indefinite caching - document list is immutable during session
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    // Explicitly disable all automatic refetching
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Hook to update a patient data field
 */
export function useUpdatePatientField(patientId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { section: string; value: string; reason?: string }) => {
      const searchParams = new URLSearchParams()
      searchParams.set('section', params.section)
      searchParams.set('value', params.value)
      if (params.reason) {
        searchParams.set('reason', params.reason)
      }

      return request<unknown>(
        `${API_BASE}/patients/${patientId}/data?${searchParams.toString()}`,
        { method: 'PATCH' }
      )
    },
    onSuccess: () => {
      // Invalidate patient data cache to reflect the update
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.patientData(patientId) })
    },
  })
}

/**
 * Get document URL for a patient
 */
export function getPatientDocumentUrl(patientId: string, filename: string): string {
  return `${API_BASE}/patients/${patientId}/documents/${filename}`
}
