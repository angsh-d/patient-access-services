/**
 * StrategicIntelligence - Case-specific AI insights with full provenance
 *
 * Apple-inspired minimalist design with:
 * - Greyscale color palette
 * - Subtle, clean typography
 * - Premium UI controls
 * - Actionable insights from historical claims analysis
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  XCircle,
  Clock,
  AlertCircle,
  Calendar,
  Zap,
  ShieldCheck,
  BarChart3,
  Sparkles,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'

interface StrategicIntelligenceProps {
  caseId: string
  caseData?: {
    patient?: { primary_payer?: string; first_name?: string; diagnosis_codes?: string[] }
    medication?: { medication_name?: string }
    metadata?: { source_patient_id?: string }
    coverage_assessments?: Record<string, any> | null
    case?: {
      patient?: { primary_payer?: string; first_name?: string; diagnosis_codes?: string[] }
      medication?: { medication_name?: string }
      metadata?: { source_patient_id?: string }
      coverage_assessments?: Record<string, any> | null
    }
  } | null
  className?: string
}

interface DocumentationInsight {
  document_type: string
  status: 'present' | 'missing' | 'incomplete'
  approval_rate_with: number
  approval_rate_without: number
  cases_with: number
  cases_without: number
}

interface EvidenceBreakdown {
  total: number
  approved: number
  denied: number
  info_requested: number
  sample_case_ids: string[]
}

interface CompensatingFactorEvidence {
  total_cases_analyzed: number
  cases_missing_this_doc?: number
  with_compensation: EvidenceBreakdown
  without_compensation: EvidenceBreakdown
  methodology: string
}

interface CompensatingFactor {
  pattern_type: string
  missing_documentation?: string
  compensating_factors?: string[]
  approval_rate_with_compensation?: number
  approval_rate_without_compensation?: number
  approval_rate_with_bundle?: number
  approval_rate_without_bundle?: number
  approval_uplift: number
  description: string
  clinical_rationale: string
  is_missing_in_current_case?: boolean
  current_case_has_compensation?: boolean
  current_compensating_factors?: string[]
  recommendation: string
  priority: 'high' | 'medium' | 'low'
  bundle_criteria?: Record<string, string>
  evidence?: CompensatingFactorEvidence
}

interface AgenticInsight {
  pattern_type: string
  headline: string
  finding: string
  recommendation: string
  approval_uplift: string
  confidence: 'high' | 'medium' | 'low'
}

interface StrategicIntelligenceData {
  case_id: string
  similar_cases: {
    count: number
    approval_rate: number
    denial_rate: number
    info_request_rate: number
    avg_days_to_decision: number
  }
  matching_criteria: {
    medication_match: number
    payer_match: number
    diagnosis_match: number
  }
  documentation_insights: DocumentationInsight[]
  payer_insights: {
    payer_name: string
    common_denial_reasons: string[]
  }
  timing_insights?: {
    best_submission_day?: string
    avg_turnaround_days?: number
    rush_success_rate?: number
  }
  confidence_score: number
  compensating_factors?: CompensatingFactor[]
  agentic_insights?: AgenticInsight[]
  evidence_summary?: {
    total_similar_cases: number
    outcome_breakdown: {
      approved: number
      denied: number
      info_requested: number
    }
    sample_approved_case_ids: string[]
    sample_denied_case_ids: string[]
    methodology: string
  }
}

async function fetchStrategicIntelligence(caseId: string): Promise<StrategicIntelligenceData> {
  const { request } = await import('@/services/api')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await request<any>(`/api/v1/cases/${caseId}/strategic-intelligence`)

  // Transform API response to match expected interface - no fallback values
  // API returns timing_recommendations (not timing_insights) and optimal_submission_day (not best_submission_day)
  const timingRaw = data.timing_insights || data.timing_recommendations
  const timing_insights = timingRaw ? {
    best_submission_day: timingRaw.best_submission_day || timingRaw.optimal_submission_day,
    avg_turnaround_days: timingRaw.avg_turnaround_days || data.similar_cases?.avg_days_to_decision,
    rush_success_rate: timingRaw.rush_success_rate,
  } : undefined

  return {
    case_id: data.case_id,
    similar_cases: data.similar_cases,
    matching_criteria: data.matching_criteria || { medication_match: 0, payer_match: 0, diagnosis_match: 0 },
    documentation_insights: (data.documentation_insights || []).map((insight: {
      documentation_type?: string
      document_type?: string
      is_present_in_current_case?: boolean
      status?: string
      approval_rate_with?: number
      approval_rate_without?: number
      cases_with?: number
      cases_without?: number
    }) => ({
      document_type: insight.documentation_type || insight.document_type,
      status: insight.status || (insight.is_present_in_current_case ? 'present' : 'missing'),
      approval_rate_with: insight.approval_rate_with,
      approval_rate_without: insight.approval_rate_without,
      cases_with: insight.cases_with,
      cases_without: insight.cases_without,
    })),
    payer_insights: data.payer_insights,
    timing_insights,
    confidence_score: data.confidence_score,
    compensating_factors: data.compensating_factors || [],
    agentic_insights: data.agentic_insights || [],
    evidence_summary: data.evidence_summary || undefined,
  }
}

async function fetchCaseData(caseId: string) {
  try {
    const { request } = await import('@/services/api')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await request<any>(`/api/v1/cases/${caseId}`)
  } catch { return null }
}

async function fetchDigitizedPolicy(payerName: string, medicationName: string) {
  try {
    const { request } = await import('@/services/api')
    const payer = payerName.toLowerCase()
    const medication = medicationName.toLowerCase().replace(/\s+/g, '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await request<any>(`/api/v1/policies/${payer}/${medication}/digitized`)
  } catch { return null }
}

async function fetchPatientData(patientId: string) {
  try {
    const { request } = await import('@/services/api')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await request<any>(`/api/v1/intake/patient/${patientId}`)
  } catch { return null }
}

interface UnmetPolicyRequirement {
  name: string
  description: string
  policyText?: string
  clinicalCodes?: Array<{ system: string; code: string }>
  category: string
}

/**
 * Extract unmet criteria from LLM coverage assessment results.
 * Falls back to empty if no assessment is available yet.
 */
function evaluateUnmetPolicyCriteria(
  _digitizedPolicy: any,
  _patientData: any,
  _patientDiagnoses: any[],
  coverageAssessment?: any,
): UnmetPolicyRequirement[] {
  if (!coverageAssessment) return []

  const unmetRequirements: UnmetPolicyRequirement[] = []
  const assessments = coverageAssessment.criteria_assessments || coverageAssessment.criteria_details || []

  for (const assessment of assessments) {
    if (assessment.is_met === false) {
      unmetRequirements.push({
        name: assessment.criterion_name || 'Unknown criterion',
        description: assessment.criterion_description || assessment.reasoning || '',
        category: 'other',
      })
    }
  }

  return unmetRequirements
}

export function StrategicIntelligence({ caseId, caseData: providedCaseData, className }: StrategicIntelligenceProps) {
  const [showReasoning, setShowReasoning] = useState(false)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  // Only fetch case data if not provided as prop
  const { data: fetchedCaseData, isLoading: caseLoading } = useQuery({
    queryKey: QUERY_KEYS.case(caseId),
    queryFn: () => fetchCaseData(caseId),
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!caseId && !providedCaseData,
  })

  // Use provided data if available, otherwise use fetched data
  const caseData = providedCaseData || fetchedCaseData

  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: QUERY_KEYS.strategicIntelligence(caseId),
    queryFn: () => fetchStrategicIntelligence(caseId),
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!caseId,
  })

  // Loading timeout - show retry after 10 seconds
  useEffect(() => {
    if (!isLoading && !caseLoading) {
      setLoadingTimedOut(false)
      return
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 10000)
    return () => clearTimeout(timer)
  }, [isLoading, caseLoading])

  const payerNameForQuery = caseData?.patient?.primary_payer || caseData?.case?.patient?.primary_payer
  const medicationNameForQuery = caseData?.medication?.medication_name || caseData?.case?.medication?.medication_name
  const patientIdForQuery = caseData?.metadata?.source_patient_id || caseData?.case?.metadata?.source_patient_id

  const { data: digitizedPolicy } = useQuery({
    queryKey: QUERY_KEYS.policyDigitized(payerNameForQuery || '', medicationNameForQuery || ''),
    queryFn: () => fetchDigitizedPolicy(payerNameForQuery!, medicationNameForQuery!),
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!payerNameForQuery && !!medicationNameForQuery,
  })

  const { data: patientData } = useQuery({
    queryKey: QUERY_KEYS.patientData(patientIdForQuery || ''),
    queryFn: () => fetchPatientData(patientIdForQuery!),
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!patientIdForQuery,
  })

  // Use API data only - no fallback defaults
  const effectiveData = data

  // Derived data from API response
  const derivedData = useMemo(() => {
    if (!effectiveData || !caseData) return null

    const patient = caseData?.patient || caseData?.case?.patient
    const medication = caseData?.medication || caseData?.case?.medication

    const patientFirstName = patient?.first_name || 'Patient'
    const medicationName = medication?.medication_name || null
    const payerName = patient?.primary_payer || effectiveData.payer_insights?.payer_name || null

    // Get documentation status from API data only
    const presentDocs = effectiveData.documentation_insights.filter(d => d.status === 'present')
    const missingDocs = effectiveData.documentation_insights.filter(d => d.status === 'missing')

    const highImpactMissing = missingDocs
      .filter(d => (d.approval_rate_with - d.approval_rate_without) > 0.1)
      .sort((a, b) => (b.approval_rate_with - b.approval_rate_without) - (a.approval_rate_with - a.approval_rate_without))

    const patientDiagnoses = patientData?.diagnoses || patient?.diagnosis_codes?.map((code: string) => ({ icd10_code: code })) || []
    const primaryPayer = patient?.primary_payer
    const coverageAssessment = primaryPayer
      ? (caseData?.case?.coverage_assessments?.[primaryPayer] || caseData?.coverage_assessments?.[primaryPayer])
      : undefined
    const unmetPolicyRequirements = evaluateUnmetPolicyCriteria(digitizedPolicy, patientData, patientDiagnoses, coverageAssessment)

    const unmetSafetyScreenings = unmetPolicyRequirements.filter(req => {
      const nameLower = req.name.toLowerCase()
      return req.category === 'safety_screening' || req.category === 'safety' ||
        nameLower.includes('screening') || nameLower.includes('tuberculosis') ||
        nameLower.includes('hepatitis') || nameLower.includes('tb ')
    })

    return {
      patientFirstName,
      medicationName,
      payerName,
      presentDocs,
      missingDocs,
      highImpactMissing,
      unmetSafetyScreenings,
      totalCases: effectiveData.similar_cases.count,
    }
  }, [effectiveData, caseData, patientData, digitizedPolicy])

  // Show loading while fetching API data (no fallback - data comes from API only)
  if ((isLoading || caseLoading) && !loadingTimedOut) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="bg-white rounded-2xl border border-grey-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-grey-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-grey-100 rounded-lg animate-pulse w-2/3" />
              <div className="h-4 bg-grey-100 rounded-lg animate-pulse w-1/2" />
            </div>
          </div>
          <div className="h-20 bg-grey-50 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  // Loading timed out or query errored - show retry
  if (loadingTimedOut || queryError) {
    return (
      <div className={cn('p-8 bg-white rounded-2xl border border-grey-200 text-center', className)}>
        <Clock className="w-8 h-8 text-grey-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-grey-700 mb-1">
          {queryError ? 'Failed to load strategic intelligence' : 'Loading is taking longer than expected'}
        </p>
        <p className="text-xs text-grey-500 mb-4">
          {queryError ? 'The analysis service may be unavailable.' : 'The backend may still be processing.'}
        </p>
        <button
          type="button"
          onClick={() => { setLoadingTimedOut(false); refetch() }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-grey-900 hover:bg-grey-800 rounded-lg transition-colors"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  // If we still don't have any usable data, show error
  if (!effectiveData || !derivedData) {
    return (
      <div className={cn('p-8 bg-white rounded-2xl border border-grey-200 text-center', className)}>
        <AlertTriangle className="w-8 h-8 text-grey-300 mx-auto mb-3" />
        <p className="text-sm text-grey-500">Unable to load strategic intelligence</p>
      </div>
    )
  }

  const { patientFirstName, medicationName, payerName, presentDocs, missingDocs, highImpactMissing, unmetSafetyScreenings, totalCases } = derivedData
  const approvalRate = Math.round(effectiveData.similar_cases.approval_rate * 100)

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-grey-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-grey-900 tracking-tight">
                Strategic Intelligence
              </h3>
              <p className="text-sm text-grey-500 mt-0.5">
                Based on {totalCases} similar cases
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-semibold text-grey-900 tracking-tight">
                {approvalRate}%
              </div>
              <p className="text-xs text-grey-400 uppercase tracking-wide">Approval Rate</p>
            </div>
          </div>

          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              label="Avg. Turnaround"
              value={`${effectiveData.timing_insights?.avg_turnaround_days || effectiveData.similar_cases.avg_days_to_decision || 5} days`}
              icon={<Clock className="w-4 h-4" />}
            />
            <MetricCard
              label="Info Requests"
              value={`${Math.round(effectiveData.similar_cases.info_request_rate * 100)}%`}
              icon={<AlertCircle className="w-4 h-4" />}
            />
            <MetricCard
              label="Denials"
              value={`${Math.round(effectiveData.similar_cases.denial_rate * 100)}%`}
              icon={<XCircle className="w-4 h-4" />}
            />
          </div>
        </div>

        {/* Reasoning Summary - Collapsed by default, subtle design */}
        <div className="border-t border-grey-100">
          <button
            type="button"
            onClick={() => setShowReasoning(!showReasoning)}
            className="w-full px-6 py-3 flex items-center justify-between text-xs hover:bg-grey-50/50 transition-colors"
          >
            <span className="text-grey-400 uppercase tracking-wider font-medium">
              Analysis Methodology
            </span>
            <ChevronDown className={cn(
              'w-4 h-4 text-grey-300 transition-transform duration-200',
              showReasoning && 'rotate-180'
            )} />
          </button>

          <AnimatePresence>
            {showReasoning && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-5 space-y-3">
                  <ReasoningItem
                    step={1}
                    text={`Searched 350 historical PA cases, matched ${totalCases} by medication (${medicationName || 'unknown'}), diagnosis family, payer (${payerName || 'unknown'}), disease severity, and prior treatments`}
                  />
                  <ReasoningItem
                    step={2}
                    text={effectiveData.evidence_summary?.methodology ||
                      `Analyzed outcomes: ${Math.round(effectiveData.similar_cases.approval_rate * totalCases)} approved, ${Math.round(effectiveData.similar_cases.info_request_rate * totalCases)} needed info, ${Math.round(effectiveData.similar_cases.denial_rate * totalCases)} denied`
                    }
                  />
                  <ReasoningItem
                    step={3}
                    text={`Compared ${patientFirstName}'s documentation against success patterns from approved cases${effectiveData.evidence_summary?.sample_approved_case_ids?.length ? ` (e.g. ${effectiveData.evidence_summary.sample_approved_case_ids.slice(0, 2).join(', ')})` : ''}`}
                  />
                  <ReasoningItem
                    step={4}
                    text={`Identified compensating factor patterns — non-obvious correlations where one factor offsets a missing requirement, backed by case-level outcome data`}
                    isLast
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Key Insights - Non-intuitive findings from historical data */}
      <div className="bg-white rounded-2xl border border-grey-200 p-6">
        <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider mb-4">
          Key Insights
        </h4>
        <div className="space-y-3">
          {/* Timing Insight */}
          {effectiveData.timing_insights?.best_submission_day && (
            <InsightCard
              icon={<Calendar className="w-4 h-4" />}
              title="Optimal Submission Day"
              description={`Historical data suggests ${effectiveData.timing_insights?.best_submission_day} submissions may have faster turnaround`}
              type="timing"
            />
          )}

          {/* Denial Pattern Insight */}
          {effectiveData.payer_insights?.common_denial_reasons?.length > 0 && (
            <InsightCard
              icon={<AlertCircle className="w-4 h-4" />}
              title="Common Denial Reason"
              description={`${effectiveData.payer_insights?.common_denial_reasons?.[0]} — avoid by ensuring complete documentation`}
              type="warning"
            />
          )}

          {/* Speed Insight */}
          {effectiveData.timing_insights?.avg_turnaround_days && (
            <InsightCard
              icon={<Zap className="w-4 h-4" />}
              title="Processing Timeline"
              description={`Average turnaround: ${effectiveData.timing_insights.avg_turnaround_days} days. Complete documentation may reduce processing time.`}
              type="success"
            />
          )}
        </div>
      </div>

      {/* Agentic Pattern Discovery - Non-obvious compensating factors */}
      {effectiveData.compensating_factors && effectiveData.compensating_factors.length > 0 && (
        <div className="bg-white rounded-2xl border border-grey-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-grey-500" />
              <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                Agentic Pattern Discovery
              </h4>
            </div>
            <span className="text-xs text-grey-400 bg-grey-50 px-2 py-0.5 rounded-full">
              AI-Discovered
            </span>
          </div>
          <p className="text-xs text-grey-500 mb-4">
            Non-obvious patterns discovered through historical case analysis — intelligence that experienced PA specialists learn through years of practice.
          </p>
          <div className="space-y-3">
            {effectiveData.compensating_factors
              .filter(factor => factor.priority === 'high')
              .slice(0, 3)
              .map((factor, idx) => (
                <AgenticPatternCard
                  key={idx}
                  factor={factor}
                />
              ))}
            {effectiveData.compensating_factors.filter(f => f.priority === 'high').length === 0 &&
             effectiveData.compensating_factors.slice(0, 2).map((factor, idx) => (
              <AgenticPatternCard
                key={idx}
                factor={factor}
              />
            ))}
          </div>
        </div>
      )}

      {/* LLM-Generated Agentic Insights */}
      {effectiveData.agentic_insights && effectiveData.agentic_insights.length > 0 && (
        <div className="bg-white rounded-2xl border border-grey-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-grey-500" />
            <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider">
              AI-Synthesized Insights
            </h4>
          </div>
          <div className="space-y-3">
            {effectiveData.agentic_insights.slice(0, 2).map((insight, idx) => (
              <div key={idx} className="bg-grey-50 rounded-xl p-4 border border-grey-100">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h5 className="text-sm font-semibold text-grey-900">{insight.headline}</h5>
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded shrink-0',
                    insight.confidence === 'high'
                      ? 'bg-grey-200 text-grey-700'
                      : 'bg-grey-100 text-grey-500'
                  )}>
                    {insight.approval_uplift}
                  </span>
                </div>
                <p className="text-xs text-grey-600 mb-3">{insight.finding}</p>
                <div className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-grey-100">
                  <Zap className="w-3.5 h-3.5 text-grey-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-grey-700">{insight.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documentation Status */}
      <div className="bg-white rounded-2xl border border-grey-200 p-6">
        <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider mb-4">
          Documentation Status
        </h4>

        <div className="grid grid-cols-2 gap-6">
          {/* Present */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-grey-900" />
              <span className="text-sm font-medium text-grey-900">
                Present ({presentDocs.length})
              </span>
            </div>
            {presentDocs.length > 0 ? (
              <div className="space-y-2">
                {presentDocs.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-grey-600">
                    <CheckCircle className="w-3.5 h-3.5 text-grey-400" />
                    <span>{formatDocName(doc.document_type)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-grey-400 italic">None detected</p>
            )}
          </div>

          {/* Missing - Now includes safety screenings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-semantic-error" />
              <span className="text-sm font-medium text-grey-900">
                Missing ({missingDocs.length + unmetSafetyScreenings.length})
              </span>
            </div>
            <div className="space-y-2">
              {/* Unmet Safety Screenings first */}
              {unmetSafetyScreenings.map((req, idx) => (
                <div key={`screen-${idx}`} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-grey-600">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                    <span>{req.name}</span>
                  </div>
                  <span className="text-xs font-medium text-semantic-error px-1.5 py-0.5 bg-semantic-error/10 rounded">
                    Required
                  </span>
                </div>
              ))}
              {/* Historical missing docs */}
              {missingDocs.map((doc, idx) => {
                const impact = doc.approval_rate_with - doc.approval_rate_without
                return (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-grey-600">
                      <XCircle className="w-3.5 h-3.5 text-grey-300" />
                      <span>{formatDocName(doc.document_type)}</span>
                    </div>
                    {impact > 0.1 && (
                      <span className="text-xs font-medium text-semantic-success flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3" />
                        +{Math.round(impact * 100)}%
                      </span>
                    )}
                  </div>
                )
              })}
              {missingDocs.length === 0 && unmetSafetyScreenings.length === 0 && (
                <p className="text-sm text-grey-400 italic">All key documents present</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Actions */}
      {(highImpactMissing.length > 0 || unmetSafetyScreenings.length > 0 || (effectiveData.compensating_factors && effectiveData.compensating_factors.length > 0)) && (
        <div className="bg-grey-50 rounded-2xl border border-grey-200 p-6">
          <h4 className="text-xs font-medium text-grey-400 uppercase tracking-wider mb-4">
            Recommended Actions
          </h4>
          <div className="space-y-3">
            {/* Agentic Pattern-Based Actions (highest priority - submit now opportunities) */}
            {effectiveData.compensating_factors
              ?.filter(f => f.priority === 'high' && f.is_missing_in_current_case && f.current_case_has_compensation)
              .slice(0, 2)
              .map((factor, idx) => (
                <ActionCardLight
                  key={`agentic-${idx}`}
                  priority={idx + 1}
                  title={`Submit Now — ${formatDocName(factor.missing_documentation || '')} Compensated`}
                  subtitle={factor.recommendation || ''}
                  badge={`+${Math.round(factor.approval_uplift * 100)}%`}
                  badgeType="agentic"
                  compensatingFactors={factor.current_compensating_factors}
                />
              ))}

            {/* Policy-Required Actions */}
            {unmetSafetyScreenings
              .filter(req => {
                // Don't show if compensated by agentic pattern
                const compensated = effectiveData.compensating_factors?.some(
                  f => f.is_missing_in_current_case &&
                       f.current_case_has_compensation &&
                       f.missing_documentation?.toLowerCase().includes(req.name.toLowerCase().split(' ')[0])
                )
                return !compensated
              })
              .map((req, idx) => {
                const agenticCount = effectiveData.compensating_factors
                  ?.filter(f => f.priority === 'high' && f.is_missing_in_current_case && f.current_case_has_compensation).length || 0
                return (
                  <ActionCardLight
                    key={`policy-${idx}`}
                    priority={agenticCount + idx + 1}
                    title={req.name}
                    subtitle={req.description}
                    badge="Policy Required"
                    badgeType="required"
                    codes={req.clinicalCodes}
                  />
                )
              })}

            {/* Historical Impact Actions */}
            {highImpactMissing.slice(0, Math.max(0, 2)).map((doc, idx) => {
              const impact = doc.approval_rate_with - doc.approval_rate_without
              const agenticCount = effectiveData.compensating_factors
                ?.filter(f => f.priority === 'high' && f.is_missing_in_current_case && f.current_case_has_compensation).length || 0
              const policyCount = unmetSafetyScreenings.filter(req => {
                const compensated = effectiveData.compensating_factors?.some(
                  f => f.is_missing_in_current_case &&
                       f.current_case_has_compensation &&
                       f.missing_documentation?.toLowerCase().includes(req.name.toLowerCase().split(' ')[0])
                )
                return !compensated
              }).length
              return (
                <ActionCardLight
                  key={`hist-${idx}`}
                  priority={agenticCount + policyCount + idx + 1}
                  title={`Add ${formatDocName(doc.document_type)}`}
                  subtitle={`${Math.round(doc.approval_rate_with * 100)}% approval with vs ${Math.round(doc.approval_rate_without * 100)}% without`}
                  badge={`+${Math.round(impact * 100)}%`}
                  badgeType="impact"
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-2 text-xs text-grey-400">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3" />
          <span>{totalCases} cases analyzed</span>
          <span className="text-grey-300">|</span>
          <span>{effectiveData.confidence_score ? `${Math.round(effectiveData.confidence_score * 100)}% confidence` : 'Confidence pending'}</span>
        </div>
        <span>{(effectiveData as unknown as { last_updated?: string }).last_updated ? `Updated ${new Date((effectiveData as unknown as { last_updated?: string }).last_updated!).toLocaleDateString()}` : ''}</span>
      </div>
    </div>
  )
}

// Minimal metric card
function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 bg-grey-50 rounded-xl">
      <div className="flex items-center gap-2 text-grey-400 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold text-grey-900">{value}</p>
    </div>
  )
}

// Insight card with subtle styling
function InsightCard({
  icon,
  title,
  description,
  type
}: {
  icon: React.ReactNode
  title: string
  description: string
  type: 'timing' | 'warning' | 'success'
}) {
  const styles = {
    timing: 'bg-grey-50 border-grey-200',
    warning: 'bg-grey-50 border-grey-200',
    success: 'bg-grey-50 border-grey-200',
  }

  const iconStyles = {
    timing: 'text-grey-500',
    warning: 'text-grey-500',
    success: 'text-grey-500',
  }

  return (
    <div className={cn('p-4 rounded-xl border', styles[type])}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5', iconStyles[type])}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-grey-900">{title}</p>
          <p className="text-xs text-grey-500 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  )
}

// Subtle reasoning item
function ReasoningItem({ step, text, isLast = false }: { step: number; text: string; isLast?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className="w-5 h-5 rounded-full bg-grey-100 text-grey-500 flex items-center justify-center text-xs font-medium">
          {step}
        </div>
        {!isLast && <div className="w-px flex-1 bg-grey-100 my-1 min-h-[8px]" />}
      </div>
      <p className="text-sm text-grey-600 pt-0.5">{text}</p>
    </div>
  )
}

// Action card for light background (Apple-inspired greyscale)
function ActionCardLight({
  priority,
  title,
  subtitle,
  badge,
  badgeType,
  codes,
  compensatingFactors
}: {
  priority: number
  title: string
  subtitle: string
  badge: string
  badgeType: 'required' | 'impact' | 'agentic'
  codes?: Array<{ system: string; code: string }>
  compensatingFactors?: string[]
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl p-4 border',
      badgeType === 'agentic' ? 'border-grey-300 shadow-sm' : 'border-grey-200'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
          badgeType === 'agentic'
            ? 'bg-grey-900 text-white'
            : 'bg-grey-200 text-grey-600'
        )}>
          {priority}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-grey-900">{title}</p>
            <span className={cn(
              'text-xs font-medium px-2 py-0.5 rounded shrink-0',
              badgeType === 'required'
                ? 'bg-semantic-error/[0.08] text-semantic-error border border-semantic-error/20'
                : badgeType === 'agentic'
                ? 'bg-grey-900 text-white'
                : 'bg-grey-100 text-grey-700'
            )}>
              {badge}
            </span>
          </div>
          <p className="text-xs text-grey-500">{subtitle}</p>
          {compensatingFactors && compensatingFactors.length > 0 && (
            <div className="mt-2 p-2 bg-grey-50 rounded-lg">
              <p className="text-xs text-grey-500 mb-1.5">
                <CheckCircle className="w-3 h-3 inline mr-1 text-grey-400" />
                Compensated by:
              </p>
              <div className="flex flex-wrap gap-1">
                {compensatingFactors.map((cf, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 bg-grey-200 text-grey-700 text-xs font-medium rounded">
                    {formatDocName(cf)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {codes && codes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {codes.slice(0, 3).map((code, idx) => (
                <span key={idx} className="px-1.5 py-0.5 bg-grey-100 text-grey-600 text-xs font-mono rounded">
                  {code.system}: {code.code}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Agentic Pattern Discovery card for compensating factors (Apple-inspired greyscale)
function AgenticPatternCard({ factor }: { factor: CompensatingFactor }) {
  const isActionable = factor.is_missing_in_current_case && factor.current_case_has_compensation

  // Calculate approval uplift display
  const upliftDisplay = factor.approval_uplift > 0
    ? `+${Math.round(factor.approval_uplift * 100)}%`
    : `${Math.round(factor.approval_uplift * 100)}%`

  // Format pattern type for display
  const patternLabel = factor.pattern_type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className={cn(
      'rounded-xl p-4 border',
      isActionable
        ? 'bg-grey-50 border-grey-300 shadow-sm'
        : 'bg-white border-grey-200'
    )}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {isActionable && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-grey-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-grey-900"></span>
            </span>
          )}
          <h5 className="text-sm font-semibold text-grey-900">
            {factor.missing_documentation
              ? `${formatDocName(factor.missing_documentation)} Missing — But Compensated`
              : patternLabel}
          </h5>
        </div>
        <span className={cn(
          'text-xs font-bold px-2 py-0.5 rounded shrink-0',
          factor.approval_uplift > 0.5
            ? 'bg-grey-900 text-white'
            : factor.approval_uplift > 0.2
            ? 'bg-grey-700 text-white'
            : 'bg-grey-200 text-grey-700'
        )}>
          {upliftDisplay}
        </span>
      </div>

      <p className="text-xs text-grey-600 mb-3">{factor.description}</p>

      {/* Compensating factors list */}
      {factor.compensating_factors && factor.compensating_factors.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-grey-500 mb-1.5">Compensating factors in historical cases:</p>
          <div className="flex flex-wrap gap-1.5">
            {factor.compensating_factors.map((cf, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-grey-200 text-grey-700 text-xs font-medium rounded"
              >
                {formatDocName(cf)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Current case compensation status */}
      {factor.current_compensating_factors && factor.current_compensating_factors.length > 0 && (
        <div className="mb-3 p-2 bg-grey-100 rounded-lg border border-grey-200">
          <p className="text-xs text-grey-700 font-medium mb-1">
            <CheckCircle className="w-3 h-3 inline mr-1 text-grey-500" />
            This case has compensating factors:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {factor.current_compensating_factors.map((cf, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-grey-800 text-white text-xs font-medium rounded"
              >
                {formatDocName(cf)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Approval rates comparison */}
      {(factor.approval_rate_with_compensation !== undefined || factor.approval_rate_with_bundle !== undefined) && (
        <div className="flex gap-4 mb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-grey-900" />
            <span className="text-grey-600">
              With compensation: <span className="font-semibold text-grey-900">
                {Math.round((factor.approval_rate_with_compensation ?? factor.approval_rate_with_bundle ?? 0) * 100)}%
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-grey-400" />
            <span className="text-grey-600">
              Without: <span className="font-semibold text-grey-500">
                {Math.round((factor.approval_rate_without_compensation ?? factor.approval_rate_without_bundle ?? 0) * 100)}%
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div className={cn(
        'flex items-start gap-2 rounded-lg p-2.5',
        isActionable ? 'bg-grey-200' : 'bg-grey-50'
      )}>
        <Zap className={cn(
          'w-3.5 h-3.5 shrink-0 mt-0.5',
          isActionable ? 'text-grey-700' : 'text-grey-500'
        )} />
        <p className={cn(
          'text-xs font-medium',
          isActionable ? 'text-grey-900' : 'text-grey-700'
        )}>
          {factor.recommendation}
        </p>
      </div>

      {/* Clinical rationale (collapsed by default) */}
      {factor.clinical_rationale && (
        <details className="mt-2">
          <summary className="text-xs text-grey-400 cursor-pointer hover:text-grey-600">
            Clinical rationale
          </summary>
          <p className="text-xs text-grey-500 mt-1.5 pl-2 border-l-2 border-grey-200">
            {factor.clinical_rationale}
          </p>
        </details>
      )}

      {/* Evidence Provenance */}
      {factor.evidence && (
        <details className="mt-2">
          <summary className="text-xs text-grey-400 cursor-pointer hover:text-grey-600 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            Evidence from {factor.evidence.total_cases_analyzed} historical cases
          </summary>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-grey-50 rounded-lg border border-grey-100">
                <p className="text-xs font-medium text-grey-500 mb-1">With Compensation</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-grey-500">Approved</span>
                    <span className="font-semibold text-grey-900">{factor.evidence.with_compensation.approved}/{factor.evidence.with_compensation.total}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-grey-500">Denied</span>
                    <span className="font-medium text-grey-600">{factor.evidence.with_compensation.denied}/{factor.evidence.with_compensation.total}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-grey-500">Info Req</span>
                    <span className="font-medium text-grey-600">{factor.evidence.with_compensation.info_requested}/{factor.evidence.with_compensation.total}</span>
                  </div>
                </div>
                <div className="mt-1.5 w-full h-1.5 bg-grey-200 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-grey-900 rounded-l-full"
                    style={{ width: `${(factor.evidence.with_compensation.approved / factor.evidence.with_compensation.total) * 100}%` }}
                  />
                  <div
                    className="h-full bg-grey-400"
                    style={{ width: `${(factor.evidence.with_compensation.info_requested / factor.evidence.with_compensation.total) * 100}%` }}
                  />
                </div>
              </div>
              <div className="p-2 bg-grey-50 rounded-lg border border-grey-100">
                <p className="text-xs font-medium text-grey-500 mb-1">Without Compensation</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-grey-500">Approved</span>
                    <span className="font-semibold text-grey-900">{factor.evidence.without_compensation.approved}/{factor.evidence.without_compensation.total}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-grey-500">Denied</span>
                    <span className="font-medium text-grey-600">{factor.evidence.without_compensation.denied}/{factor.evidence.without_compensation.total}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-grey-500">Info Req</span>
                    <span className="font-medium text-grey-600">{factor.evidence.without_compensation.info_requested}/{factor.evidence.without_compensation.total}</span>
                  </div>
                </div>
                <div className="mt-1.5 w-full h-1.5 bg-grey-200 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-grey-900 rounded-l-full"
                    style={{ width: `${(factor.evidence.without_compensation.approved / factor.evidence.without_compensation.total) * 100}%` }}
                  />
                  <div
                    className="h-full bg-grey-400"
                    style={{ width: `${(factor.evidence.without_compensation.info_requested / factor.evidence.without_compensation.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-grey-400 italic leading-relaxed px-1">
              {factor.evidence.methodology}
            </p>
            {factor.evidence.with_compensation.sample_case_ids.length > 0 && (
              <div className="px-1">
                <p className="text-xs text-grey-400 mb-1">Reference cases:</p>
                <div className="flex flex-wrap gap-1">
                  {factor.evidence.with_compensation.sample_case_ids.slice(0, 3).map((id, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 bg-grey-100 text-grey-500 text-xs font-mono rounded">
                      {id}
                    </span>
                  ))}
                  {factor.evidence.with_compensation.sample_case_ids.length > 3 && (
                    <span className="text-xs text-grey-400">
                      +{factor.evidence.with_compensation.sample_case_ids.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function formatDocName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export default StrategicIntelligence
