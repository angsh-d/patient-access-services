/**
 * ChainOfThought - Step-by-step AI reasoning display
 *
 * Design Philosophy:
 * - Shows AI's thought process as discrete, numbered steps
 * - Each step has reasoning, evidence source, and confidence
 * - Collapses into summary when needed
 * - Makes AI reasoning transparent and auditable
 *
 * Key UX Principle: Every insight backed by reasoning and provenance
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'

export interface ThoughtStep {
  id: string
  stepNumber: number
  title: string
  reasoning: string
  conclusion?: string
  confidence: number
  source?: {
    type: 'policy' | 'clinical' | 'patient_record' | 'guideline' | 'inference'
    name: string
    reference?: string // e.g., "Page 3, Section 2.1"
  }
  status?: 'complete' | 'in_progress' | 'warning' | 'info'
  timestamp?: string
}

export interface ChainOfThoughtProps {
  agentType: string
  agentLabel?: string
  steps: ThoughtStep[]
  summary?: string
  totalConfidence?: number
  isExpanded?: boolean
  onToggleExpand?: () => void
  className?: string
  showTimestamps?: boolean
}

const SOURCE_ICONS = {
  policy: FileText,
  clinical: Brain,
  patient_record: FileText,
  guideline: Link2,
  inference: Sparkles,
}

const SOURCE_LABELS = {
  policy: 'Policy Document',
  clinical: 'Clinical Evidence',
  patient_record: 'Patient Record',
  guideline: 'Clinical Guideline',
  inference: 'AI Inference',
}

export function ChainOfThought({
  agentType,
  agentLabel,
  steps,
  summary,
  totalConfidence,
  isExpanded: controlledExpanded,
  onToggleExpand,
  className,
  showTimestamps = false,
}: ChainOfThoughtProps) {
  const [internalExpanded, setInternalExpanded] = useState(true)
  const isExpanded = controlledExpanded ?? internalExpanded

  const toggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand()
    } else {
      setInternalExpanded(!internalExpanded)
    }
  }

  return (
    <div className={cn('rounded-xl border border-grey-200 bg-white overflow-hidden', className)}>
      {/* Header */}
      <button
        onClick={toggleExpand}
        className="w-full p-4 flex items-center justify-between hover:bg-grey-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-grey-900 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-grey-900">
                {agentLabel || `${agentType} Reasoning`}
              </span>
              <Badge variant="neutral" size="sm">
                {steps.length} steps
              </Badge>
              {totalConfidence !== undefined && (
                <Badge
                  variant={totalConfidence >= 0.8 ? 'success' : totalConfidence >= 0.5 ? 'warning' : 'error'}
                  size="sm"
                >
                  {Math.round(totalConfidence * 100)}% confident
                </Badge>
              )}
            </div>
            {summary && !isExpanded && (
              <p className="text-xs text-grey-500 mt-0.5 line-clamp-1">{summary}</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-grey-400 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Summary when collapsed */}
      {!isExpanded && summary && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-grey-50 rounded-lg">
            <p className="text-sm text-grey-700">{summary}</p>
          </div>
        </div>
      )}

      {/* Expanded Steps */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4 space-y-3">
              {steps.map((step, index) => (
                <ThoughtStepCard
                  key={step.id}
                  step={step}
                  isLast={index === steps.length - 1}
                  showTimestamp={showTimestamps}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * ThoughtStepCard - Individual reasoning step with provenance
 */
function ThoughtStepCard({
  step,
  isLast,
  showTimestamp,
}: {
  step: ThoughtStep
  isLast: boolean
  showTimestamp?: boolean
}) {
  const [showDetail, setShowDetail] = useState(false)
  const SourceIcon = step.source ? SOURCE_ICONS[step.source.type] : Info

  const statusConfig = {
    complete: { icon: CheckCircle2, color: 'text-semantic-success', bg: 'bg-semantic-success/10' },
    in_progress: { icon: Clock, color: 'text-grey-600', bg: 'bg-grey-100' },
    warning: { icon: AlertTriangle, color: 'text-semantic-warning', bg: 'bg-semantic-warning/10' },
    info: { icon: Info, color: 'text-grey-500', bg: 'bg-grey-100' },
  }

  const status = statusConfig[step.status || 'complete']
  const StatusIcon = status.icon

  return (
    <div className="relative">
      {/* Connection line to next step */}
      {!isLast && (
        <div className="absolute left-4 top-10 bottom-0 w-px bg-grey-200" />
      )}

      <div className="flex gap-3">
        {/* Step number */}
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 z-10',
            status.bg,
            status.color
          )}
        >
          {step.stepNumber}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="w-full text-left p-3 rounded-lg border border-grey-200 hover:border-grey-300 bg-grey-50 transition-colors"
          >
            {/* Title row */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <StatusIcon className={cn('w-4 h-4', status.color)} />
                <span className="text-sm font-medium text-grey-900">{step.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="neutral" size="sm">
                  {Math.round(step.confidence * 100)}%
                </Badge>
                <ChevronRight
                  className={cn(
                    'w-4 h-4 text-grey-400 transition-transform',
                    showDetail && 'rotate-90'
                  )}
                />
              </div>
            </div>

            {/* Conclusion preview */}
            {step.conclusion && (
              <p className="text-xs text-grey-700 mb-2">{step.conclusion}</p>
            )}

            {/* Source provenance */}
            {step.source && (
              <div className="flex items-center gap-1.5 text-xs text-grey-500">
                <SourceIcon className="w-3 h-3" />
                <span>{SOURCE_LABELS[step.source.type]}: {step.source.name}</span>
                {step.source.reference && (
                  <span className="text-grey-400">({step.source.reference})</span>
                )}
              </div>
            )}

            {/* Timestamp */}
            {showTimestamp && step.timestamp && (
              <div className="flex items-center gap-1 text-xs text-grey-400 mt-1">
                <Clock className="w-3 h-3" />
                {new Date(step.timestamp).toLocaleTimeString()}
              </div>
            )}
          </button>

          {/* Expanded reasoning detail */}
          <AnimatePresence>
            {showDetail && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="p-3 mt-2 bg-white rounded-lg border border-grey-200">
                  <h5 className="text-xs font-semibold text-grey-700 mb-2">Detailed Reasoning</h5>
                  <p className="text-sm text-grey-700 leading-relaxed">{step.reasoning}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/**
 * ChainOfThoughtCompact - Minimal inline version
 */
export function ChainOfThoughtCompact({
  steps,
  onExpand,
}: {
  steps: ThoughtStep[]
  onExpand?: () => void
}) {
  const completedSteps = steps.filter((s) => s.status === 'complete').length
  const avgConfidence = steps.reduce((acc, s) => acc + s.confidence, 0) / steps.length

  return (
    <button
      onClick={onExpand}
      className="w-full flex items-center justify-between p-2 rounded-lg bg-grey-50 hover:bg-grey-100 transition-colors text-left"
    >
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-grey-500" />
        <span className="text-xs text-grey-600">
          {completedSteps}/{steps.length} reasoning steps
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-grey-500">
          {Math.round(avgConfidence * 100)}% avg confidence
        </span>
        <ChevronRight className="w-4 h-4 text-grey-400" />
      </div>
    </button>
  )
}

/**
 * ProvenanceIndicator - Shows source of an individual piece of evidence
 */
export function ProvenanceIndicator({
  source,
  compact = false,
  className,
}: {
  source: ThoughtStep['source']
  compact?: boolean
  className?: string
}) {
  if (!source) return null

  const SourceIcon = SOURCE_ICONS[source.type]

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-grey-500', className)}>
        <SourceIcon className="w-3 h-3" />
        <span className="truncate max-w-[150px]">{source.name}</span>
      </span>
    )
  }

  return (
    <div className={cn('flex items-center gap-2 p-2 bg-grey-50 rounded-lg', className)}>
      <div className="w-6 h-6 rounded bg-grey-200 flex items-center justify-center">
        <SourceIcon className="w-3 h-3 text-grey-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-grey-700 truncate">{source.name}</p>
        <div className="flex items-center gap-1 text-xs text-grey-500">
          <span>{SOURCE_LABELS[source.type]}</span>
          {source.reference && (
            <>
              <span>•</span>
              <span>{source.reference}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChainOfThought
