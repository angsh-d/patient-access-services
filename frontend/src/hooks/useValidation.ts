import { useQuery } from '@tanstack/react-query'
import { ENDPOINTS, QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'
import { request } from '@/services/api'

// --- Types matching backend PatientValidationResponse ---

export interface CodeValidation {
  code: string
  is_valid: boolean
  description?: string | null
  category?: string | null
  is_billable?: boolean
  errors: string[]
}

export interface HCPCSCodeValidation {
  code: string
  is_valid: boolean
  description?: string | null
  drug_name?: string | null
  billing_notes?: string | null
  status: 'validated' | 'needs_review' | 'invalid'
  errors: string[]
}

export interface NPIValidation {
  npi: string
  is_valid: boolean
  provider_name?: string | null
  specialty?: string | null
  credential?: string | null
  status: string
  errors: string[]
}

export interface CrossVerificationFinding {
  field: string
  status: 'consistent' | 'inconsistent' | 'needs_review'
  detail: string
}

export interface CrossVerificationResult {
  overall_status: 'passed' | 'warnings' | 'errors'
  findings: CrossVerificationFinding[]
}

export interface PatientValidationResult {
  patient_id: string
  overall_status: 'validated' | 'warnings' | 'errors'
  npi: NPIValidation | null
  icd10_codes: CodeValidation[]
  hcpcs_codes: HCPCSCodeValidation[]
  cross_verification: CrossVerificationResult | null
  validation_timestamp: string
}

/**
 * Hook to validate all clinical codes for a patient.
 * Calls POST /api/v1/validate/patient/{patientId}
 */
export function usePatientValidation(patientId: string | undefined) {
  const normalizedId = patientId?.trim() || undefined

  const query = useQuery({
    queryKey: QUERY_KEYS.patientValidation(normalizedId ?? ''),
    queryFn: async (): Promise<PatientValidationResult> => {
      if (!normalizedId) throw new Error('Patient ID is required')
      return request<PatientValidationResult>(ENDPOINTS.validatePatient(normalizedId), {
        method: 'POST',
      }, 120000) // 2 minute timeout for LLM-backed validation
    },
    enabled: !!normalizedId,
    staleTime: CACHE_TIMES.STATIC,
  })

  // Helper functions to look up validation status for specific codes
  const getICD10Status = (code: string): CodeValidation | undefined => {
    return query.data?.icd10_codes?.find(
      c => c.code.toUpperCase().replace('.', '') === code.toUpperCase().replace('.', '')
    )
  }

  const getNPIStatus = (): NPIValidation | null => {
    return query.data?.npi ?? null
  }

  const getHCPCSStatus = (code: string): HCPCSCodeValidation | undefined => {
    return query.data?.hcpcs_codes?.find(
      c => c.code.toUpperCase() === code.toUpperCase()
    )
  }

  return {
    ...query,
    getICD10Status,
    getNPIStatus,
    getHCPCSStatus,
  }
}
