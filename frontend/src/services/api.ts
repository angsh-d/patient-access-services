import { ENDPOINTS } from '@/lib/constants'
import type {
  ApiError,
  ListCasesResponse,
  GetCaseResponse,
  CreateCaseRequest,
  CreateCaseResponse,
  ProcessCaseRequest,
  ProcessCaseResponse,
  GetStrategiesResponse,
  AnalyzePolicyRequest,
  AnalyzePolicyResponse,
  AuditTrailResponse,
  PaginationParams,
  ConfirmDecisionRequest,
  ConfirmDecisionResponse,
  DecisionStatusResponse,
} from '@/types/api'

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000

/**
 * Stage analysis response from HITL workflow
 */
export interface StageAnalysisResponse {
  stage: string
  reasoning: string
  confidence: number
  findings: Array<{
    title: string
    detail: string
    status: 'positive' | 'negative' | 'neutral' | 'warning'
  }>
  recommendations: string[]
  warnings?: string[]
  // Stage-specific data
  assessments?: Record<string, unknown>
  strategies?: unknown[]
  recommended_id?: string
  payer_states?: Record<string, unknown>
}

/**
 * Custom error class for API errors
 */
export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
    public isRetryable: boolean = false
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/**
 * Determine if an error is retryable based on status code
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

/**
 * Base fetch wrapper with error handling and timeout
 */
async function request<T>(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    })

    if (!response.ok) {
      let error: ApiError
      try {
        const errorBody = await response.json()
        error = {
          code: errorBody.code || `HTTP_${response.status}`,
          message: errorBody.detail || errorBody.message || response.statusText,
          details: errorBody.details,
        }
      } catch {
        error = {
          code: `HTTP_${response.status}`,
          message: response.statusText,
        }
      }
      throw new ApiRequestError(
        error.code,
        error.message,
        error.details,
        isRetryableStatus(response.status)
      )
    }

    // Handle 204 No Content and empty responses
    if (response.status === 204) {
      return undefined as unknown as T
    }
    const text = await response.text()
    if (!text) {
      throw new ApiRequestError('EMPTY_RESPONSE', 'Server returned an empty response')
    }

    return JSON.parse(text) as T
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiRequestError('TIMEOUT', 'Request timed out', undefined, true)
    }
    if (error instanceof TypeError) {
      // Network error
      throw new ApiRequestError('NETWORK_ERROR', 'Network request failed', undefined, true)
    }
    throw new ApiRequestError('UNKNOWN', 'An unexpected error occurred')
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Build URL with query parameters
 */
function buildUrl(base: string, params?: Record<string, unknown>): string {
  if (!params) return base

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  }

  const queryString = searchParams.toString()
  return queryString ? `${base}?${queryString}` : base
}

// Export base request function for hooks that need direct access
export { request }

// === Patient API ===

export const patientsApi = {
  getData: (patientId: string): Promise<unknown> => {
    return request<unknown>(`${ENDPOINTS.cases.replace('/cases', '')}/patients/${patientId}/data`)
  },
  getDocuments: (patientId: string): Promise<unknown> => {
    return request<unknown>(`${ENDPOINTS.cases.replace('/cases', '')}/patients/${patientId}/documents`)
  },
}

// === Activity API ===

export const activityApi = {
  getRecent: (): Promise<{ activities: unknown[]; total: number }> => {
    return request<{ activities: unknown[]; total: number }>(ENDPOINTS.recentActivity)
  },
}

// === Case API ===

export const casesApi = {
  /**
   * List all cases with optional pagination
   */
  list: (params?: PaginationParams): Promise<ListCasesResponse> => {
    return request<ListCasesResponse>(buildUrl(ENDPOINTS.cases, params as Record<string, unknown>))
  },

  /**
   * Get a single case by ID
   * Note: Backend returns CaseState directly, we wrap it for consistency
   */
  get: async (caseId: string): Promise<GetCaseResponse> => {
    const caseState = await request<import('@/types/case').CaseState>(ENDPOINTS.case(caseId))
    return { case: caseState }
  },

  /**
   * Create a new case
   */
  create: (data: CreateCaseRequest): Promise<CreateCaseResponse> => {
    return request<CreateCaseResponse>(ENDPOINTS.cases, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * Process a case (advance to next stage)
   */
  process: (caseId: string, data?: ProcessCaseRequest): Promise<ProcessCaseResponse> => {
    return request<ProcessCaseResponse>(ENDPOINTS.processCase(caseId), {
      method: 'POST',
      body: JSON.stringify(data || {}),
    })
  },

  /**
   * Get audit trail (decision trace) for a case
   */
  getAuditTrail: (caseId: string): Promise<AuditTrailResponse> => {
    return request<AuditTrailResponse>(ENDPOINTS.caseAuditTrail(caseId))
  },

  /**
   * Run a single workflow stage (HITL support)
   * Returns agent analysis with reasoning, findings, and recommendations
   * @param refresh - If true, forces fresh LLM call bypassing cached results
   */
  runStage: (caseId: string, stage: string, refresh?: boolean): Promise<StageAnalysisResponse> => {
    const url = refresh
      ? buildUrl(ENDPOINTS.runStage(caseId, stage), { refresh: 'true' })
      : ENDPOINTS.runStage(caseId, stage)
    return request<StageAnalysisResponse>(url, {
      method: 'POST',
    }, 120000) // 2 minute timeout for LLM calls
  },

  /**
   * Approve a stage and advance to next (HITL approval gate)
   */
  approveStage: (caseId: string, stage: string): Promise<ProcessCaseResponse> => {
    return request<ProcessCaseResponse>(ENDPOINTS.approveStage(caseId, stage), {
      method: 'POST',
    })
  },

  /**
   * Select a strategy for the case (human override or approval)
   */
  selectStrategy: (caseId: string, strategyId: string): Promise<ProcessCaseResponse> => {
    return request<ProcessCaseResponse>(
      buildUrl(ENDPOINTS.selectStrategy(caseId), { strategy_id: strategyId }),
      { method: 'POST' }
    )
  },

  /**
   * Confirm a human decision at the decision gate.
   * Following Anthropic's prior-auth-review-skill pattern:
   * - AI recommends APPROVE or PEND only (never auto-DENY)
   * - Human must explicitly confirm, reject, or override
   */
  confirmDecision: (caseId: string, data: ConfirmDecisionRequest): Promise<ConfirmDecisionResponse> => {
    return request<ConfirmDecisionResponse>(
      ENDPOINTS.confirmDecision(caseId),
      {
        method: 'POST',
        body: JSON.stringify({
          action: data.action,
          reviewer_id: data.reviewer_id,
          reviewer_name: data.reviewer_name,
          reason: data.reason,
          notes: data.notes,
        }),
      }
    )
  },

  /**
   * Check if a case requires human decision
   */
  checkDecisionStatus: (caseId: string): Promise<DecisionStatusResponse> => {
    return request<DecisionStatusResponse>(ENDPOINTS.decisionStatus(caseId))
  },
}

// === Strategy API ===

/**
 * Backend strategy score response
 */
interface BackendStrategyScoreResponse {
  case_id: string
  strategies: Array<{
    strategy_id: string  // UUID from backend
    strategy_type: string  // e.g., 'sequential_cigna_first'
    name: string
    description: string
    payer_sequence: string[]
    parallel_submission: boolean
    base_speed_score: number
    base_approval_score: number
    rationale: string
    risk_factors: string[]
  }>
  scores: Array<{
    strategy_id: string
    case_id: string
    rank: number
    total_score: number
    speed_score: number
    approval_score: number
    rework_score: number
    patient_score: number
    adjustments: Record<string, number>
    is_recommended: boolean
    recommendation_reasoning?: string
  }>
  recommended?: {
    strategy_id: string
    is_recommended: boolean
    recommendation_reasoning?: string
  }
  comparison: Record<string, unknown>
}

export const strategiesApi = {
  /**
   * Get scored strategies for a case
   * Note: Backend uses POST /strategies/score
   */
  get: async (caseId: string): Promise<GetStrategiesResponse> => {
    const response = await request<BackendStrategyScoreResponse>(ENDPOINTS.scoreStrategies, {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId }),
    })

    // Transform backend response to frontend format
    const strategies = response.strategies.map((strat, index) => {
      const score = response.scores.find(s => s.strategy_id === strat.strategy_id) || response.scores[index]
      return {
        id: strat.strategy_id,  // Use actual UUID from backend
        type: strat.strategy_type as import('@/types/strategy').StrategyType,
        name: strat.name,
        description: strat.description,
        is_recommended: score?.is_recommended || false,
        score: {
          total_score: (score?.total_score || 0) / 10, // Normalize to 0-1
          approval_probability: (score?.approval_score || 0) / 10,
          days_to_therapy: Math.round((1 - (score?.speed_score || 0) / 10) * 10) + 3, // Rough estimate
          rework_risk: 1 - (score?.rework_score || 0) / 10,
          cost_efficiency: (score?.patient_score || 0) / 10,
          criteria: [],
        },
        actions: [],
        estimated_days: Math.round((1 - (score?.speed_score || 0) / 10) * 10) + 3,
        confidence_range: {
          low: Math.max(0, (score?.approval_score || 0) / 10 - 0.1),
          high: Math.min(1, (score?.approval_score || 0) / 10 + 0.1),
        },
        risks: strat.risk_factors,
        advantages: [strat.rationale],
      }
    })

    const recommendedId = response.recommended?.strategy_id ||
      response.scores.find(s => s.is_recommended)?.strategy_id ||
      (strategies.length > 0 ? strategies[0].id : '')

    return {
      strategies,
      recommended_id: recommendedId,
    }
  },

  /**
   * Get strategy templates
   */
  getTemplates: (): Promise<{ templates: unknown[] }> => {
    return request<{ templates: unknown[] }>(ENDPOINTS.strategyTemplates)
  },
}

// === Policy API ===

export const policiesApi = {
  /**
   * Analyze policy coverage for a case
   */
  analyze: (data: AnalyzePolicyRequest): Promise<AnalyzePolicyResponse> => {
    return request<AnalyzePolicyResponse>(ENDPOINTS.analyzePolicy, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

/**
 * Combined API client
 */
export const api = {
  cases: casesApi,
  strategies: strategiesApi,
  policies: policiesApi,
}

export default api
