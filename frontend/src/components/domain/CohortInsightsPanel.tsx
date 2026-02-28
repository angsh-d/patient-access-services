/**
 * CohortInsightsPanel - Gap-driven cohort analysis (Step 2)
 *
 * Master-detail split layout:
 *   Left column  (~38%) — compact navigable gap list with mini denial bars
 *   Right column (~62%) — selected gap's full analysis in flat, scannable sections
 *
 * Greyscale design: no colors, strictly bg-grey-* palette.
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  ChevronRight,
  AlertCircle,
  Target,
  Lightbulb,
  User,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUERY_KEYS, ENDPOINTS, CACHE_TIMES } from '@/lib/constants'
import type { GapCohortAnalysisData, GapAnalysis, GapDataStatus, DocumentationGap } from '@/types/coverage'


// ── Fetcher ────────────────────────────────────────────────────────────

async function fetchGapCohortAnalysis(caseId: string): Promise<GapCohortAnalysisData> {
  const { request } = await import('@/services/api')
  return request<GapCohortAnalysisData>(ENDPOINTS.gapCohortAnalysis(caseId), {}, 120000)
}

// ── Pure helpers ───────────────────────────────────────────────────────

type Filters = { payer: string | null; severity: string | null; period: string | null }

interface DisplayRates {
  thisPayerRate: number
  thisPayerN: number
  otherPayerRate: number
  otherPayerN: number
  baselineRate: number
  baselineN: number
}

function getDisplayRates(gap: GapAnalysis, filters: Filters): DisplayRates {
  let thisPayerRate = gap.this_payer.denial_rate_when_missing
  let thisPayerN = gap.this_payer.sample_size_missing
  let otherPayerRate = gap.other_payers.denial_rate_when_missing
  let otherPayerN = gap.other_payers.sample_size_missing
  const baselineRate = gap.overall.denial_rate_when_present
  const baselineN = gap.overall.sample_size_present

  if (filters.payer) {
    const match = gap.by_payer.find(p => p.payer_name === filters.payer)
    if (match) {
      thisPayerRate = match.denial_rate_missing
      thisPayerN = match.sample_size
    }
  }
  if (filters.severity && gap.severity_breakdown[filters.severity]) {
    const sevData = gap.severity_breakdown[filters.severity]
    thisPayerRate = sevData.denial_rate
    thisPayerN = sevData.sample_size
  }
  if (filters.period) {
    const periodData = gap.time_trend.find(t => t.period === filters.period)
    if (periodData) {
      thisPayerRate = periodData.denial_rate
      thisPayerN = periodData.sample_size
    }
  }

  return { thisPayerRate, thisPayerN, otherPayerRate, otherPayerN, baselineRate, baselineN }
}

// ── Props ──────────────────────────────────────────────────────────────

interface CohortInsightsPanelProps {
  caseId: string
  patientId?: string
  documentationGaps?: DocumentationGap[] | null
  payerName?: string
  className?: string
  embedded?: boolean
}

// ── Component ──────────────────────────────────────────────────────────

export function CohortInsightsPanel({
  caseId,
  patientId,
  documentationGaps: _documentationGaps,
  payerName: _payerName,
  className,
  embedded = false,
}: CohortInsightsPanelProps) {
  const [filters, setFilters] = useState<Filters>({
    payer: null,
    severity: null,
    period: null,
  })
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null)
  const [expandedDeepDive, setExpandedDeepDive] = useState<string | null>(null)
  const [showFullRisk, setShowFullRisk] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)

  const cacheKey = patientId || caseId

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: QUERY_KEYS.gapCohortAnalysis(cacheKey),
    queryFn: () => fetchGapCohortAnalysis(caseId),
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!caseId,
  })

  // Sort gaps by LLM priority ranking
  const sortedGaps = useMemo(() => {
    if (!data?.gap_analyses?.length) return []
    const priorityMap = new Map(
      (data.llm_synthesis?.gap_priority_ranking || []).map(r => [r.gap_id, r.rank])
    )
    return [...data.gap_analyses].sort((a, b) => {
      const ra = priorityMap.get(a.gap_id) ?? 999
      const rb = priorityMap.get(b.gap_id) ?? 999
      return ra - rb
    })
  }, [data])

  // Auto-select first gap on data load
  useEffect(() => {
    if (sortedGaps.length > 0 && !selectedGapId) {
      setSelectedGapId(sortedGaps[0].gap_id)
    }
  }, [sortedGaps, selectedGapId])

  // Derive selected gap object
  const selectedGap = useMemo(
    () => sortedGaps.find(g => g.gap_id === selectedGapId) ?? null,
    [sortedGaps, selectedGapId]
  )

  // Loading
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center gap-3 px-5 py-4 bg-grey-50 rounded-2xl border border-grey-200">
          <svg className="w-5 h-5 text-grey-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-grey-500">
            Analyzing documentation gaps against historical cohort data...
          </span>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-grey-200 p-5 animate-pulse">
            <div className="h-4 bg-grey-100 rounded w-2/3 mb-3" />
            <div className="h-3 bg-grey-100 rounded w-1/2 mb-2" />
            <div className="h-6 bg-grey-100 rounded w-full" />
          </div>
        ))}
      </div>
    )
  }

  // Error
  if (queryError) {
    return (
      <div className={cn('px-5 py-4 bg-grey-50 rounded-2xl border border-grey-200', className)}>
        <div className="flex items-center gap-2 text-grey-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Failed to load gap cohort analysis</span>
        </div>
      </div>
    )
  }

  // No data or no gaps
  if (!data || data.status === 'no_gaps' || !data.gap_analyses?.length) {
    return (
      <div className={cn('px-5 py-4 bg-grey-50 rounded-2xl border border-grey-200', className)}>
        <div className="flex items-center gap-2 text-grey-500">
          <Users className="w-4 h-4" />
          <span className="text-sm">
            {data?.message || 'No documentation gaps to analyze. Complete policy analysis first.'}
          </span>
        </div>
      </div>
    )
  }

  if (data.status === 'insufficient_data') {
    return (
      <div className={cn('px-5 py-4 bg-grey-50 rounded-2xl border border-grey-200', className)}>
        <div className="flex items-center gap-2 text-grey-500">
          <Users className="w-4 h-4" />
          <span className="text-sm">{data.message}</span>
        </div>
      </div>
    )
  }

  // Filter metadata
  const fm = data.filter_metadata || { available_payers: [], available_severity_buckets: [], date_range: { earliest: '', latest: '' } }

  // Compute available periods from gap time_trend data
  const allPeriods = new Set<string>()
  data.gap_analyses.forEach(ga => ga.time_trend?.forEach(t => allPeriods.add(t.period)))
  const availablePeriods = Array.from(allPeriods).sort()

  // Extract first sentence for compact risk summary
  const riskText = data.llm_synthesis?.overall_risk_assessment || ''
  const firstSentence = (() => {
    const match = riskText.match(/^[^.!?]*[.!?]/)
    return match ? match[0] : riskText
  })()
  const hasMoreRisk = riskText.length > firstSentence.length

  const hasInsights = !embedded && data.llm_synthesis?.hidden_insights && data.llm_synthesis.hidden_insights.length > 0
  const hasPatientPosition = !embedded && !!data.llm_synthesis?.patient_position_summary
  const hasFilters = fm.available_payers.length > 0 || fm.available_severity_buckets.length > 0 || availablePeriods.length > 0
  const hasEvidenceSection = hasInsights || hasPatientPosition || hasFilters

  return (
    <div className={cn('space-y-2', className)}>
      {/* A. Compact Summary Bar */}
      {!embedded && (
        <div className="bg-white rounded-2xl border border-grey-200 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-grey-500">
            <Target className="w-4 h-4 text-grey-600 shrink-0" />
            <span className="font-semibold text-grey-800">{sortedGaps.length} documentation gap{sortedGaps.length !== 1 ? 's' : ''}</span>
            <span className="text-grey-300">&middot;</span>
            <span>{data.total_cohort_size} similar cases analyzed</span>
          </div>
          {riskText && (
            <p className="text-sm text-grey-600 leading-relaxed mt-1.5 pl-6">
              {showFullRisk ? riskText : firstSentence}
              {hasMoreRisk && (
                <button
                  onClick={() => setShowFullRisk(!showFullRisk)}
                  className="text-grey-400 hover:text-grey-600 ml-1 text-xs underline"
                >
                  {showFullRisk ? 'Show less' : 'Show more'}
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {/* B. Master-Detail Split */}
      <div className={cn(
        'flex gap-3',
        embedded ? 'flex-col' : 'flex-col lg:flex-row'
      )}>
        {/* Left Column — Gap Navigator */}
        <div className={cn(
          'shrink-0',
          embedded ? 'w-full' : 'w-full lg:w-[38%] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto'
        )}>
          <div className="bg-white rounded-2xl border border-grey-200 overflow-hidden">
            <div className="divide-y divide-grey-100">
              {sortedGaps.map(gap => (
                <GapListItem
                  key={gap.gap_id}
                  gap={gap}
                  payerName={data.payer_name}
                  isSelected={selectedGapId === gap.gap_id}
                  onSelect={() => {
                    setSelectedGapId(gap.gap_id)
                    setExpandedDeepDive(null)
                  }}
                />
              ))}
            </div>
          </div>

          {/* Cross-Gap Insights & Filters — below gap list */}
          {hasEvidenceSection && (
            <div className="rounded-2xl border border-grey-200 bg-white overflow-hidden mt-2">
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-grey-50 transition-colors"
              >
                <ChevronRight className={cn('w-4 h-4 text-grey-400 transition-transform', showEvidence && 'rotate-90')} />
                <Lightbulb className="w-4 h-4 text-grey-500" />
                <span className="text-xs font-medium text-grey-600">Cross-Gap Insights & Filters</span>
              </button>
              <AnimatePresence>
                {showEvidence && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-5 pb-4 space-y-3"
                  >
                    {/* Cross-Gap Insights */}
                    {hasInsights && data.llm_synthesis!.hidden_insights!.map((insight, i) => (
                      <div key={i} className="bg-white rounded-xl border-2 border-dashed border-grey-300 p-4">
                        <p className="text-sm font-medium text-grey-900 mb-1">{insight.headline}</p>
                        <p className="text-xs text-grey-600 leading-relaxed">{insight.finding}</p>
                        {insight.gaps_involved?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {insight.gaps_involved.map((gapId, j) => (
                              <span key={j} className="text-[10px] bg-grey-100 text-grey-500 rounded-full px-2 py-0.5">
                                {gapId.replace(/_PENDING/gi, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Patient Position */}
                    {hasPatientPosition && (
                      <div className="flex items-start gap-3">
                        <User className="w-4 h-4 text-grey-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-grey-700 mb-0.5">Patient Position</h4>
                          <p className="text-xs text-grey-600 leading-relaxed">
                            {data.llm_synthesis!.patient_position_summary}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Filter Bar */}
                    {hasFilters && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-grey-100">
                        <FilterSelect
                          label="Payer"
                          value={filters.payer}
                          options={fm.available_payers}
                          onChange={v => setFilters(f => ({ ...f, payer: v }))}
                        />
                        <FilterSelect
                          label="Severity"
                          value={filters.severity}
                          options={fm.available_severity_buckets}
                          onChange={v => setFilters(f => ({ ...f, severity: v }))}
                        />
                        <FilterSelect
                          label="Period"
                          value={filters.period}
                          options={availablePeriods}
                          onChange={v => setFilters(f => ({ ...f, period: v }))}
                        />
                        {(filters.payer || filters.severity || filters.period) && (
                          <button
                            onClick={() => setFilters({ payer: null, severity: null, period: null })}
                            className="text-xs text-grey-500 hover:text-grey-700 underline ml-1"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right Column — Gap Detail Panel */}
        <div className={cn(
          'flex-1 min-w-0',
          !embedded && 'lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto'
        )}>
          <AnimatePresence mode="wait">
            {selectedGap ? (
              <GapDetailPanel
                key={selectedGap.gap_id}
                gap={selectedGap}
                payerName={data.payer_name}
                filters={filters}
                duplicateOf={(() => {
                  const idx = sortedGaps.findIndex(g => g.gap_id === selectedGap.gap_id)
                  const firstWithSameKey = sortedGaps.findIndex(g => g.historical_doc_key === selectedGap.historical_doc_key)
                  return firstWithSameKey < idx ? sortedGaps[firstWithSameKey].gap_description : undefined
                })()}
                expandedDeepDive={expandedDeepDive}
                onToggleDeepDive={s => setExpandedDeepDive(expandedDeepDive === s ? null : s)}
              />
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl border border-grey-200 px-8 py-16 text-center"
              >
                <Target className="w-8 h-8 text-grey-300 mx-auto mb-3" />
                <p className="text-sm text-grey-400">Select a gap to view its analysis</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Gap List Item (left column row) ─────────────────────────────────────

function GapListItem({
  gap,
  payerName,
  isSelected,
  onSelect,
}: {
  gap: GapAnalysis
  payerName: string
  isSelected: boolean
  onSelect: () => void
}) {
  const dataStatus: GapDataStatus = gap.data_status || 'sufficient'
  const isNoData = dataStatus === 'no_missing_cases'
  const priorityDot = gap.priority === 'high' || gap.priority === 'critical'
    ? 'bg-grey-900' : gap.priority === 'medium' ? 'bg-grey-500' : 'bg-grey-300'
  const impactDelta = gap.overall.impact_delta
  const isZeroDenialWithData = dataStatus === 'sufficient' && gap.overall.denial_rate_when_missing === 0
  const miniBarPct = Math.round(gap.this_payer.denial_rate_when_missing * 100)

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-start gap-2.5 px-4 py-3 text-left transition-colors border-l-2',
        isSelected
          ? 'bg-grey-100 border-l-grey-800'
          : 'hover:bg-grey-50 border-l-transparent'
      )}
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1', isNoData ? 'bg-grey-200' : priorityDot)} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-xs font-medium leading-snug line-clamp-2',
          isNoData ? 'text-grey-400' : 'text-grey-800'
        )}>
          {gap.gap_description}
        </p>
        {/* Mini bar + badge row */}
        <div className="flex items-center gap-2 mt-1.5">
          {!isNoData && (
            <div className="w-14 h-1.5 bg-grey-200 rounded overflow-hidden shrink-0" title={`${payerName}: ${miniBarPct}% denial`}>
              <div
                className="h-full bg-grey-700 rounded"
                style={{ width: `${Math.min(miniBarPct, 100)}%` }}
              />
            </div>
          )}
          {isNoData ? (
            <span className="text-[10px] text-grey-400 bg-grey-100 rounded-full px-2 py-0.5 shrink-0">
              No data
            </span>
          ) : impactDelta > 0 ? (
            <span className="text-[10px] font-semibold text-grey-700 bg-grey-100 rounded-full px-2 py-0.5 shrink-0">
              +{Math.round(impactDelta * 100)}pp
            </span>
          ) : isZeroDenialWithData ? (
            <span className="text-[10px] text-grey-500 bg-grey-100 rounded-full px-2 py-0.5 shrink-0">
              0%
            </span>
          ) : null}
          {!isNoData && miniBarPct > 0 && (
            <span className="text-[10px] text-grey-400 shrink-0">{miniBarPct}%</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Gap Detail Panel (right column) ────────────────────────────────────

function GapDetailPanel({
  gap,
  payerName,
  filters,
  duplicateOf,
  expandedDeepDive,
  onToggleDeepDive,
}: {
  gap: GapAnalysis
  payerName: string
  filters: Filters
  duplicateOf?: string
  expandedDeepDive: string | null
  onToggleDeepDive: (section: string) => void
}) {
  const dataStatus: GapDataStatus = gap.data_status || 'sufficient'
  const isNoData = dataStatus === 'no_missing_cases'
  const isZeroDenialWithData = dataStatus === 'sufficient' && gap.overall.denial_rate_when_missing === 0
  const priorityDot = gap.priority === 'high' || gap.priority === 'critical'
    ? 'bg-grey-900' : gap.priority === 'medium' ? 'bg-grey-500' : 'bg-grey-300'
  const impactDelta = gap.overall.impact_delta

  const rates = getDisplayRates(gap, filters)
  const showBars = !isNoData

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-2xl border border-grey-200 overflow-hidden"
    >
      <div className="px-5 py-4 space-y-4">
        {/* ── Header ── */}
        <div>
          <div className="flex items-start gap-2.5">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0 mt-1', isNoData ? 'bg-grey-200' : priorityDot)} />
            <h3 className={cn('text-sm font-semibold flex-1 min-w-0', isNoData ? 'text-grey-500' : 'text-grey-900')}>
              {gap.gap_description}
            </h3>
            {isNoData ? (
              <span className="text-xs text-grey-400 bg-grey-100 rounded-full px-2.5 py-0.5 shrink-0">No data</span>
            ) : impactDelta > 0 ? (
              <span className="text-xs font-semibold text-grey-700 bg-grey-100 rounded-full px-2.5 py-0.5 shrink-0">
                +{Math.round(impactDelta * 100)}pp
              </span>
            ) : isZeroDenialWithData ? (
              <span className="text-xs text-grey-500 bg-grey-100 rounded-full px-2.5 py-0.5 shrink-0">0% impact</span>
            ) : null}
          </div>
          {duplicateOf && (
            <p className="text-xs text-grey-400 italic mt-1 pl-5">
              Same historical data as &ldquo;{duplicateOf}&rdquo;
            </p>
          )}
        </div>

        {/* ── Cohort Evidence ── */}
        <section>
          <h4 className="text-xs font-semibold text-grey-700 uppercase tracking-wide mb-2">Cohort Evidence</h4>
          {isNoData ? (
            <div className="bg-grey-50 rounded-xl px-4 py-3">
              <p className="text-xs text-grey-500 leading-relaxed">
                {gap.interpretation || `No historical cases with ${gap.historical_doc_key.replace(/_/g, ' ')} missing. Impact unknown — treat as requiring resolution.`}
              </p>
            </div>
          ) : (() => {
            const approvedMissing = gap.overall.approved_when_missing ?? 0
            const deniedMissing = gap.overall.denied_when_missing ?? 0
            const totalMissing = approvedMissing + deniedMissing
            const approvedPresent = gap.overall.approved_when_present ?? 0
            const deniedPresent = gap.overall.denied_when_present ?? 0
            const totalPresent = approvedPresent + deniedPresent
            const approvedPct = totalMissing > 0 ? Math.round(approvedMissing / totalMissing * 100) : 0
            const deniedPct = totalMissing > 0 ? Math.round(deniedMissing / totalMissing * 100) : 0
            const approvedPresentPct = totalPresent > 0 ? Math.round(approvedPresent / totalPresent * 100) : 0
            const appeals = gap.appeal_stats
            return (
              <div className="space-y-3">
                {/* Primary outcome summary */}
                <div className="bg-grey-50 rounded-xl px-4 py-3 space-y-2.5">
                  <p className="text-xs font-medium text-grey-800">
                    Of <span className="font-bold">{totalMissing}</span> cases missing this documentation:
                  </p>
                  {/* Stacked outcome bar */}
                  <div className="space-y-1">
                    <div className="flex h-5 rounded overflow-hidden">
                      {approvedMissing > 0 && (
                        <div className="bg-grey-300 flex items-center justify-center" style={{ width: `${approvedPct}%` }}>
                          {approvedPct >= 15 && <span className="text-[10px] font-semibold text-grey-700">{approvedMissing}</span>}
                        </div>
                      )}
                      {deniedMissing > 0 && (
                        <div className="bg-grey-800 flex items-center justify-center" style={{ width: `${deniedPct}%` }}>
                          {deniedPct >= 15 && <span className="text-[10px] font-semibold text-grey-100">{deniedMissing}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between text-[10px] text-grey-500">
                      <span>{approvedMissing} approved ({approvedPct}%)</span>
                      <span>{deniedMissing} denied ({deniedPct}%)</span>
                    </div>
                  </div>
                  {/* Comparison: when doc present */}
                  {totalPresent > 0 && (
                    <p className="text-[11px] text-grey-500 border-t border-grey-200 pt-2">
                      When doc present: <span className="font-medium text-grey-700">{approvedPresentPct}% approved</span> ({approvedPresent} of {totalPresent})
                    </p>
                  )}
                  {/* Appeal outcomes */}
                  {appeals && appeals.total_appeals > 0 && (
                    <p className="text-[11px] text-grey-500">
                      Appeals: {appeals.successful_appeals} of {appeals.total_appeals} denied cases appealed successfully
                    </p>
                  )}
                </div>

                {/* Payer-specific denial rates */}
                <div className="space-y-1.5">
                  <DenialBar label={filters.payer || payerName} rate={rates.thisPayerRate} n={rates.thisPayerN} fillClass="bg-grey-900" />
                  <DenialBar label="Other Payers" rate={rates.otherPayerRate} n={rates.otherPayerN} fillClass="bg-grey-400" />
                  <DenialBar label="When Doc Present" rate={rates.baselineRate} n={rates.baselineN} fillClass="bg-grey-200" />
                </div>
              </div>
            )
          })()}
        </section>

        {/* ── Key Differentiators — compact rows ── */}
        {gap.gap_differentiators?.differentiating_insights && gap.gap_differentiators.differentiating_insights.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-grey-700 uppercase tracking-wide mb-2">
              What Separated Approved vs. Denied
            </h4>
            <div className="space-y-1.5">
              {gap.gap_differentiators.differentiating_insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-grey-50 rounded-lg px-3 py-2">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0 mt-1.5',
                    insight.current_patient_status === 'favorable' ? 'bg-grey-400' :
                    insight.current_patient_status === 'at_risk' ? 'bg-grey-900' :
                    'bg-grey-300'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-grey-800">{insight.headline}</span>
                      <span className={cn(
                        'text-[10px] rounded-full px-1.5 py-px font-medium shrink-0',
                        insight.current_patient_status === 'favorable' ? 'bg-grey-200 text-grey-600' :
                        insight.current_patient_status === 'at_risk' ? 'bg-grey-800 text-grey-100' :
                        'bg-grey-100 text-grey-500'
                      )}>
                        {insight.current_patient_status === 'favorable' ? 'Favorable' :
                         insight.current_patient_status === 'at_risk' ? 'At Risk' : 'Neutral'}
                      </span>
                    </div>
                    <p className="text-grey-500 mt-0.5 leading-snug">{insight.current_patient_detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Actions — compact, action + impact only ── */}
        {gap.gap_differentiators?.actionable_recommendations && gap.gap_differentiators.actionable_recommendations.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-grey-700 uppercase tracking-wide mb-2">Actions</h4>
            <div className="space-y-1">
              {gap.gap_differentiators.actionable_recommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-grey-400 font-bold shrink-0 w-3.5 text-right">{rec.priority}.</span>
                  <span className="text-grey-700 font-medium flex-1 min-w-0">{rec.action}</span>
                  {rec.expected_impact && (
                    <span className="text-[10px] text-grey-500 bg-grey-100 rounded-full px-2 py-0.5 shrink-0 max-w-[45%] truncate">
                      {rec.expected_impact}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Patient Position ── */}
        {gap.gap_differentiators?.current_patient_position && (
          <section>
            <h4 className="text-xs font-semibold text-grey-700 uppercase tracking-wide mb-2">This Patient</h4>
            <div className="bg-grey-50 rounded-xl px-4 py-3 space-y-2">
              {/* Match bar */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-grey-500 shrink-0 w-16">Cohort match</span>
                <div className="flex-1 h-2 bg-grey-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-grey-600 rounded-full"
                    style={{ width: `${Math.round((gap.gap_differentiators.current_patient_position.estimated_cohort_match ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-grey-700 shrink-0">
                  {Math.round((gap.gap_differentiators.current_patient_position.estimated_cohort_match ?? 0) * 100)}%
                </span>
              </div>
              {/* Factors in two columns */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {gap.gap_differentiators.current_patient_position.favorable_factors?.map((f, i) => (
                  <span key={`fav-${i}`} className="inline-flex items-center gap-1 text-[10px] text-grey-600 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-grey-400 shrink-0" />
                    {f}
                  </span>
                ))}
                {gap.gap_differentiators.current_patient_position.at_risk_factors?.map((f, i) => (
                  <span key={`risk-${i}`} className="inline-flex items-center gap-1 text-[10px] text-grey-600 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-grey-800 shrink-0" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Deep Dive (expandable) ── */}
        {showBars && (gap.top_denial_reasons?.length > 0 || gap.compensating_factors?.length > 0 || Object.keys(gap.severity_breakdown || {}).length > 0 || gap.time_trend?.length > 0) && (
          <div className="space-y-1 pt-3 border-t border-grey-100">
            <p className="text-[10px] text-grey-400 uppercase tracking-wider font-semibold mb-1">Deep Dive</p>

            {gap.top_denial_reasons?.length > 0 && (
              <ExpandableSection
                title="Denial Reasons"
                isOpen={expandedDeepDive === 'reasons'}
                onToggle={() => onToggleDeepDive('reasons')}
              >
                <ul className="space-y-1.5">
                  {gap.top_denial_reasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between text-xs">
                      <span className="text-grey-600 flex-1 min-w-0 truncate">{r.reason}</span>
                      <span className="text-grey-400 ml-2 shrink-0">{r.count} ({r.pct}%)</span>
                    </li>
                  ))}
                </ul>
              </ExpandableSection>
            )}

            {gap.compensating_factors?.length > 0 && (
              <ExpandableSection
                title="Compensating Factors"
                isOpen={expandedDeepDive === 'compensating'}
                onToggle={() => onToggleDeepDive('compensating')}
              >
                {gap.compensating_factors.map((f, i) => (
                  <div key={i} className="text-xs space-y-1 mb-2 last:mb-0">
                    <p className="text-grey-600">{f.description}</p>
                    {f.approval_uplift > 0 && (
                      <span className="inline-block bg-grey-100 text-grey-600 rounded-full px-2 py-0.5">
                        +{Math.round(f.approval_uplift * 100)}pp approval uplift
                      </span>
                    )}
                    {f.recommendation && (
                      <p className="text-grey-500 italic">{f.recommendation}</p>
                    )}
                  </div>
                ))}
              </ExpandableSection>
            )}

            {Object.keys(gap.severity_breakdown || {}).length > 0 && (
              <ExpandableSection
                title="Severity Breakdown"
                isOpen={expandedDeepDive === 'severity'}
                onToggle={() => onToggleDeepDive('severity')}
              >
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(gap.severity_breakdown).map(([sev, sevData]) => (
                    <div key={sev} className="text-xs bg-grey-50 rounded-lg px-3 py-2">
                      <span className="font-medium text-grey-700 capitalize">{sev.replace(/_/g, ' ')}</span>
                      <div className="text-grey-500 mt-0.5">{Math.round(sevData.denial_rate * 100)}% denied (n={sevData.sample_size})</div>
                    </div>
                  ))}
                </div>
              </ExpandableSection>
            )}

            {gap.time_trend?.length > 0 && (
              <ExpandableSection
                title="Time Trend"
                isOpen={expandedDeepDive === 'trend'}
                onToggle={() => onToggleDeepDive('trend')}
              >
                <div className="flex items-end gap-1 h-16">
                  {gap.time_trend.map((t, i) => {
                    const height = Math.max(4, t.denial_rate * 100)
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                        <div
                          className="w-full bg-grey-300 rounded-t transition-all hover:bg-grey-500"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[9px] text-grey-400 leading-none">{t.period.replace(/^\d{4}-/, '')}</span>
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-grey-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                          {t.period}: {Math.round(t.denial_rate * 100)}% (n={t.sample_size})
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ExpandableSection>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
}) {
  if (!options.length) return null
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      className="text-xs bg-grey-50 border border-grey-200 text-grey-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-grey-300"
    >
      <option value="">All {label}s</option>
      {options.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

function DenialBar({
  label,
  rate,
  n,
  fillClass,
}: {
  label: string
  rate: number
  n: number
  fillClass: string
}) {
  const pct = Math.round(rate * 100)
  const hasData = n > 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-grey-500 w-28 truncate shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-grey-100 rounded-full overflow-hidden">
        {hasData && (
          <div
            className={cn('h-full rounded-full transition-all', fillClass)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        )}
      </div>
      <span className="text-xs font-medium text-grey-700 w-20 text-right shrink-0">
        {hasData ? `${pct}% denied` : 'No data'}
      </span>
      <span className="text-[10px] text-grey-400 w-10 text-right shrink-0">
        {hasData ? `n=${n}` : '—'}
      </span>
    </div>
  )
}

function ExpandableSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-grey-500 hover:text-grey-700 py-1"
      >
        <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
        {title}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="pl-4 pb-2"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
