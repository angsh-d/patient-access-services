import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'
import type { CreateCaseRequest, PaginationParams } from '@/types/api'

/**
 * Hook to fetch list of cases with pagination
 * Uses indefinite caching - invalidated by mutations when new cases are created
 */
export function useCases(params?: PaginationParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.cases, params],
    queryFn: () => api.cases.list(params),
    staleTime: CACHE_TIMES.REALTIME,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })
}

/**
 * Hook to create a new case
 */
export function useCreateCase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCaseRequest) => api.cases.create(data),
    onSuccess: () => {
      // Invalidate cases list to include the new case
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
    },
  })
}

export default useCases
