import { motion } from 'framer-motion'
import { Clock, ChevronRight, Loader2 } from 'lucide-react'
import { cn, formatRelativeDate, getInitials } from '@/lib/utils'
import { Card } from '@/components/ui'
import { StageIndicator } from './StageIndicator'
import { PayerStatusBadge } from './PayerStatusBadge'
import { useDelayedNavigate } from '@/hooks/useDelayedNavigate'
import type { CaseListItem } from '@/types/case'

interface CaseCardProps {
  caseItem: CaseListItem
  className?: string
}

export function CaseCard({ caseItem, className }: CaseCardProps) {
  const { navigate, isNavigating } = useDelayedNavigate()

  const handleClick = () => {
    if (!isNavigating) {
      navigate(`/cases/${caseItem.case_id}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !isNavigating) {
      e.preventDefault()
      navigate(`/cases/${caseItem.case_id}`)
    }
  }

  return (
    <Card
      variant="interactive"
      padding="md"
      className={cn(
        'group focus:outline-none focus:ring-2 focus:ring-grey-400 focus:ring-offset-2 relative',
        isNavigating && 'pointer-events-none',
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View case for ${caseItem.patient_name}, ${caseItem.medication}. Stage: ${caseItem.stage}. Payer status: ${caseItem.payer_status}.`}
    >
      {/* Loading overlay */}
      {isNavigating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-10"
        >
          <div className="flex items-center gap-2 text-grey-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Loading case...</span>
          </div>
        </motion.div>
      )}
      <div className="flex items-start justify-between mb-4">
        {/* Patient Info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-grey-200 flex items-center justify-center">
            <span className="text-sm font-medium text-grey-600">
              {getInitials(caseItem.patient_name)}
            </span>
          </div>
          <div>
            <h3 className="font-medium text-grey-900">
              {caseItem.patient_name}
            </h3>
            <p className="text-sm text-grey-500">
              {caseItem.medication}
            </p>
          </div>
        </div>

        {/* Navigate Arrow */}
        <motion.div
          className="text-grey-300 group-hover:text-grey-500"
          initial={{ x: 0 }}
          whileHover={{ x: 4 }}
          aria-hidden="true"
        >
          <ChevronRight className="w-5 h-5" />
        </motion.div>
      </div>

      {/* Stage Progress */}
      <div className="mb-4">
        <StageIndicator stage={caseItem.stage} compact />
      </div>

      {/* Footer: Status & Time */}
      <div className="flex items-center justify-between pt-3 border-t border-grey-200/50">
        <div className="flex items-center gap-2">
          <PayerStatusBadge status={caseItem.payer_status} />
          <span className="text-xs text-grey-400">
            {caseItem.payer_name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-grey-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs">
            {formatRelativeDate(caseItem.updated_at)}
          </span>
        </div>
      </div>

      {/* Confidence indicator */}
      {caseItem.confidence > 0 && (
        <div className="mt-3 pt-3 border-t border-grey-200/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-grey-500">Confidence</span>
            <span className={cn(
              'font-medium',
              caseItem.confidence >= 0.7 ? 'text-semantic-success' :
              caseItem.confidence >= 0.4 ? 'text-semantic-warning' :
              'text-semantic-error'
            )}>
              {(caseItem.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-1.5 h-1 bg-grey-200 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                caseItem.confidence >= 0.7 ? 'bg-semantic-success' :
                caseItem.confidence >= 0.4 ? 'bg-semantic-warning' :
                'bg-semantic-error'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${caseItem.confidence * 100}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

export default CaseCard
