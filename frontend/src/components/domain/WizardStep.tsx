/**
 * WizardStep - Content wrapper for each step in the case processing wizard
 *
 * Provides consistent layout and animations for wizard step content.
 * Each step can have:
 * - Header with title and description
 * - Main content area
 * - Action buttons (primary CTA + secondary actions)
 * - Collapsible reference info
 */

import { ReactNode, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

interface WizardStepProps {
  /** Step title */
  title: string
  /** Step description */
  description?: string
  /** Icon to display next to title */
  icon?: ReactNode
  /** Main content of the step */
  children: ReactNode
  /** Primary action button config */
  primaryAction?: {
    label: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
    icon?: ReactNode
  }
  /** Secondary action buttons */
  secondaryActions?: Array<{
    label: string
    onClick: () => void
    disabled?: boolean
    icon?: ReactNode
    variant?: 'secondary' | 'ghost'
  }>
  /** Collapsible reference information (e.g., patient/medication details) */
  referenceInfo?: {
    title: string
    content: ReactNode
    defaultExpanded?: boolean
  }
  /** Additional class name */
  className?: string
  /** Whether to show loading state */
  isLoading?: boolean
}

export function WizardStep({
  title,
  description,
  icon,
  children,
  primaryAction,
  secondaryActions,
  referenceInfo,
  className,
  isLoading = false,
}: WizardStepProps) {
  const [referenceExpanded, setReferenceExpanded] = useState(referenceInfo?.defaultExpanded ?? false)

  return (
    <motion.div
      className={cn('space-y-6', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Step Header */}
      <div className="flex items-start gap-4">
        {icon && (
          <div className="w-12 h-12 rounded-xl bg-grey-100 flex items-center justify-center text-grey-600 flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-grey-900">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-grey-500">{description}</p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(isLoading && 'opacity-50 pointer-events-none')}>
        {children}
      </div>

      {/* Reference Info Accordion */}
      {referenceInfo && (
        <div className="border border-grey-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setReferenceExpanded(!referenceExpanded)}
            className="w-full flex items-center justify-between p-4 bg-grey-50 hover:bg-grey-100 transition-colors text-left"
          >
            <span className="text-sm font-medium text-grey-700">{referenceInfo.title}</span>
            {referenceExpanded ? (
              <ChevronUp className="w-4 h-4 text-grey-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-grey-400" />
            )}
          </button>
          <AnimatePresence>
            {referenceExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-white border-t border-grey-200">
                  {referenceInfo.content}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Action Buttons */}
      {(primaryAction || secondaryActions) && (
        <div className="flex items-center gap-3 pt-4 border-t border-grey-200">
          {primaryAction && (
            <Button
              variant="primary"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || isLoading}
              leftIcon={primaryAction.icon}
              className="min-w-[180px]"
            >
              {primaryAction.loading ? 'Processing...' : primaryAction.label}
            </Button>
          )}
          {secondaryActions?.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || 'secondary'}
              onClick={action.onClick}
              disabled={action.disabled || isLoading}
              leftIcon={action.icon}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/**
 * WizardStepSkeleton - Loading skeleton for wizard steps
 */
export function WizardStepSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-grey-200" />
        <div className="flex-1">
          <div className="h-6 w-48 bg-grey-200 rounded" />
          <div className="h-4 w-72 bg-grey-100 rounded mt-2" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        <div className="h-24 bg-grey-100 rounded-xl" />
        <div className="h-32 bg-grey-100 rounded-xl" />
      </div>

      {/* Action skeleton */}
      <div className="flex gap-3 pt-4 border-t border-grey-200">
        <div className="h-10 w-44 bg-grey-200 rounded-lg" />
        <div className="h-10 w-32 bg-grey-100 rounded-lg" />
      </div>
    </div>
  )
}

export default WizardStep
