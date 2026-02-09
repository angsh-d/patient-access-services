import type { CaseState, CreateCaseInput, CaseStage, HumanDecisionAction } from './case'
import type { Strategy, SelectStrategyInput } from './strategy'
import type { CoverageAssessment, PolicyAnalysisInput } from './coverage'

/**
 * API Error structure
 */
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

// === Case Endpoints ===

/**
 * List cases response - returns full CaseState objects
 */
export interface ListCasesResponse {
  cases: CaseState[]
  total: number
  limit: number
  offset: number
}

/**
 * Get case response - backend returns CaseState directly
 */
export interface GetCaseResponse {
  case: CaseState
}

export interface CreateCaseRequest extends CreateCaseInput {}

/**
 * Create case response - backend returns CaseState directly
 */
export type CreateCaseResponse = CaseState

export interface ProcessCaseRequest {
  auto_advance?: boolean
}

/**
 * Process case response - backend returns CaseState directly
 */
export type ProcessCaseResponse = CaseState

// === Strategy Endpoints ===

export interface GetStrategiesResponse {
  strategies: Strategy[]
  recommended_id: string
}

export interface SelectStrategyRequest extends SelectStrategyInput {}

export interface SelectStrategyResponse {
  selected_strategy: Strategy
  case: CaseState
}

// === Policy Endpoints ===

export interface AnalyzePolicyRequest extends PolicyAnalysisInput {}

export interface AnalyzePolicyResponse {
  assessment: CoverageAssessment
}

// === Audit Trail (Decision Trace) ===

/**
 * Audit event from backend - maps to TraceEvent for display
 */
export interface AuditEvent {
  event_id: string
  case_id: string
  event_type: string
  timestamp: string
  decision_made: string
  reasoning: string
  stage: string
  actor: string
}

/**
 * Backend audit trail response
 */
export interface AuditTrailResponse {
  case_id: string
  event_count: number
  events: AuditEvent[]
  chain_valid: boolean
}

/**
 * Frontend-friendly trace event (transformed from AuditEvent)
 */
export interface TraceEvent {
  id: string
  timestamp: string
  event_type: 'decision' | 'action' | 'observation' | 'error'
  agent: string
  description: string
  reasoning?: string
  confidence?: number
  metadata?: Record<string, unknown>
}

/**
 * Transform backend AuditEvent to frontend TraceEvent
 */
export function auditEventToTraceEvent(event: AuditEvent): TraceEvent {
  // Map backend event_type to frontend event_type
  const eventTypeMap: Record<string, TraceEvent['event_type']> = {
    'stage_transition': 'action',
    'decision': 'decision',
    'analysis_complete': 'observation',
    'error': 'error',
    'strategy_generated': 'action',
    'policy_analyzed': 'observation',
  }

  return {
    id: event.event_id,
    timestamp: event.timestamp,
    event_type: eventTypeMap[event.event_type] || 'observation',
    agent: event.actor,
    description: event.decision_made,
    reasoning: event.reasoning,
  }
}

// === Human Decision Gate Endpoints ===

/**
 * Request to confirm a human decision at the decision gate
 * Follows Anthropic's prior-auth-review-skill pattern
 */
export interface ConfirmDecisionRequest {
  action: HumanDecisionAction
  reviewer_id: string
  reviewer_name?: string
  reason?: string
  notes?: string
}

/**
 * Response from confirm decision endpoint
 */
export type ConfirmDecisionResponse = CaseState

/**
 * Response from decision status check endpoint
 */
export interface DecisionStatusResponse {
  requires_decision: boolean
  reason?: string
  ai_recommendation?: string
  confidence?: number
  current_stage: CaseStage
  coverage_summary?: Record<string, unknown>
}

// === WebSocket Messages ===

/**
 * WebSocket message types — matches backend event names.
 * Backend uses "event" field; we normalize to "type" on receipt.
 */
export type WebSocketMessageType =
  | 'connected'
  | 'heartbeat'
  | 'stage_update'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_error'
  | 'status'
  | 'error'

export interface WebSocketMessage {
  /** Normalized event type (from backend "event" field) */
  type: WebSocketMessageType
  /** Original backend event name (for backward compat) */
  event?: string
  case_id?: string
  timestamp: string
  [key: string]: unknown
}

export interface StageUpdateMessage extends WebSocketMessage {
  type: 'stage_update'
  stage: string
  previous_stage?: string
  messages?: string[]
}

export interface ProcessingErrorMessage extends WebSocketMessage {
  type: 'processing_error'
  error: string
}

export interface PolicyUpdateNotification {
  event: 'policy_update'
  payer: string
  medication: string
  version: string
  extraction_quality?: string
  criteria_count?: number
  timestamp: string
}
