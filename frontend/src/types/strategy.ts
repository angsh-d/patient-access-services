/**
 * Strategy type
 * Must match backend StrategyType enum
 *
 * IMPORTANT: Only sequential_primary_first is valid for PA submissions.
 * - Never submit in parallel (causes COB coordination issues)
 * - Never submit to secondary before primary (violates insurance rules)
 *
 * Legacy types kept for backwards compatibility with existing data.
 */
export type StrategyType =
  | 'sequential_primary_first'  // The only valid approach
  // Legacy types (for backwards compatibility)
  | 'sequential_cigna_first'
  | 'sequential_uhc_first'
  | 'parallel'
  | 'optimized'

/**
 * Individual criterion in scoring
 */
export interface ScoringCriterion {
  name: string
  score: number
  weight: number
  weighted_score: number
  rationale: string
}

/**
 * Scoring weights configuration
 */
export interface ScoringWeights {
  approval_probability: number
  time_to_therapy: number
  rework_risk: number
  cost_efficiency: number
}

/**
 * Strategy score breakdown
 */
export interface StrategyScore {
  total_score: number
  approval_probability: number
  days_to_therapy: number
  rework_risk: number
  cost_efficiency: number
  criteria: ScoringCriterion[]
}

/**
 * Strategy action step
 */
export interface StrategyAction {
  id: string
  name: string
  description: string
  order: number
  estimated_duration: string
  dependencies: string[]
  parallel_group?: number
}

/**
 * Full strategy definition
 */
export interface Strategy {
  id: string
  type: StrategyType
  name: string
  description: string
  is_recommended: boolean
  score: StrategyScore
  actions: StrategyAction[]
  estimated_days: number
  confidence_range: {
    low: number
    high: number
  }
  risks: string[]
  advantages: string[]
}

/**
 * Strategy selection request
 */
export interface SelectStrategyInput {
  strategy_id: string
  rationale?: string
}

/**
 * Backend strategy shape (from API response available_strategies).
 * Used to type the transformer from backend → frontend Strategy.
 */
export interface BackendStrategy {
  strategy_id: string
  strategy_type: string
  name: string
  description: string
  is_recommended?: boolean
  base_approval_score?: number
  base_speed_score?: number
  base_rework_risk?: number
  base_patient_burden?: number
  risk_factors?: string[]
  rationale?: string
}

/**
 * Transform a backend strategy to the frontend Strategy type.
 */
export function transformBackendStrategy(s: BackendStrategy): Strategy {
  return {
    id: s.strategy_id,
    type: s.strategy_type as StrategyType,
    name: s.name,
    description: s.description,
    is_recommended: s.is_recommended ?? false,
    score: {
      total_score: (s.base_approval_score || 0) / 10,
      approval_probability: (s.base_approval_score || 0) / 10,
      days_to_therapy: Math.round((1 - (s.base_speed_score || 0) / 10) * 10) + 3,
      rework_risk: (s.base_rework_risk || 0) / 10,
      cost_efficiency: 1 - (s.base_patient_burden || 0) / 10,
      criteria: [],
    },
    actions: [],
    estimated_days: Math.round((1 - (s.base_speed_score || 5) / 10) * 10) + 3,
    confidence_range: { low: 0.5, high: 0.8 },
    risks: s.risk_factors || [],
    advantages: [s.rationale || ''],
  }
}

/**
 * Strategy comparison for display
 */
export interface StrategyComparison {
  strategies: Strategy[]
  recommended_id: string
  comparison_factors: {
    factor: string
    sequential: string
    parallel: string
    optimized: string
  }[]
}
