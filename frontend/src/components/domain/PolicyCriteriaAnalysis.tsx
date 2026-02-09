/**
 * PolicyCriteriaAnalysis - Premium greyscale policy analysis component
 *
 * Design Philosophy: Apple HIG-inspired, greyscale-first, sleek, modern, minimalistic
 *
 * Features:
 * - Side-by-side view: Policy Criteria | Patient Evidence
 * - Shows AI's decomposition of complex criteria into atomic requirements
 * - Clear evidence-to-criterion mapping with source attribution
 * - Premium glassmorphism UI with subtle interactions
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  FileText,
  User,
  Layers,
  Link2,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { cn } from '@/lib/utils'
import { fadeInUp, staggerContainer } from '@/lib/animations'
import type { CaseState } from '@/types/case'

/**
 * Atomic criterion - the smallest verifiable unit
 */
interface AtomicCriterion {
  id: string
  text: string
  status: 'satisfied' | 'partial' | 'gap' | 'pending'
  evidenceRef?: string
}

/**
 * Complex criterion from policy - may decompose into atomic ones
 */
interface PolicyCriterion {
  id: string
  category: string
  originalText: string
  decomposed: AtomicCriterion[]
  policySource?: string
}

/**
 * Patient evidence mapped to criteria
 */
interface PatientEvidence {
  id: string
  type: string
  value: string
  source: string
  sourceDocument?: string
  linkedCriteria: string[]
  confidence: number
}

interface PolicyCriteriaAnalysisProps {
  caseState: CaseState
  payerName: string
  medicationName: string
  className?: string
}

/**
 * Status indicator - greyscale with subtle differentiation
 */
function StatusDot({ status }: { status: AtomicCriterion['status'] }) {
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full flex-shrink-0',
        status === 'satisfied' && 'bg-grey-900',
        status === 'partial' && 'bg-grey-500',
        status === 'gap' && 'bg-grey-300 ring-1 ring-grey-400',
        status === 'pending' && 'bg-grey-200'
      )}
    />
  )
}

/**
 * Transform case state to structured criteria and evidence
 */
function transformCaseData(caseState: CaseState, payerName: string): {
  criteria: PolicyCriterion[]
  evidence: PatientEvidence[]
  summary: {
    total: number
    satisfied: number
    partial: number
    gaps: number
  }
} {
  const assessment = caseState.coverage_assessments?.[payerName]
  const criteria: PolicyCriterion[] = []
  const evidence: PatientEvidence[] = []

  // Check for structured criteria from AI analysis (backend uses criteria_assessments)
  const criteriaDetails = (assessment as any)?.criteria_details ?? (assessment as any)?.criteria_assessments

  if (criteriaDetails && Array.isArray(criteriaDetails)) {
    // Use actual AI-analyzed criteria
    criteriaDetails.forEach((detail: any, idx: number) => {
      const atomicCriteria: AtomicCriterion[] = []

      // If AI decomposed into sub-criteria, use them
      if (detail.sub_criteria && Array.isArray(detail.sub_criteria)) {
        detail.sub_criteria.forEach((sub: any, subIdx: number) => {
          atomicCriteria.push({
            id: `${idx}-${subIdx}`,
            text: sub.text || sub.requirement || sub,
            status: sub.met === true || sub.is_met === true ? 'satisfied' : sub.met === false || sub.is_met === false ? 'gap' : sub.partial ? 'partial' : 'pending',
            evidenceRef: sub.evidence_ref,
          })
        })
      } else {
        // Single atomic criterion
        atomicCriteria.push({
          id: `${idx}-0`,
          text: detail.description || detail.criterion_name || `Requirement ${idx + 1}`,
          status: detail.met === true || detail.is_met === true ? 'satisfied' : detail.met === false || detail.is_met === false ? 'gap' : detail.partial ? 'partial' : 'pending',
          evidenceRef: detail.evidence_ref,
        })
      }

      criteria.push({
        id: `crit-${idx}`,
        category: detail.category || 'General Requirements',
        originalText: detail.policy_excerpt || detail.original_text || detail.criterion_name || '',
        decomposed: atomicCriteria,
        policySource: detail.source_section,
      })

      // Extract evidence if available
      if (detail.patient_evidence) {
        evidence.push({
          id: `ev-${idx}`,
          type: detail.evidence_type || 'Clinical Data',
          value: detail.patient_evidence,
          source: detail.evidence_source || 'Patient Record',
          sourceDocument: detail.source_document,
          linkedCriteria: [`crit-${idx}`],
          confidence: detail.confidence || 0.8,
        })
      }
    })
  } else {
    // No AI analysis available — show a single pending entry instead of fabricated criteria
    criteria.push({
      id: 'crit-pending',
      category: 'Pending AI Analysis',
      originalText: 'Policy criteria will be evaluated when AI analysis is initiated. Run coverage assessment to see per-criterion results.',
      decomposed: [
        {
          id: 'pending-0',
          text: 'Awaiting AI coverage assessment',
          status: 'pending' as const,
        },
      ],
    })
  }

  // Calculate summary
  const allAtomic = criteria.flatMap(c => c.decomposed)
  const summary = {
    total: allAtomic.length,
    satisfied: allAtomic.filter(a => a.status === 'satisfied').length,
    partial: allAtomic.filter(a => a.status === 'partial').length,
    gaps: allAtomic.filter(a => a.status === 'gap').length,
  }

  return { criteria, evidence, summary }
}

export function PolicyCriteriaAnalysis({
  caseState,
  payerName,
  medicationName,
  className,
}: PolicyCriteriaAnalysisProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Diagnosis Requirements']))
  const [selectedCriterion, setSelectedCriterion] = useState<string | null>(null)

  const { criteria, evidence, summary } = transformCaseData(caseState, payerName)

  // Group criteria by category
  const categorizedCriteria = criteria.reduce((acc, crit) => {
    if (!acc[crit.category]) acc[crit.category] = []
    acc[crit.category].push(crit)
    return acc
  }, {} as Record<string, PolicyCriterion[]>)

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className={cn('space-y-6', className)}
    >
      {/* Header with summary bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-grey-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-grey-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-grey-900">
                {payerName} Policy for {medicationName}
              </h3>
              <p className="text-xs text-grey-500">
                Criteria decomposition and patient evidence mapping
              </p>
            </div>
          </div>

          {/* Summary stats - minimal greyscale */}
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-grey-900" />
              <span className="text-grey-600">{summary.satisfied} verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-grey-500" />
              <span className="text-grey-600">{summary.partial} partial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-grey-300 ring-1 ring-grey-400" />
              <span className="text-grey-600">{summary.gaps} gaps</span>
            </div>
          </div>
        </div>

        {/* Progress bar - greyscale */}
        <div className="h-1.5 bg-grey-100 rounded-full overflow-hidden">
          <div className="h-full flex">
            <motion.div
              className="bg-grey-900"
              initial={{ width: 0 }}
              animate={{ width: `${(summary.satisfied / summary.total) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="bg-grey-500"
              initial={{ width: 0 }}
              animate={{ width: `${(summary.partial / summary.total) * 100}%` }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </div>

      {/* Main content - Split view */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left: Policy Criteria (60%) */}
        <div className="col-span-3 space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-grey-400" />
            <span className="text-xs font-semibold text-grey-500 uppercase tracking-wider">
              Policy Criteria
            </span>
            <span className="text-xs text-grey-400">
              (decomposed into atomic requirements)
            </span>
          </div>

          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
            {Object.entries(categorizedCriteria).map(([category, catCriteria]) => (
              <div
                key={category}
                className="border border-grey-200 rounded-xl overflow-hidden bg-white"
              >
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-grey-50 transition-colors"
                >
                  <span className="text-sm font-medium text-grey-900">{category}</span>
                  <div className="flex items-center gap-3">
                    {/* Mini status summary for category */}
                    <div className="flex items-center gap-1">
                      {catCriteria.flatMap(c => c.decomposed).slice(0, 5).map((a, i) => (
                        <StatusDot key={i} status={a.status} />
                      ))}
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-grey-400 transition-transform',
                        expandedCategories.has(category) && 'rotate-180'
                      )}
                    />
                  </div>
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {expandedCategories.has(category) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-grey-100">
                        {catCriteria.map(criterion => (
                          <div
                            key={criterion.id}
                            className={cn(
                              'border-b border-grey-50 last:border-b-0',
                              selectedCriterion === criterion.id && 'bg-grey-50'
                            )}
                          >
                            {/* Original policy text */}
                            <div
                              className="px-4 py-3 cursor-pointer hover:bg-grey-50/50 transition-colors"
                              onClick={() => setSelectedCriterion(
                                selectedCriterion === criterion.id ? null : criterion.id
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <Sparkles className="w-4 h-4 text-grey-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-grey-500 mb-1">Original policy text:</p>
                                  <p className="text-sm text-grey-700 italic leading-relaxed">
                                    "{criterion.originalText}"
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Decomposed atomic criteria */}
                            <div className="px-4 pb-3 pl-11">
                              <p className="text-xs text-grey-400 mb-2">
                                Decomposed into {criterion.decomposed.length} atomic requirement{criterion.decomposed.length !== 1 && 's'}:
                              </p>
                              <div className="space-y-1.5">
                                {criterion.decomposed.map(atomic => (
                                  <div
                                    key={atomic.id}
                                    className={cn(
                                      'flex items-start gap-2 py-1.5 px-2 rounded-lg transition-colors',
                                      atomic.status === 'satisfied' && 'bg-grey-100/50',
                                      atomic.status === 'partial' && 'bg-grey-50',
                                      atomic.status === 'gap' && 'bg-white border border-dashed border-grey-300',
                                    )}
                                  >
                                    <StatusDot status={atomic.status} />
                                    <span className={cn(
                                      'text-sm flex-1',
                                      atomic.status === 'satisfied' && 'text-grey-900',
                                      atomic.status === 'partial' && 'text-grey-700',
                                      atomic.status === 'gap' && 'text-grey-500',
                                      atomic.status === 'pending' && 'text-grey-400',
                                    )}>
                                      {atomic.text}
                                    </span>
                                    {atomic.evidenceRef && (
                                      <Link2 className="w-3 h-3 text-grey-400" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right: Patient Evidence (40%) */}
        <div className="col-span-2 space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-grey-400" />
            <span className="text-xs font-semibold text-grey-500 uppercase tracking-wider">
              Patient Evidence
            </span>
          </div>

          <GlassPanel variant="default" padding="none" className="divide-y divide-grey-100">
            {evidence.length > 0 ? (
              evidence.map(ev => (
                <div key={ev.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-grey-500 uppercase">
                          {ev.type}
                        </span>
                        <span className="text-xs text-grey-400">
                          {Math.round(ev.confidence * 100)}% match
                        </span>
                      </div>
                      <p className="text-sm font-medium text-grey-900 mb-1">
                        {ev.value}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-grey-500">
                        <FileText className="w-3 h-3" />
                        <span>{ev.source}</span>
                        {ev.sourceDocument && (
                          <button className="ml-1 flex items-center gap-0.5 text-grey-600 hover:text-grey-900 transition-colors">
                            <ExternalLink className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Link indicator */}
                    <div className="flex flex-col items-center gap-1">
                      <Link2 className="w-4 h-4 text-grey-300" />
                      <span className="text-xs text-grey-400">
                        {ev.linkedCriteria.length}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center">
                <User className="w-8 h-8 text-grey-300 mx-auto mb-2" />
                <p className="text-sm text-grey-500">
                  Evidence extracted from patient records
                </p>
                <p className="text-xs text-grey-400 mt-1">
                  Run policy analysis to map evidence
                </p>
              </div>
            )}

            {/* Patient data summary */}
            {caseState.patient && (
              <div className="p-4 bg-grey-50/50">
                <p className="text-xs font-medium text-grey-500 uppercase mb-3">
                  Patient Summary
                </p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                  <div>
                    <span className="text-grey-500">Name</span>
                    <p className="font-medium text-grey-900">
                      {caseState.patient.first_name} {caseState.patient.last_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-grey-500">DOB</span>
                    <p className="font-medium text-grey-900">
                      {caseState.patient.date_of_birth}
                    </p>
                  </div>
                  <div>
                    <span className="text-grey-500">Diagnosis</span>
                    <p className="font-medium text-grey-900">
                      {caseState.patient.diagnosis_codes?.join(', ') || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-grey-500">Primary Payer</span>
                    <p className="font-medium text-grey-900">
                      {caseState.patient.primary_payer}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </GlassPanel>

          {/* Documentation gaps alert - subtle greyscale */}
          {caseState.documentation_gaps && caseState.documentation_gaps.length > 0 && (
            <div className="p-4 bg-grey-100 rounded-xl border border-grey-200">
              <p className="text-xs font-medium text-grey-700 mb-2">
                Documentation Gaps ({caseState.documentation_gaps.length})
              </p>
              <div className="space-y-2">
                {caseState.documentation_gaps.slice(0, 3).map((gap, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-grey-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-grey-600">
                      <span className="font-medium">{gap.gap_type}:</span> {gap.description}
                    </p>
                  </div>
                ))}
                {caseState.documentation_gaps.length > 3 && (
                  <p className="text-xs text-grey-500 pl-3.5">
                    +{caseState.documentation_gaps.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default PolicyCriteriaAnalysis
