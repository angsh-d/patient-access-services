/**
 * PolicyCriteriaViewer - Hierarchical accordion display of policy criteria
 *
 * Shows policy criteria with:
 * - Expandable sections by category
 * - Each criterion shows: Name, Description, Required Evidence
 * - Visual indicators when viewing in case context (met/partial/gap)
 * - Click to see policy text excerpt
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  FileText,
  ClipboardList,
  Shield,
  Stethoscope,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { cn } from '@/lib/utils'
import { accordion } from '@/lib/animations'

export interface CriterionItem {
  id: string
  name: string
  description: string
  requiredEvidence?: string[]
  status?: 'met' | 'partial' | 'not_met' | 'unknown'
  confidence?: number
  policyExcerpt?: string
}

export interface CriteriaCategory {
  id: string
  name: string
  icon?: 'diagnosis' | 'step_therapy' | 'safety' | 'prescriber' | 'documentation'
  criteria: CriterionItem[]
}

export interface PolicyCriteriaViewerProps {
  policyId: string
  policyName: string
  categories: CriteriaCategory[]
  showStatus?: boolean
  onCriterionClick?: (criterion: CriterionItem) => void
  className?: string
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  diagnosis: Stethoscope,
  step_therapy: ClipboardList,
  safety: Shield,
  prescriber: FileText,
  documentation: FileText,
}

const STATUS_CONFIG = {
  met: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    label: 'Met',
    badgeVariant: 'success' as const,
  },
  partial: {
    icon: AlertCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Partial',
    badgeVariant: 'warning' as const,
  },
  not_met: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: 'Not Met',
    badgeVariant: 'error' as const,
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-grey-400',
    bgColor: 'bg-grey-50',
    borderColor: 'border-grey-200',
    label: 'Unknown',
    badgeVariant: 'neutral' as const,
  },
}

export function PolicyCriteriaViewer({
  policyId,
  policyName,
  categories,
  showStatus = false,
  onCriterionClick,
  className,
}: PolicyCriteriaViewerProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.map((c) => c.id)) // All expanded by default
  )
  const [selectedCriterion, setSelectedCriterion] = useState<CriterionItem | null>(null)

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleCriterionClick = (criterion: CriterionItem) => {
    setSelectedCriterion(criterion)
    onCriterionClick?.(criterion)
  }

  // Calculate summary stats
  const allCriteria = categories.flatMap((c) => c.criteria)
  const metCount = allCriteria.filter((c) => c.status === 'met').length
  const partialCount = allCriteria.filter((c) => c.status === 'partial').length
  const notMetCount = allCriteria.filter((c) => c.status === 'not_met').length
  const totalCount = allCriteria.length

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-grey-900">{policyName}</h3>
          <p className="text-sm text-grey-500">Policy: {policyId}</p>
        </div>
        {showStatus && totalCount > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="success" size="sm">{metCount} met</Badge>
            {partialCount > 0 && (
              <Badge variant="warning" size="sm">{partialCount} partial</Badge>
            )}
            {notMetCount > 0 && (
              <Badge variant="error" size="sm">{notMetCount} gaps</Badge>
            )}
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id)
          const CategoryIcon = CATEGORY_ICONS[category.icon || 'documentation'] || FileText

          // Category-level status summary
          const categoryMet = category.criteria.filter((c) => c.status === 'met').length
          const categoryTotal = category.criteria.length

          return (
            <div key={category.id} className="rounded-xl border border-grey-200 overflow-hidden">
              {/* Category Header */}
              <button
                className={cn(
                  'w-full flex items-center justify-between p-4 text-left transition-colors',
                  isExpanded ? 'bg-grey-50' : 'bg-white hover:bg-grey-50'
                )}
                onClick={() => toggleCategory(category.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center">
                    <CategoryIcon className="w-4 h-4 text-grey-600" />
                  </div>
                  <div>
                    <span className="font-medium text-grey-900">{category.name}</span>
                    {showStatus && (
                      <span className="ml-2 text-xs text-grey-500">
                        ({categoryMet}/{categoryTotal} met)
                      </span>
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

              {/* Category Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    variants={accordion}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="overflow-hidden"
                  >
                    <div className="p-4 pt-0 space-y-2">
                      {category.criteria.map((criterion) => (
                        <CriterionRow
                          key={criterion.id}
                          criterion={criterion}
                          showStatus={showStatus}
                          onClick={() => handleCriterionClick(criterion)}
                          isSelected={selectedCriterion?.id === criterion.id}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Policy Excerpt Slide-out */}
      <AnimatePresence>
        {selectedCriterion?.policyExcerpt && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <GlassPanel variant="light" padding="md" className="mt-4">
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
              <p className="text-sm text-grey-700 leading-relaxed italic">
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
 * CriterionRow - Individual criterion display
 */
function CriterionRow({
  criterion,
  showStatus,
  onClick,
  isSelected,
}: {
  criterion: CriterionItem
  showStatus: boolean
  onClick: () => void
  isSelected: boolean
}) {
  const status = criterion.status || 'unknown'
  const config = STATUS_CONFIG[status]
  const StatusIcon = config.icon

  return (
    <motion.button
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        'flex items-start gap-3',
        isSelected
          ? 'ring-2 ring-blue-400 border-blue-200 bg-blue-50/50'
          : showStatus
            ? cn(config.bgColor, config.borderColor)
            : 'bg-white border-grey-200 hover:border-grey-300 hover:bg-grey-50'
      )}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
    >
      {/* Status Icon */}
      {showStatus && (
        <StatusIcon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', config.color)} />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-grey-900">{criterion.name}</span>
          {showStatus && criterion.confidence !== undefined && (
            <span className="text-xs text-grey-500">
              {Math.round(criterion.confidence * 100)}%
            </span>
          )}
        </div>
        <p className="text-xs text-grey-600 mt-0.5">{criterion.description}</p>

        {/* Required Evidence */}
        {criterion.requiredEvidence && criterion.requiredEvidence.length > 0 && (
          <div className="mt-2 pt-2 border-t border-grey-200/50">
            <span className="text-xs font-medium text-grey-500">Required Evidence:</span>
            <ul className="mt-1 space-y-0.5">
              {criterion.requiredEvidence.map((evidence, idx) => (
                <li key={idx} className="text-xs text-grey-600 flex items-start gap-1">
                  <span className="text-grey-400">-</span>
                  {evidence}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Badge */}
      {showStatus && (
        <Badge variant={config.badgeVariant} size="sm" className="flex-shrink-0">
          {config.label}
        </Badge>
      )}
    </motion.button>
  )
}

/**
 * PolicyCriteriaSkeleton - Loading state
 */
export function PolicyCriteriaSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-grey-200 rounded w-1/3" />
      <div className="h-4 bg-grey-200 rounded w-1/4" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-grey-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-grey-200" />
            <div className="h-5 bg-grey-200 rounded w-40" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default PolicyCriteriaViewer
