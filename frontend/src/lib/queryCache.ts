/**
 * React Query Cache Persistence Configuration
 *
 * Uses IndexedDB for persistent caching across page refreshes.
 * This ensures data survives browser refresh and improves UX.
 */

import { QueryClient } from '@tanstack/react-query'
import { get, set, del } from 'idb-keyval'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

/**
 * Cache time constants (in milliseconds)
 */
export const CACHE_TIMES = {
  // Infinite stale time - data never goes stale unless invalidated
  INFINITE: Infinity,

  // Static data - policies, documents (never changes)
  STATIC: Infinity,

  // Semi-static - patient data, strategies (rarely changes)
  SEMI_STATIC: 1000 * 60 * 5, // 5 minutes

  // Dynamic data - case state (changes during workflow)
  DYNAMIC: 1000 * 30, // 30 seconds

  // Real-time - decision status (needs polling)
  REALTIME: 1000 * 5,

  // Garbage collection - keep in memory for 24 hours
  GC_TIME: 1000 * 60 * 60 * 24,

  // Persistence max age - keep in IndexedDB for 7 days
  PERSIST_MAX_AGE: 1000 * 60 * 60 * 24 * 7,
} as const

/**
 * IndexedDB-based persister for React Query
 * Uses idb-keyval for simple key-value storage
 */
export const indexedDBPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      await set('REACT_QUERY_CACHE', client)
    } catch (error) {
      console.warn('Failed to persist query cache:', error)
    }
  },
  restoreClient: async (): Promise<PersistedClient | undefined> => {
    try {
      return await get<PersistedClient>('REACT_QUERY_CACHE')
    } catch (error) {
      console.warn('Failed to restore query cache:', error)
      return undefined
    }
  },
  removeClient: async () => {
    try {
      await del('REACT_QUERY_CACHE')
    } catch (error) {
      console.warn('Failed to remove query cache:', error)
    }
  },
}

/**
 * Create and configure the QueryClient with optimal caching settings
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data never goes stale - only invalidate manually via mutations
        staleTime: CACHE_TIMES.INFINITE,

        // Keep data in memory for 24 hours
        gcTime: CACHE_TIMES.GC_TIME,

        // Retry failed requests twice
        retry: 2,

        // Don't automatically refetch - only on explicit invalidation
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,

        // Use previous data while fetching new data (for smoother UX)
        placeholderData: (previousData: unknown) => previousData,
      },
      mutations: {
        retry: 1,
      },
    },
  })
}

/**
 * Persistence options for PersistQueryClientProvider
 */
export const persistOptions = {
  persister: indexedDBPersister,
  maxAge: CACHE_TIMES.PERSIST_MAX_AGE,
  // Bump this string to invalidate all cached data
  buster: 'v11-plain-language-cohort',
  // Don't persist error states or loading states
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) => {
      // Never persist volatile case/trace data — must always be fresh
      const key = query.queryKey[0] as string
      if (key === 'case' || key === 'cases' || key === 'trace') return false
      // Only persist successful queries
      return query.state.status === 'success'
    },
  },
}

export default createQueryClient
