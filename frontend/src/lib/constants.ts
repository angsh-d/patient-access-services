/**
 * API Configuration
 */
export const API_BASE_URL = '/api/v1'

function getWsBaseUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

/**
 * API Endpoints — PS only
 */
export const ENDPOINTS = {
  // Cases
  cases: `${API_BASE_URL}/cases`,
  case: (id: string) => `${API_BASE_URL}/cases/${id}`,
  processCase: (id: string) => `${API_BASE_URL}/cases/${id}/process`,
  caseAuditTrail: (id: string) => `${API_BASE_URL}/cases/${id}/audit-trail`,
  generateStrategies: (id: string) => `${API_BASE_URL}/cases/${id}/generate-strategies`,
  runStage: (id: string, stage: string) => `${API_BASE_URL}/cases/${id}/run-stage/${stage}`,
  approveStage: (id: string, stage: string) => `${API_BASE_URL}/cases/${id}/approve-stage/${stage}`,
  selectStrategy: (id: string) => `${API_BASE_URL}/cases/${id}/select-strategy`,
  confirmDecision: (id: string) => `${API_BASE_URL}/cases/${id}/confirm-decision`,
  decisionStatus: (id: string) => `${API_BASE_URL}/cases/${id}/decision-status`,

  // Strategies
  scoreStrategies: `${API_BASE_URL}/strategies/score`,
  strategyTemplates: `${API_BASE_URL}/strategies/templates`,

  // Policy read endpoints (used by CaseDetail for coverage display)
  analyzePolicy: `${API_BASE_URL}/policies/analyze`,
  availablePolicies: `${API_BASE_URL}/policies/available`,
  policyContent: (payer: string, medication: string) => `${API_BASE_URL}/policies/${payer}/${medication}`,
  policyCriteria: (payer: string, medication: string) => `${API_BASE_URL}/policies/criteria/${payer}/${medication}`,
  policyDigitized: (payer: string, medication: string) => `${API_BASE_URL}/policies/${payer}/${medication}/digitized`,

  // Patients
  patients: `${API_BASE_URL}/patients`,

  // WebSocket
  caseWs: (id: string) => `${getWsBaseUrl()}/cases/${id}`,
  notificationsWs: `${getWsBaseUrl()}/notifications`,

  // Activity Feed
  recentActivity: `${API_BASE_URL}/activity/recent`,
} as const

/**
 * Case Stages - must match backend CaseStage enum
 */
export const CASE_STAGES = [
  'intake',
  'policy_analysis',
  'awaiting_human_decision',
  'strategy_generation',
  'strategy_selection',
  'action_coordination',
  'monitoring',
  'recovery',
  'completed',
  'failed'
] as const

/**
 * Stage Display Names
 */
export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  intake: 'Intake',
  policy_analysis: 'Policy Analysis',
  awaiting_human_decision: 'Awaiting Human Decision',
  strategy_generation: 'Strategy Generation',
  strategy_selection: 'Strategy Selection',
  action_coordination: 'Action Coordination',
  monitoring: 'Monitoring',
  recovery: 'Recovery',
  completed: 'Completed',
  failed: 'Failed'
}

/**
 * Strategy Types
 */
export const STRATEGY_TYPES = {
  sequential_primary_first: 'Sequential (Primary First)',
  sequential_cigna_first: 'Sequential (Primary First)',
  sequential_uhc_first: 'Sequential (Primary First)',
  parallel: 'Sequential (Primary First)',
  optimized: 'Sequential (Primary First)'
} as const

/**
 * Payer Status Colors
 */
export const PAYER_STATUS_COLORS = {
  approved: 'success',
  denied: 'error',
  not_submitted: 'neutral',
  submitted: 'warning',
  pending_info: 'warning',
  under_review: 'warning',
  appeal_submitted: 'warning',
  appeal_approved: 'success',
  appeal_denied: 'error'
} as const

/**
 * Query Keys for React Query
 */
export const QUERY_KEYS = {
  cases: ['cases'] as const,
  case: (id: string) => ['case', id] as const,
  strategies: (caseId: string) => ['strategies', caseId] as const,
  strategicIntelligence: (caseId: string) => ['strategic-intelligence', caseId] as const,
  trace: (caseId: string) => ['trace', caseId] as const,
  decisionStatus: (caseId: string) => ['decision-status', caseId] as const,
  patientData: (patientId: string) => ['patient-data', patientId] as const,
  patientDocuments: (patientId: string) => ['patient-documents', patientId] as const,
  policies: ['policies'] as const,
  policyDigitized: (payer: string, medication: string) => ['policy', 'digitized', payer, medication] as const,
  policyCriteria: (payer: string, medication: string) => ['policy', 'criteria', payer, medication] as const,
  aiActivity: ['ai-activity'] as const,
} as const

// Re-export cache times from centralized query cache config
export { CACHE_TIMES } from './queryCache'

/**
 * Agent Types
 */
export const AGENT_TYPES = {
  intake: 'Intake Agent',
  policy_analyzer: 'Policy Analyzer',
  strategy_generator: 'Strategy Generator',
  action_coordinator: 'Action Coordinator',
  recovery: 'Recovery Agent',
  human_review: 'Human Review',
} as const

/**
 * Agent Colors
 */
export const AGENT_COLORS = {
  intake: {
    primary: 'blue-600',
    bg: 'blue-100',
    border: 'blue-200',
  },
  policy_analyzer: {
    primary: 'purple-600',
    bg: 'purple-100',
    border: 'purple-200',
  },
  strategy_generator: {
    primary: 'green-600',
    bg: 'green-100',
    border: 'green-200',
  },
  action_coordinator: {
    primary: 'orange-600',
    bg: 'orange-100',
    border: 'orange-200',
  },
  recovery: {
    primary: 'red-600',
    bg: 'red-100',
    border: 'red-200',
  },
  human_review: {
    primary: 'grey-600',
    bg: 'grey-100',
    border: 'grey-200',
  },
} as const

/**
 * Animation Variants for Framer Motion
 */
export const MOTION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
} as const

export const SPRING_CONFIG = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
} as const

export const EASE_CONFIG = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
} as const
