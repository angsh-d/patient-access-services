import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useCases } from '@/hooks/useCases'
import { QUERY_KEYS } from '@/lib/constants'
import { SalesforcePageHeader } from '@/components/domain/SalesforcePageHeader'
import { SalesforceCaseTable, type SortField, type SortDir } from '@/components/domain/SalesforceCaseTable'

function LoadingSkeleton() {
  return (
    <div className="bg-white">
      <div className="h-9 bg-salesforce-headerRow border-b" style={{ borderColor: '#E5E5E5' }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 border-b animate-pulse" style={{ borderColor: '#E5E5E5' }}>
          <div className="w-6 h-4 bg-gray-200 rounded" />
          <div className="w-4 h-4 bg-gray-200 rounded" />
          <div className="w-20 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
          <div className="w-44 h-4 bg-gray-200 rounded" />
          <div className="w-24 h-4 bg-gray-200 rounded" />
          <div className="w-28 h-4 bg-gray-200 rounded" />
          <div className="w-12 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
          <div className="w-12 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
          <div className="w-20 h-4 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('caseNumber')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useCases({ limit: 100 })

  const deleteMutation = useMutation({
    mutationFn: async (caseIds: string[]) => {
      const { casesApi } = await import('@/services/api')
      await Promise.all(caseIds.map((id) => casesApi.delete(id)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
      setPendingDeleteIds([])
      setSelectedIds(new Set())
    },
  })

  const cases = data?.cases ?? []

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
  }, [queryClient])

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size > 0) {
      setPendingDeleteIds(Array.from(selectedIds))
    }
  }, [selectedIds])

  const confirmDelete = useCallback(() => {
    if (pendingDeleteIds.length > 0) deleteMutation.mutate(pendingDeleteIds)
  }, [pendingDeleteIds, deleteMutation])

  const handleSortChange = useCallback((field: SortField, dir: SortDir) => {
    setSortField(field)
    setSortDir(dir)
  }, [])

  const lastUpdated = cases.length > 0
    ? new Date(Math.max(...cases.map((c) => new Date(c.updated_at).getTime()))).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'just now'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F3F3F3' }}>
      <SalesforcePageHeader
        caseCount={cases.length}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedCount={selectedIds.size}
        onDeleteSelected={handleDeleteSelected}
      />

      <div className="flex-1 px-4 py-3">
        <div className="rounded border overflow-hidden" style={{ borderColor: '#E5E5E5' }}>
          {isLoading ? (
            <LoadingSkeleton />
          ) : isError ? (
            <div className="bg-white p-8 text-center">
              <p className="text-sm" style={{ color: '#EA001E' }}>
                Failed to load cases: {(error as Error)?.message || 'Unknown error'}
              </p>
              <button
                onClick={handleRefresh}
                className="mt-3 text-xs font-medium px-3 py-1.5 rounded border transition-colors"
                style={{ color: '#0176D3', borderColor: '#0176D3' }}
              >
                Retry
              </button>
            </div>
          ) : (
            <SalesforceCaseTable
              cases={cases}
              searchTerm={searchTerm}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              sortField={sortField}
              sortDir={sortDir}
              onSortChange={handleSortChange}
            />
          )}
        </div>

        {!isLoading && !isError && (
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs" style={{ color: '#706E6B' }}>
              {cases.length} record{cases.length !== 1 ? 's' : ''} displayed
            </p>
            <p className="text-xs" style={{ color: '#706E6B' }}>
              Last refreshed: {lastUpdated}
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {pendingDeleteIds.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPendingDeleteIds([])}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white rounded-2xl shadow-xl"
            style={{ padding: '28px', maxWidth: '380px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#181818', letterSpacing: '-0.02em' }}>
              Delete {pendingDeleteIds.length} case{pendingDeleteIds.length !== 1 ? 's' : ''}?
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#706E6B', marginTop: '8px', lineHeight: 1.5 }}>
              This will permanently remove {pendingDeleteIds.length === 1 ? 'this case' : 'these cases'} from your workspace. This action cannot be undone.
            </p>
            <div className="flex items-center gap-2 mt-5" style={{ justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingDeleteIds([])}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#706E6B',
                  background: 'rgba(0, 0, 0, 0.04)',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: '#EA001E',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  opacity: deleteMutation.isPending ? 0.6 : 1,
                }}
              >
                {deleteMutation.isPending ? 'Deleting...' : `Delete ${pendingDeleteIds.length} Case${pendingDeleteIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
