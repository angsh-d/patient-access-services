/**
 * CohortInsightsPanel - Gap-driven cohort analysis (Step 2)
 *
 * For each documentation gap from policy analysis, shows how that gap
 * historically impacts denial rates — broken down by current payer vs
 * other payers — with severity and time-trend slicing.
 *
 * Greyscale design: no colors, strictly bg-grey-* palette.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  ChevronDown,
  AlertCircle,
  Target,
  Lightbulb,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUERY_KEYS, ENDPOINTS, CACHE_TIMES } from '@/lib/constants'
import type { GapCohortAnalysisData, GapAnalysis, GapDataStatus, DocumentationGap } from '@/types/coverage'

// ── Fetcher ────────────────────────────────────────────────────────────

async function fetchGapCohortAnalysis(caseId: string): Promise<GapCohortAnalysisData> {
  const { request } = await import('@/services/api')
  return request<GapCohortAnalysisData>(ENDPOINTS.gapCohortAnalysis(caseId), {}, 120000)
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
  const [filters, setFilters] = useState<{ payer: string | null; severity: string | null; period: string | null }>({
    payer: null,
    severity: null,
    period: null,
  })
  const [expandedGap, setExpandedGap] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

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

  // Sort gaps by LLM priority ranking
  const priorityMap = new Map(
    (data.llm_synthesis?.gap_priority_ranking || []).map(r => [r.gap_id, r.rank])
  )
  const sortedGaps = [...data.gap_analyses].sort((a, b) => {
    const ra = priorityMap.get(a.gap_id) ?? 999
    const rb = priorityMap.get(b.gap_id) ?? 999
    return ra - rb
  })

  // Filter metadata
  const fm = data.filter_metadata || { available_payers: [], available_severity_buckets: [], date_range: { earliest: '', latest: '' } }

  // Compute available periods from gap time_trend data
  const allPeriods = new Set<string>()
  data.gap_analyses.forEach(ga => ga.time_trend?.forEach(t => allPeriods.add(t.period)))
  const availablePeriods = Array.from(allPeriods).sort()

  return (
    <div className={cn('space-y-4', className)}>
      {/* Risk Summary */}
      {!embedded && data.llm_synthesis?.overall_risk_assessment && (
        <div className="bg-white rounded-2xl border border-grey-200 p-5">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-grey-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-grey-900">Risk Summary</h3>
                <span className="text-xs text-grey-400">{data.total_cohort_size} similar cases</span>
              </div>
              {data.llm_synthesis.analysis_strategy && (
                <p className="text-xs text-grey-400 mb-1.5 leading-relaxed">
                  {data.llm_synthesis.analysis_strategy}
                </p>
              )}
              <p className="text-sm text-grey-600 leading-relaxed">
                {data.llm_synthesis.overall_risk_assessment}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Insights — cross-gap discoveries */}
      {!embedded && data.llm_synthesis?.hidden_insights && data.llm_synthesis.hidden_insights.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Lightbulb className="w-4 h-4 text-grey-600" />
            <h3 className="text-sm font-semibold text-grey-800">Cross-Gap Insights</h3>
          </div>
          {data.llm_synthesis.hidden_insights.map((insight, i) => (
            <div key={i} className="bg-white rounded-2xl border-2 border-dashed border-grey-300 p-4">
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
        </div>
      )}

      {/* Patient Position Summary */}
      {!embedded && data.llm_synthesis?.patient_position_summary && (
        <div className="bg-white rounded-2xl border border-grey-200 p-5">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-grey-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-grey-900 mb-1">Patient Position</h3>
              <p className="text-sm text-grey-600 leading-relaxed">
                {data.llm_synthesis.patient_position_summary}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
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

      {/* Gap Cards — deduplicate when multiple gaps share the same historical doc key */}
      {sortedGaps.map((gap, idx) => {
        const firstWithSameKey = sortedGaps.findIndex(g => g.historical_doc_key === gap.historical_doc_key)
        const duplicateOf = firstWithSameKey < idx
          ? sortedGaps[firstWithSameKey].gap_description
          : undefined
        return (
          <GapCard
            key={gap.gap_id}
            gap={gap}
            payerName={data.payer_name}
            filters={filters}
            duplicateOf={duplicateOf}
            isExpanded={expandedGap === gap.gap_id}
            expandedSection={expandedGap === gap.gap_id ? expandedSection : null}
            onToggle={() => {
              setExpandedGap(expandedGap === gap.gap_id ? null : gap.gap_id)
              setExpandedSection(null)
            }}
            onToggleSection={s => setExpandedSection(expandedSection === s ? null : s)}
          />
        )
      })}

    </div>
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

// ── Gap Card ───────────────────────────────────────────────────────────

function GapCard({
  gap,
  payerName,
  filters,
  duplicateOf,
  isExpanded,
  expandedSection,
  onToggle,
  onToggleSection,
}: {
  gap: GapAnalysis
  payerName: string
  filters: { payer: string | null; severity: string | null; period: string | null }
  duplicateOf?: string
  isExpanded: boolean
  expandedSection: string | null
  onToggle: () => void
  onToggleSection: (section: string) => void
}) {
  const [prpaSection, setPrpaSection] = useState<string | null>(null)
  const dataStatus: GapDataStatus = gap.data_status || 'sufficient'
  const isNoData = dataStatus === 'no_missing_cases'
  const isLowSample = dataStatus === 'low_sample'

  // Compute filtered rates when filters are applied
  const getDisplayRates = () => {
    let thisPayerRate = gap.this_payer.denial_rate_when_missing
    let thisPayerN = gap.this_payer.sample_size_missing
    let otherPayerRate = gap.other_payers.denial_rate_when_missing
    let otherPayerN = gap.other_payers.sample_size_missing
    const baselineRate = gap.overall.denial_rate_when_present
    const baselineN = gap.overall.sample_size_present

    // Payer filter — show specific payer from by_payer breakdown
    if (filters.payer) {
      const match = gap.by_payer.find(p => p.payer_name === filters.payer)
      if (match) {
        thisPayerRate = match.denial_rate_missing
        thisPayerN = match.sample_size
      }
    }

    // Severity filter — use severity_breakdown rates
    if (filters.severity && gap.severity_breakdown[filters.severity]) {
      const sevData = gap.severity_breakdown[filters.severity]
      thisPayerRate = sevData.denial_rate
      thisPayerN = sevData.sample_size
    }

    // Period filter — use time_trend rates
    if (filters.period) {
      const periodData = gap.time_trend.find(t => t.period === filters.period)
      if (periodData) {
        thisPayerRate = periodData.denial_rate
        thisPayerN = periodData.sample_size
      }
    }

    return { thisPayerRate, thisPayerN, otherPayerRate, otherPayerN, baselineRate, baselineN }
  }

  const rates = getDisplayRates()
  const priorityDot = gap.priority === 'high' || gap.priority === 'critical'
    ? 'bg-grey-900' : gap.priority === 'medium' ? 'bg-grey-500' : 'bg-grey-300'
  const impactDelta = gap.overall.impact_delta
  const isZeroDenialWithData = dataStatus === 'sufficient' && gap.overall.denial_rate_when_missing === 0

  return (
    <motion.div
      layout
      className={cn(
        'rounded-2xl overflow-hidden',
        isNoData
          ? 'bg-white border-2 border-dashed border-grey-300'
          : 'bg-white border border-grey-200'
      )}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-grey-50 transition-colors"
      >
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', isNoData ? 'bg-grey-200' : priorityDot)} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', isNoData ? 'text-grey-500' : 'text-grey-900')}>
            {gap.gap_description}
          </p>
          <p className="text-xs text-grey-400 mt-0.5">{gap.historical_doc_key.replace(/_/g, ' ')}</p>
        </div>
        {isNoData ? (
          <span className="text-xs text-grey-400 bg-grey-100 rounded-full px-2.5 py-1 shrink-0">
            No historical data
          </span>
        ) : impactDelta > 0 ? (
          <span className="text-xs font-semibold text-grey-700 bg-grey-100 rounded-full px-2.5 py-1 shrink-0">
            +{Math.round(impactDelta * 100)}pp denial risk
          </span>
        ) : isZeroDenialWithData ? (
          <span className="text-xs text-grey-500 bg-grey-100 rounded-full px-2.5 py-1 shrink-0">
            0% denial impact
          </span>
        ) : null}
        <ChevronDown className={cn('w-4 h-4 text-grey-400 transition-transform shrink-0', isExpanded && 'rotate-180')} />
      </button>

      {/* Body */}
      <div className="px-5 pb-4 space-y-3">
        {/* Duplicate doc key note */}
        {duplicateOf && (
          <p className="text-xs text-grey-400 italic">
            Same historical data as &ldquo;{duplicateOf}&rdquo;
          </p>
        )}

        {/* State 1: No missing cases — show interpretation message instead of bars */}
        {isNoData && (
          <div className="bg-grey-50 rounded-xl px-4 py-3">
            <p className="text-xs text-grey-500 leading-relaxed">
              {gap.interpretation || `No historical cases with ${gap.historical_doc_key.replace(/_/g, ' ')} missing. Impact unknown — treat as requiring resolution.`}
            </p>
          </div>
        )}

        {/* State 2: Low sample or zero denial with data — bars + positive interpretation */}
        {(isLowSample || isZeroDenialWithData) && !isNoData && (
          <>
            <div className="space-y-2">
              <DenialBar label={filters.payer || payerName} rate={rates.thisPayerRate} n={rates.thisPayerN} fillClass="bg-grey-900" />
              <DenialBar label="Other Payers" rate={rates.otherPayerRate} n={rates.otherPayerN} fillClass="bg-grey-400" />
              <DenialBar label="When Doc Present" rate={rates.baselineRate} n={rates.baselineN} fillClass="bg-grey-200" />
            </div>
            {gap.interpretation && (
              <p className="text-xs text-grey-500 italic leading-relaxed">{gap.interpretation}</p>
            )}
          </>
        )}

        {/* State 3: Sufficient data with >0% denial — normal bar display */}
        {dataStatus === 'sufficient' && !isZeroDenialWithData && (
          <div className="space-y-2">
            <DenialBar label={filters.payer || payerName} rate={rates.thisPayerRate} n={rates.thisPayerN} fillClass="bg-grey-900" />
            <DenialBar label="Other Payers" rate={rates.otherPayerRate} n={rates.otherPayerN} fillClass="bg-grey-400" />
            <DenialBar label="When Doc Present" rate={rates.baselineRate} n={rates.baselineN} fillClass="bg-grey-200" />
            {gap.interpretation && (
              <p className="text-xs text-grey-500 leading-relaxed">{gap.interpretation}</p>
            )}
          </div>
        )}

        {/* Per-Gap Differentiator Insights (PRPA) — collapsed by default */}
        {gap.gap_differentiators?.differentiating_insights && gap.gap_differentiators.differentiating_insights.length > 0 && (
          <ExpandableSection
            title={`Payer Decision Patterns (${gap.gap_differentiators.differentiating_insights.length})`}
            isOpen={prpaSection === 'patterns'}
            onToggle={() => setPrpaSection(prpaSection === 'patterns' ? null : 'patterns')}
          >
            <div className="space-y-2">
              {gap.gap_differentiators.differentiating_insights.map((insight, i) => (
                <div key={i} className="bg-grey-50 rounded-xl px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-grey-800 leading-snug flex-1 min-w-0">{insight.headline}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn(
                        'text-[10px] rounded-full px-2 py-0.5 font-medium',
                        insight.evidence_strength === 'strong' ? 'bg-grey-700 text-grey-100' :
                        insight.evidence_strength === 'moderate' ? 'bg-grey-300 text-grey-700' :
                        'bg-grey-100 text-grey-500'
                      )}>
                        {insight.evidence_strength}
                      </span>
                      <span className={cn(
                        'text-[10px] rounded-full px-2 py-0.5 font-medium',
                        insight.current_patient_status === 'favorable' ? 'bg-grey-200 text-grey-700' :
                        insight.current_patient_status === 'at_risk' ? 'bg-grey-800 text-grey-100' :
                        'bg-grey-100 text-grey-500'
                      )}>
                        {insight.current_patient_status === 'favorable' ? 'Favorable' :
                         insight.current_patient_status === 'at_risk' ? 'At Risk' : 'Neutral'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-grey-600 leading-relaxed">{insight.finding}</p>
                  <p className="text-xs text-grey-500 italic">{insight.current_patient_detail}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Per-Gap Actionable Recommendations — collapsed by default */}
        {gap.gap_differentiators?.actionable_recommendations && gap.gap_differentiators.actionable_recommendations.length > 0 && (
          <ExpandableSection
            title={`Recommended Actions (${gap.gap_differentiators.actionable_recommendations.length})`}
            isOpen={prpaSection === 'actions'}
            onToggle={() => setPrpaSection(prpaSection === 'actions' ? null : 'actions')}
          >
            <div className="space-y-1.5">
              {gap.gap_differentiators.actionable_recommendations.map((rec, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-grey-400 font-bold shrink-0 w-4 text-right">{rec.priority}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-grey-700 font-medium">{rec.action}</p>
                    <p className="text-grey-500 mt-0.5">{rec.rationale}</p>
                    {rec.expected_impact && (
                      <span className="inline-block mt-0.5 text-[10px] text-grey-600 bg-grey-100 rounded-full px-2 py-0.5">
                        {rec.expected_impact}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Patient Position Mini-Card — collapsed by default */}
        {gap.gap_differentiators?.current_patient_position && (
          <ExpandableSection
            title={`Patient Position — ${Math.round((gap.gap_differentiators.current_patient_position.estimated_cohort_match ?? 0) * 100)}% match`}
            isOpen={prpaSection === 'position'}
            onToggle={() => setPrpaSection(prpaSection === 'position' ? null : 'position')}
          >
            <div className="bg-grey-50 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-end gap-1.5">
                <div className="w-16 h-1.5 bg-grey-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-grey-600 rounded-full"
                    style={{ width: `${Math.round((gap.gap_differentiators.current_patient_position.estimated_cohort_match ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-grey-500">
                  {Math.round((gap.gap_differentiators.current_patient_position.estimated_cohort_match ?? 0) * 100)}%
                </span>
              </div>
              {gap.gap_differentiators.current_patient_position.favorable_factors?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {gap.gap_differentiators.current_patient_position.favorable_factors.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] text-grey-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-grey-400 shrink-0" />
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {gap.gap_differentiators.current_patient_position.at_risk_factors?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {gap.gap_differentiators.current_patient_position.at_risk_factors.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] text-grey-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-grey-800 shrink-0" />
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-grey-600 leading-relaxed">
                {gap.gap_differentiators.current_patient_position.overall_summary}
              </p>
            </div>
          </ExpandableSection>
        )}

        {/* Expandable Sections */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-1 pt-2 border-t border-grey-100"
            >
              {/* Denial Reasons */}
              {gap.top_denial_reasons?.length > 0 && (
                <ExpandableSection
                  title="Denial Reasons"
                  isOpen={expandedSection === 'reasons'}
                  onToggle={() => onToggleSection('reasons')}
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

              {/* Compensating Factors */}
              {gap.compensating_factors?.length > 0 && (
                <ExpandableSection
                  title="Compensating Factors"
                  isOpen={expandedSection === 'compensating'}
                  onToggle={() => onToggleSection('compensating')}
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

              {/* Severity Breakdown */}
              {Object.keys(gap.severity_breakdown || {}).length > 0 && (
                <ExpandableSection
                  title="Severity Breakdown"
                  isOpen={expandedSection === 'severity'}
                  onToggle={() => onToggleSection('severity')}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(gap.severity_breakdown).map(([sev, data]) => (
                      <div key={sev} className="text-xs bg-grey-50 rounded-lg px-3 py-2">
                        <span className="font-medium text-grey-700 capitalize">{sev.replace(/_/g, ' ')}</span>
                        <div className="text-grey-500 mt-0.5">{Math.round(data.denial_rate * 100)}% denied (n={data.sample_size})</div>
                      </div>
                    ))}
                  </div>
                </ExpandableSection>
              )}

              {/* Time Trend */}
              {gap.time_trend?.length > 0 && (
                <ExpandableSection
                  title="Time Trend"
                  isOpen={expandedSection === 'trend'}
                  onToggle={() => onToggleSection('trend')}
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
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-grey-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                            {t.period}: {Math.round(t.denial_rate * 100)}% (n={t.sample_size})
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ExpandableSection>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Denial Rate Bar ────────────────────────────────────────────────────

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

// ── Expandable Section ─────────────────────────────────────────────────

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
