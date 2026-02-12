/**
 * PolicyValidationCard - Detailed policy criteria validation view
 *
 * Displays policy requirements with expandable categories, logical operators,
 * and AI-evaluated assessment results from the coverage assessment LLM.
 *
 * When coverageAssessment is provided: uses LLM per-criterion results.
 * When not provided (pre-analysis): shows "Pending AI Analysis" state.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  MinusCircle,
  Circle,
  Scale,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENDPOINTS, QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'
import { usePatientData } from '@/hooks/usePatientData'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CoverageAssessmentProp = any

interface PolicyValidationCardProps {
  patientId: string
  payerName: string
  medicationName: string
  coverageAssessment?: CoverageAssessmentProp
}

/** Map LLM criterion assessment to display status */
function llmToDisplayStatus(assessment: { is_met?: boolean; confidence?: number }): 'met' | 'not_met' | 'partial' | 'pending' {
  if (assessment.is_met === true) return 'met'
  if (assessment.is_met === false) return 'not_met'
  // is_met is undefined/null — AI hasn't determined; show as pending
  return 'pending'
}

export function PolicyValidationCard({
  patientId,
  payerName,
  medicationName,
  coverageAssessment,
}: PolicyValidationCardProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // Fetch patient data (for indication matching display)
  const { data: patientData, isLoading: patientLoading } = usePatientData(patientId)

  // Fetch digitized policy - indefinite caching for static policy data
  const { data: digitizedPolicy, isLoading: policyLoading } = useQuery({
    queryKey: QUERY_KEYS.policyDigitized(payerName.toLowerCase(), medicationName.toLowerCase().replace(/\s+/g, '')),
    queryFn: async () => {
      const { request } = await import('@/services/api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await request<any>(ENDPOINTS.policyDigitized(
        payerName.toLowerCase(),
        medicationName.toLowerCase().replace(/\s+/g, '')
      ))
    },
    enabled: !!payerName && !!medicationName,
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Build LLM assessment map: criterion_id -> assessment
  const assessmentMap = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: Record<string, any> = {}
    const assessments = coverageAssessment?.criteria_assessments || coverageAssessment?.criteria_details
    if (Array.isArray(assessments)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assessments.forEach((a: any) => {
        if (a.criterion_id) {
          map[a.criterion_id] = a
        }
      })
    }
    return map
  }, [coverageAssessment])

  const hasLLMResults = Object.keys(assessmentMap).length > 0

  // Match patient diagnosis to policy indication
  const matchedIndication = useMemo(() => {
    if (!digitizedPolicy?.indications || !patientData?.diagnoses) return null

    const patientCodes = patientData.diagnoses.map(d => d.icd10_code?.toUpperCase())

    for (const indication of digitizedPolicy.indications) {
      if (indication.indication_codes) {
        for (const code of indication.indication_codes) {
          if (patientCodes.some(pc => pc?.startsWith(code.code?.split('.')[0]))) {
            return indication
          }
        }
      }
      // Generic name-based matching
      const indicationNameLower = indication.indication_name?.toLowerCase() || ''
      for (const dx of patientData.diagnoses) {
        const dxDesc = dx.description?.toLowerCase() || ''
        if (indicationNameLower && dxDesc && (
          dxDesc.includes(indicationNameLower) ||
          indicationNameLower.includes(dxDesc.split(',')[0].trim())
        )) {
          return indication
        }
      }
    }
    return null
  }, [digitizedPolicy, patientData?.diagnoses])

  // Get relevant criteria for matched indication
  const relevantCriteria = useMemo(() => {
    if (!digitizedPolicy || !matchedIndication) return []

    const criteriaIds = new Set<string>()

    const collectCriteriaIds = (groupId: string) => {
      const group = digitizedPolicy.criterion_groups?.[groupId]
      if (!group) return
      group.criteria?.forEach((id: string) => criteriaIds.add(id))
      group.subgroups?.forEach((subgroupId: string) => collectCriteriaIds(subgroupId))
    }

    if (matchedIndication.initial_approval_criteria) {
      collectCriteriaIds(matchedIndication.initial_approval_criteria)
    }

    return Array.from(criteriaIds)
      .map(id => digitizedPolicy.atomic_criteria?.[id])
      .filter(Boolean)
  }, [digitizedPolicy, matchedIndication])

  // Group criteria by category
  const groupedCriteria = useMemo(() => {
    const groups: Record<string, any[]> = {}
    relevantCriteria.forEach(criterion => {
      const category = criterion.category || 'other'
      if (!groups[category]) groups[category] = []
      groups[category].push(criterion)
    })
    return groups
  }, [relevantCriteria])

  // Compute set of criterion IDs that belong to OR-groups (data-driven from digitized policy)
  const orGroupCriterionIds = useMemo(() => {
    const ids = new Set<string>()
    if (!digitizedPolicy?.criterion_groups) return ids
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const group of Object.values(digitizedPolicy.criterion_groups) as any[]) {
      const operator = group.operator || group.logical_operator || 'AND'
      if (String(operator).toUpperCase() === 'OR') {
        for (const cid of (group.criteria || [])) {
          ids.add(cid)
        }
      }
    }
    return ids
  }, [digitizedPolicy])

  // Get status for a criterion from LLM results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getCriterionStatus = (criterion: any): 'met' | 'not_met' | 'partial' | 'pending' => {
    if (!hasLLMResults) return 'pending'
    const assessment = assessmentMap[criterion.criterion_id]
    if (!assessment) return 'pending'
    return llmToDisplayStatus(assessment)
  }

  // Count status totals
  const statusCounts = useMemo(() => {
    let met = 0, notMet = 0, partial = 0, pending = 0
    relevantCriteria.forEach(c => {
      const status = getCriterionStatus(c)
      if (status === 'met') met++
      else if (status === 'not_met') notMet++
      else if (status === 'partial') partial++
      else pending++
    })
    return { met, notMet, partial, pending, total: relevantCriteria.length }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantCriteria, assessmentMap, hasLLMResults])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      // If 'all' is set, expand it to individual categories first so we can toggle one
      if (prev.has('all')) {
        const allCategories = new Set(Object.keys(groupedCriteria))
        allCategories.delete(category) // collapse the clicked one
        return allCategories
      }
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const isLoading = patientLoading || policyLoading

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-grey-100 rounded-xl animate-pulse" />
        <div className="h-40 bg-grey-100 rounded-xl animate-pulse" />
        <div className="h-32 bg-grey-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  // No policy found
  if (!digitizedPolicy) {
    return (
      <div className="text-center py-12 bg-grey-50 rounded-xl">
        <Scale className="w-12 h-12 text-grey-300 mx-auto mb-4" />
        <p className="text-base font-medium text-grey-900">Policy Not Found</p>
        <p className="text-sm text-grey-500 mt-1">
          No digitized policy found for {payerName} / {medicationName}
        </p>
      </div>
    )
  }

  // No matching indication
  if (!matchedIndication) {
    return (
      <div className="bg-grey-50 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-grey-200 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-grey-500" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-grey-900">No Matching Indication</h4>
            <p className="text-sm text-grey-600 mt-1">
              Patient's diagnosis does not match any covered indication in the {digitizedPolicy.payer_name} policy for {digitizedPolicy.medication_name}.
            </p>
            <p className="text-xs text-grey-500 mt-3">
              Patient diagnoses: {patientData?.diagnoses?.map(d => `${d.icd10_code} - ${d.description}`).join(', ') || 'None documented'}
            </p>
            <p className="text-xs text-grey-500 mt-1">
              Covered indications: {digitizedPolicy.indications?.map((i: any) => i.indication_name).join(', ')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Category display names
  const categoryLabels: Record<string, string> = {
    age: 'Age Requirements',
    diagnosis: 'Diagnosis',
    step_therapy: 'Step Therapy',
    prior_treatment: 'Prior Treatments',
    safety: 'Safety Screenings',
    safety_screening: 'Pre-Biologic Safety Screening',
    prescriber: 'Prescriber Requirements',
    lab: 'Laboratory',
    documentation: 'Documentation',
    clinical: 'Clinical Criteria',
    other: 'Other Requirements',
  }

  return (
    <div className="space-y-6">
      {/* Indication Match Header */}
      <div className="bg-grey-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-grey-500 uppercase tracking-wide mb-1">Matched Indication</p>
            <h4 className="text-lg font-semibold text-grey-900">{matchedIndication.indication_name}</h4>
            {matchedIndication.indication_codes?.length > 0 && (
              <p className="text-xs font-mono text-grey-500 mt-1">
                {matchedIndication.indication_codes.map((c: any) => `${c.system}: ${c.code}`).join(' | ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-grey-500">Initial Approval</p>
            <p className="text-sm font-semibold text-grey-900">{matchedIndication.initial_approval_duration_months} months</p>
          </div>
        </div>
      </div>

      {/* Pending AI Analysis banner */}
      {!hasLLMResults && (
        <div className="p-4 rounded-xl bg-grey-100 border border-grey-200">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-grey-400" />
            <div>
              <h4 className="text-sm font-semibold text-grey-700">Pending AI Analysis</h4>
              <p className="text-xs text-grey-500 mt-0.5">Criteria evaluations will appear after AI policy analysis completes.</p>
            </div>
          </div>
        </div>
      )}

      {/* Criteria Status Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-grey-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-grey-900">{statusCounts.met}</p>
          <p className="text-xs text-grey-500">Met</p>
        </div>
        <div className="bg-grey-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-grey-900">{statusCounts.partial}</p>
          <p className="text-xs text-grey-500">Partial</p>
        </div>
        <div className="bg-grey-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-grey-900">{statusCounts.notMet}</p>
          <p className="text-xs text-grey-500">Not Met</p>
        </div>
        <div className="bg-grey-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-grey-900">{statusCounts.pending}</p>
          <p className="text-xs text-grey-500">{hasLLMResults ? 'Unknown' : 'Pending'}</p>
        </div>
      </div>

      {/* Criteria by Category */}
      <div className="space-y-3">
        {Object.entries(groupedCriteria).map(([category, criteria]) => {
          const isExpanded = expandedCategories.has('all') || expandedCategories.has(category)
          const categoryMet = criteria.filter(c => getCriterionStatus(c) === 'met').length
          const categoryTotal = criteria.length

          // Determine OR logic from digitized policy criterion_groups (not hardcoded)
          const orCriteria = criteria.filter(c => orGroupCriterionIds.has(c.criterion_id))
          const andCriteria = criteria.filter(c => !orGroupCriterionIds.has(c.criterion_id))
          const isOrLogic = orCriteria.length > 0 && andCriteria.length === 0
          const isMixedLogic = orCriteria.length > 0 && andCriteria.length > 0
          const orGroupMet = orCriteria.some(c => getCriterionStatus(c) === 'met')

          const categoryStatus = (() => {
            if (isOrLogic) {
              return categoryMet >= 1 ? 'satisfied' : 'not_satisfied'
            } else if (isMixedLogic) {
              const andMet = andCriteria.filter(c => getCriterionStatus(c) === 'met').length
              return (andMet === andCriteria.length && orGroupMet) ? 'satisfied' : 'not_satisfied'
            } else {
              return categoryMet === categoryTotal ? 'satisfied' : 'not_satisfied'
            }
          })()

          return (
            <div key={category} className="border border-grey-200 rounded-xl overflow-hidden">
              {/* Category Header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-4 py-3 bg-grey-50 hover:bg-grey-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-grey-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-grey-500" />
                  )}
                  <span className="text-sm font-semibold text-grey-900">
                    {categoryLabels[category] || category.replace(/_/g, ' ')}
                  </span>
                  {categoryTotal > 1 && (
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      (isOrLogic || isMixedLogic) ? "bg-grey-200 text-grey-700" : "bg-grey-200 text-grey-600"
                    )}>
                      {isOrLogic
                        ? 'ANY ONE'
                        : isMixedLogic
                          ? `${andCriteria.length} REQ + ANY 1 of ${orCriteria.length}`
                          : 'ALL REQUIRED'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-grey-500">
                    {categoryMet}/{categoryTotal} met
                  </span>
                  {categoryStatus === 'satisfied' && hasLLMResults && (
                    <CheckCircle className="w-4 h-4 text-grey-900" />
                  )}
                </div>
              </button>

              {/* Category Criteria */}
              {isExpanded && (
                <div className="divide-y divide-grey-100">
                  {criteria.map((criterion, idx) => {
                    const status = getCriterionStatus(criterion)
                    const isInOrGroup = orGroupCriterionIds.has(criterion.criterion_id)
                    // OR-group criteria aren't "required" failures when group is already satisfied
                    const isRequired = isInOrGroup ? !orGroupMet : criterion.is_required !== false
                    const llmAssessment = assessmentMap[criterion.criterion_id]
                    const confidence = llmAssessment?.confidence as number | undefined
                    // Confidence-based left border accent
                    const borderColor = confidence != null
                      ? confidence > 0.8 ? 'border-l-grey-700' : confidence > 0.5 ? 'border-l-grey-500' : 'border-l-grey-300'
                      : 'border-l-transparent'
                    return (
                      <div key={idx} className={cn("px-4 py-3 flex items-start gap-3 border-l-2", borderColor)}>
                        <div className="mt-0.5">
                          {status === 'met' && <CheckCircle className="w-4 h-4 text-grey-900" />}
                          {status === 'not_met' && <XCircle className={cn("w-4 h-4", isRequired ? "text-grey-600" : "text-grey-400")} />}
                          {status === 'partial' && <MinusCircle className="w-4 h-4 text-grey-500" />}
                          {status === 'pending' && <Circle className="w-4 h-4 text-grey-300" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium",
                            status === 'met' ? 'text-grey-900' : 'text-grey-600'
                          )}>
                            {criterion.name}
                            {isInOrGroup && (
                              <span className="ml-1.5 text-[10px] font-medium px-1 py-0.5 bg-grey-100 text-grey-600 rounded align-middle">OR</span>
                            )}
                          </p>
                          <p className="text-xs text-grey-500 mt-0.5">{criterion.description}</p>

                          {/* LLM reasoning and evidence */}
                          {llmAssessment?.reasoning && (
                            <p className="text-xs text-grey-600 mt-1.5 bg-grey-50 rounded px-2 py-1">
                              {llmAssessment.reasoning}
                            </p>
                          )}
                          {llmAssessment?.supporting_evidence?.length > 0 && (
                            <div className="mt-1.5">
                              <p className="text-[10px] font-medium text-grey-400 uppercase">Evidence</p>
                              <ul className="mt-0.5 space-y-0.5">
                                {llmAssessment.supporting_evidence.map((ev: string, evIdx: number) => (
                                  <li key={evIdx} className="text-xs text-grey-500 flex items-start gap-1">
                                    <span className="text-grey-300 mt-0.5">-</span>
                                    {ev}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Source attribution badges */}
                          {llmAssessment && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {llmAssessment.evidence_source && (
                                <span className={cn(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                  llmAssessment.evidence_source === 'rubric' && 'bg-grey-100 text-grey-600',
                                  llmAssessment.evidence_source === 'rag' && 'bg-grey-100 text-grey-600',
                                  llmAssessment.evidence_source === 'consensus' && 'bg-grey-100 text-grey-600',
                                  !['rubric', 'rag', 'consensus'].includes(llmAssessment.evidence_source) && 'bg-grey-100 text-grey-500',
                                )}>
                                  {String(llmAssessment.evidence_source).replace(/_/g, ' ').toUpperCase()}
                                </span>
                              )}
                              {llmAssessment.evidence_date && (
                                <span className="text-[10px] text-grey-400">
                                  {llmAssessment.evidence_date}
                                </span>
                              )}
                            </div>
                          )}

                          {criterion.policy_text && criterion.policy_text !== criterion.description && !llmAssessment && (
                            <p className="text-xs text-grey-400 mt-1 italic">"{criterion.policy_text}"</p>
                          )}
                          {criterion.clinical_codes?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {criterion.clinical_codes.slice(0, 3).map((code: any, codeIdx: number) => (
                                <span key={codeIdx} className="px-1.5 py-0.5 bg-grey-100 text-grey-600 text-xs font-mono rounded">
                                  {code.system}: {code.code}
                                </span>
                              ))}
                              {criterion.clinical_codes.length > 3 && (
                                <span className="text-xs text-grey-400">+{criterion.clinical_codes.length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded",
                            status === 'met' && 'bg-grey-900 text-white',
                            status === 'not_met' && isRequired && 'bg-grey-200 text-grey-700',
                            status === 'not_met' && !isRequired && 'bg-grey-200 text-grey-600',
                            status === 'partial' && 'bg-grey-150 text-grey-700',
                            status === 'pending' && 'bg-grey-100 text-grey-500'
                          )}>
                            {status === 'met' ? 'Met' : status === 'not_met' ? 'Not Met' : status === 'partial' ? 'Partial' : 'Pending'}
                          </span>
                          {llmAssessment?.confidence != null && (
                            <span className="text-[10px] text-grey-400">
                              {Math.round(llmAssessment.confidence * 100)}% conf
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Policy Reference */}
      <div className="pt-4 border-t border-grey-200">
        <p className="text-xs text-grey-400">
          Source: {digitizedPolicy.payer_name} Policy {digitizedPolicy.policy_number} - {digitizedPolicy.policy_title}
        </p>
        {digitizedPolicy.effective_date && (
          <p className="text-xs text-grey-400">Effective: {digitizedPolicy.effective_date}</p>
        )}
      </div>
    </div>
  )
}
