import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'
import type { ProcessCaseRequest, TraceEvent, ConfirmDecisionRequest, DecisionStatusResponse } from '@/types/api'
import { auditEventToTraceEvent } from '@/types/api'

/**
 * Hook to fetch a single case by ID
 * Uses indefinite caching - data updates via cache invalidation after mutations
 */
export function useCase(caseId: string | undefined) {
  // Normalize caseId to prevent cache key issues with empty strings
  const normalizedId = caseId && caseId.trim() ? caseId.trim() : undefined

  return useQuery({
    queryKey: QUERY_KEYS.case(normalizedId ?? ''),
    queryFn: async () => {
      if (!normalizedId) {
        throw new Error('Case ID is required')
      }
      return api.cases.get(normalizedId)
    },
    enabled: !!normalizedId,
    // Indefinite caching - data updates only via cache invalidation after mutations
    staleTime: CACHE_TIMES.DYNAMIC,
    gcTime: CACHE_TIMES.GC_TIME,
    // Explicitly disable all automatic refetching - only invalidate via mutations
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Hook to process a case (advance to next stage)
 */
export function useProcessCase(caseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data?: ProcessCaseRequest) => api.cases.process(caseId, data),
    onSuccess: (caseState) => {
      // ProcessCaseResponse is CaseState directly, wrap for cache consistency
      queryClient.setQueryData(QUERY_KEYS.case(caseId), { case: caseState })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
    },
  })
}

/**
 * Transformed trace response for frontend
 */
interface TransformedTraceResponse {
  case_id: string
  events: TraceEvent[]
  chain_valid: boolean
}

/**
 * Hook to get decision trace (audit trail) for a case
 * Cached for 30 seconds - audit trail grows during workflow
 */
export function useCaseTrace(caseId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.trace(caseId ?? ''),
    queryFn: async (): Promise<TransformedTraceResponse> => {
      if (!caseId) {
        throw new Error('Case ID is required')
      }
      const response = await api.cases.getAuditTrail(caseId)
      // Transform backend audit events to frontend trace events
      return {
        case_id: response.case_id,
        events: response.events.map(auditEventToTraceEvent),
        chain_valid: response.chain_valid,
      }
    },
    enabled: !!caseId,
    staleTime: CACHE_TIMES.DYNAMIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Hook to select a strategy for a case
 */
export function useSelectStrategy(caseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { strategy_id: string }) => {
      return api.cases.selectStrategy(caseId, data.strategy_id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.strategies(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.trace(caseId) })
    },
  })
}

/**
 * Stage analysis response from the agent
 */
export interface StageAnalysis {
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
 * Hook to run a single workflow stage (HITL support)
 * Accepts either a bare stage string or { stage, refresh } object
 */
export function useRunStage(caseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: string | { stage: string; refresh?: boolean }): Promise<StageAnalysis> => {
      const stage = typeof input === 'string' ? input : input.stage
      const refresh = typeof input === 'string' ? undefined : input.refresh
      return api.cases.runStage(caseId, stage, refresh)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.strategies(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.strategicIntelligence(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.trace(caseId) })
    },
  })
}

/**
 * Hook to approve a stage and advance to next (HITL approval gate)
 */
export function useApproveStage(caseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (stage: string) => {
      return api.cases.approveStage(caseId, stage)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.case(caseId) })
      const previousCase = queryClient.getQueryData(QUERY_KEYS.case(caseId))
      return { previousCase }
    },
    onError: (_err, _stage, context) => {
      if (context?.previousCase) {
        queryClient.setQueryData(QUERY_KEYS.case(caseId), context.previousCase)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.strategies(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.trace(caseId) })
    },
  })
}

/**
 * Hook to confirm a human decision at the decision gate.
 * Following Anthropic's prior-auth-review-skill pattern.
 */
export function useConfirmDecision(caseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ConfirmDecisionRequest) => {
      return api.cases.confirmDecision(caseId, data)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.case(caseId) })
      const previousCase = queryClient.getQueryData(QUERY_KEYS.case(caseId))
      return { previousCase }
    },
    onSuccess: (caseState) => {
      queryClient.setQueryData(QUERY_KEYS.case(caseId), { case: caseState })
    },
    onError: (_err, _data, context) => {
      if (context?.previousCase) {
        queryClient.setQueryData(QUERY_KEYS.case(caseId), context.previousCase)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.trace(caseId) })
    },
  })
}

/**
 * Hook to check if a case requires human decision.
 * Polls when case is at awaiting_human_decision stage.
 * Uses real-time caching as this is critical for workflow progression.
 */
export function useDecisionStatus(caseId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.decisionStatus(caseId ?? ''),
    queryFn: async (): Promise<DecisionStatusResponse> => {
      if (!caseId) {
        throw new Error('Case ID is required')
      }
      return api.cases.checkDecisionStatus(caseId)
    },
    enabled: !!caseId && enabled,
    staleTime: CACHE_TIMES.REALTIME, // 5 seconds - critical for workflow
    gcTime: CACHE_TIMES.GC_TIME,
    refetchInterval: enabled ? 10000 : false, // Poll every 10s when enabled
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export default useCase
