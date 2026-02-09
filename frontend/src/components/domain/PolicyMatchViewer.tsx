/**
 * PolicyMatchViewer - Three-column layout showing policy-to-patient matching
 *
 * Displays:
 * - Policy Criterion (left column)
 * - Patient Evidence (middle column)
 * - Match Status (right column)
 *
 * With color coding: Green (MET), Yellow (PARTIAL), Red (NOT MET), Gray (UNKNOWN)
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  ChevronRight,
  FileText,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { criterionMatch, staggerContainer, listItem } from '@/lib/animations'

export type MatchStatus = 'met' | 'partial' | 'not_met' | 'unknown'

export interface PolicyCriterion {
  id: string
  name: string
  description: string
  category: string
  policyExcerpt?: string
}

export interface PatientEvidence {
  id: string
  criterionId: string
  evidenceType: string
  value: string
  source?: string
  sourceDocument?: string
  gaps?: string[]
}

export interface CriterionMatch {
  criterionId: string
  status: MatchStatus
  confidence: number
  reasoning?: string
  actionNeeded?: string
}

export interface PolicyMatchViewerProps {
  policyName: string
  policyId: string
  payerName: string
  criteria: PolicyCriterion[]
  evidence: PatientEvidence[]
  matches: CriterionMatch[]
  onCriterionClick?: (criterion: PolicyCriterion) => void
  onEvidenceClick?: (evidence: PatientEvidence) => void
  onFillGap?: (criterionId: string) => void
  className?: string
}

const STATUS_CONFIG = {
  met: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    label: 'MET',
    badgeVariant: 'success' as const,
  },
  partial: {
    icon: AlertCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'PARTIAL',
    badgeVariant: 'warning' as const,
  },
  not_met: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: 'GAP',
    badgeVariant: 'error' as const,
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-grey-400',
    bgColor: 'bg-grey-50',
    borderColor: 'border-grey-200',
    label: 'UNKNOWN',
    badgeVariant: 'neutral' as const,
  },
}

export function PolicyMatchViewer({
  policyName,
  policyId,
  payerName,
  criteria,
  evidence,
  matches,
  onCriterionClick,
  onEvidenceClick,
  onFillGap,
  className,
}: PolicyMatchViewerProps) {
  const [selectedCriterion, setSelectedCriterion] = useState<PolicyCriterion | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (criterionId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(criterionId)) {
        next.delete(criterionId)
      } else {
        next.add(criterionId)
      }
      return next
    })
  }

  // Calculate summary stats
  const metCount = matches.filter((m) => m.status === 'met').length
  const partialCount = matches.filter((m) => m.status === 'partial').length
  const gapCount = matches.filter((m) => m.status === 'not_met').length
  const totalCount = matches.length

  // Get evidence and match for a criterion
  const getEvidenceForCriterion = (criterionId: string) =>
    evidence.find((e) => e.criterionId === criterionId)
  const getMatchForCriterion = (criterionId: string) =>
    matches.find((m) => m.criterionId === criterionId)

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-grey-900">
            Policy Match Analysis
          </h3>
          <p className="text-sm text-grey-500">
            {payerName} - {policyName} ({policyId})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">{metCount} met</Badge>
          {partialCount > 0 && <Badge variant="warning">{partialCount} partial</Badge>}
          {gapCount > 0 && <Badge variant="error">{gapCount} gaps</Badge>}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-grey-200 rounded-full overflow-hidden">
        <div className="h-full flex">
          <motion.div
            className="bg-green-500"
            initial={{ width: 0 }}
            animate={{ width: `${(metCount / totalCount) * 100}%` }}
            transition={{ duration: 0.5, delay: 0.2 }}
          />
          <motion.div
            className="bg-amber-500"
            initial={{ width: 0 }}
            animate={{ width: `${(partialCount / totalCount) * 100}%` }}
            transition={{ duration: 0.5, delay: 0.3 }}
          />
          <motion.div
            className="bg-red-500"
            initial={{ width: 0 }}
            animate={{ width: `${(gapCount / totalCount) * 100}%` }}
            transition={{ duration: 0.5, delay: 0.4 }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-grey-200 rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-grey-50 border-b border-grey-200">
          <div className="text-xs font-semibold text-grey-600 uppercase tracking-wide">
            Policy Criterion
          </div>
          <div className="text-xs font-semibold text-grey-600 uppercase tracking-wide">
            Patient Evidence
          </div>
          <div className="text-xs font-semibold text-grey-600 uppercase tracking-wide">
            Match Status
          </div>
        </div>

        {/* Table Body */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {criteria.map((criterion) => {
            const evidenceItem = getEvidenceForCriterion(criterion.id)
            const match = getMatchForCriterion(criterion.id)
            const status = match?.status || 'unknown'
            const config = STATUS_CONFIG[status]
            const StatusIcon = config.icon
            const isExpanded = expandedRows.has(criterion.id)

            return (
              <motion.div
                key={criterion.id}
                variants={listItem}
                className={cn(
                  'border-b border-grey-200 last:border-b-0',
                  config.bgColor
                )}
              >
                {/* Main row */}
                <div
                  className="grid grid-cols-3 gap-4 p-4 cursor-pointer hover:bg-white/50 transition-colors"
                  onClick={() => toggleRow(criterion.id)}
                >
                  {/* Criterion Column */}
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <motion.div
                        variants={criterionMatch}
                        className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                          config.bgColor,
                          config.borderColor,
                          'border'
                        )}
                      >
                        <StatusIcon className={cn('w-3 h-3', config.color)} />
                      </motion.div>
                      <div>
                        <span className="text-sm font-medium text-grey-900">
                          {criterion.name}
                        </span>
                        <p className="text-xs text-grey-500 mt-0.5">
                          {criterion.description}
                        </p>
                      </div>
                    </div>
                    {criterion.policyExcerpt && (
                      <button
                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 ml-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedCriterion(criterion)
                          onCriterionClick?.(criterion)
                        }}
                      >
                        <FileText className="w-3 h-3" />
                        View policy text
                      </button>
                    )}
                  </div>

                  {/* Evidence Column */}
                  <div className="space-y-1">
                    {evidenceItem ? (
                      <>
                        <div className="text-sm text-grey-900">
                          <span className="font-medium">{evidenceItem.evidenceType}: </span>
                          {evidenceItem.value}
                        </div>
                        {evidenceItem.source && (
                          <button
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEvidenceClick?.(evidenceItem)
                            }}
                          >
                            <ExternalLink className="w-3 h-3" />
                            {evidenceItem.source}
                          </button>
                        )}
                        {evidenceItem.gaps && evidenceItem.gaps.length > 0 && (
                          <div className="flex items-start gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-amber-700">
                              Gap: {evidenceItem.gaps[0]}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-grey-400 italic">[No Data]</span>
                    )}
                  </div>

                  {/* Status Column */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <Badge variant={config.badgeVariant} size="sm">
                        {config.label} ({match ? Math.round(match.confidence * 100) : 0}%)
                      </Badge>
                      {match?.actionNeeded && (
                        <p className="text-xs text-grey-600">
                          Action: {match.actionNeeded}
                        </p>
                      )}
                    </div>
                    {status === 'not_met' && onFillGap && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onFillGap(criterion.id)
                        }}
                        className="text-xs"
                      >
                        Fill Gap
                      </Button>
                    )}
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 text-grey-400 transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                    />
                  </div>
                </div>

                {/* Expanded reasoning */}
                <AnimatePresence>
                  {isExpanded && match?.reasoning && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4">
                        <div className="p-3 bg-white rounded-lg border border-grey-200">
                          <p className="text-xs text-grey-600">
                            <span className="font-medium">AI Reasoning: </span>
                            {match.reasoning}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {/* Policy excerpt slide-out */}
      <AnimatePresence>
        {selectedCriterion?.policyExcerpt && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <GlassPanel variant="light" padding="md">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-medium text-grey-900">
                  Policy Text: {selectedCriterion.name}
                </h4>
                <button
                  onClick={() => setSelectedCriterion(null)}
                  className="text-xs text-grey-500 hover:text-grey-700"
                >
                  Close
                </button>
              </div>
              <p className="text-sm text-grey-700 leading-relaxed italic bg-white/50 p-3 rounded-lg border border-grey-200">
                "{selectedCriterion.policyExcerpt}"
              </p>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * PolicyMatchViewerCompact - Simplified view for inline use
 */
export function PolicyMatchViewerCompact({
  criteria,
  matches,
  className,
}: {
  criteria: PolicyCriterion[]
  matches: CriterionMatch[]
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {criteria.slice(0, 5).map((criterion) => {
        const match = matches.find((m) => m.criterionId === criterion.id)
        const status = match?.status || 'unknown'
        const config = STATUS_CONFIG[status]
        const StatusIcon = config.icon

        return (
          <div
            key={criterion.id}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg border',
              config.bgColor,
              config.borderColor
            )}
          >
            <StatusIcon className={cn('w-4 h-4 flex-shrink-0', config.color)} />
            <span className="text-sm text-grey-900 flex-1 truncate">
              {criterion.name}
            </span>
            <Badge variant={config.badgeVariant} size="sm">
              {config.label}
            </Badge>
          </div>
        )
      })}
      {criteria.length > 5 && (
        <p className="text-xs text-grey-500 text-center">
          +{criteria.length - 5} more criteria
        </p>
      )}
    </div>
  )
}

export default PolicyMatchViewer
