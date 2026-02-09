import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'

/**
 * Hook to fetch available strategies for a case
 * Strategies are cached indefinitely once generated - they don't change
 */
export function useStrategies(caseId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.strategies(caseId ?? ''),
    queryFn: async () => {
      if (!caseId) {
        throw new Error('Case ID is required')
      }
      return api.strategies.get(caseId)
    },
    enabled: !!caseId,
    staleTime: CACHE_TIMES.SEMI_STATIC, // Indefinite caching - strategies are immutable once generated
    gcTime: CACHE_TIMES.GC_TIME,
  })
}

export default useStrategies
