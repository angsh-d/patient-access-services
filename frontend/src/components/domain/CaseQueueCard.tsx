import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowRight,
  Brain,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui'
import type { CaseStage, PayerStatus } from '@/types/case'

export interface CaseQueueItem {
  caseId: string
  patientName: string
  patientInitials: string
  medication: string
  payerName: string
  stage: CaseStage
  payerStatus: PayerStatus
  aiStatus?: string
  confidence?: number
  updatedAt: string
  daysInQueue?: number
  priority?: 'high' | 'medium' | 'low'
}

interface CaseQueueCardProps {
  item: CaseQueueItem
  onProcess: (caseId: string) => void
  variant?: 'compact' | 'expanded'
  className?: string
}

const priorityConfig = {
  high: {
    icon: AlertTriangle,
    color: '#ff3b30',
    bg: 'rgba(255, 59, 48, 0.03)',
    border: 'rgba(255, 59, 48, 0.08)',
    label: 'Urgent',
  },
  medium: {
    icon: Clock,
    color: '#ff9500',
    bg: 'rgba(255, 149, 0, 0.03)',
    border: 'rgba(255, 149, 0, 0.08)',
    label: 'Pending',
  },
  low: {
    icon: CheckCircle2,
    color: '#aeaeb2',
    bg: 'rgba(0, 0, 0, 0.01)',
    border: 'rgba(0, 0, 0, 0.05)',
    label: 'On Track',
  },
}

function getPriorityFromStage(stage: CaseStage, payerStatus: PayerStatus): 'high' | 'medium' | 'low' {
  if (stage === 'awaiting_human_decision') return 'high'
  if (stage === 'strategy_selection') return 'high'
  if (payerStatus === 'pending_info') return 'high'

  if (stage === 'policy_analysis') return 'medium'
  if (stage === 'strategy_generation') return 'medium'
  if (payerStatus === 'under_review') return 'medium'

  return 'low'
}

export function CaseQueueCard({
  item,
  onProcess,
  variant = 'compact',
  className,
}: CaseQueueCardProps) {
  const priority = item.priority ?? getPriorityFromStage(item.stage, item.payerStatus)
  const config = priorityConfig[priority]
  const PriorityIcon = config.icon

  if (variant === 'compact') {
    return (
      <motion.div
        className={cn('flex items-center gap-3.5 cursor-pointer group', className)}
        style={{
          padding: '10px 12px',
          borderRadius: '12px',
          background: config.bg,
          border: `0.5px solid ${config.border}`,
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={() => onProcess(item.caseId)}
        whileTap={{ scale: 0.99 }}
        whileHover={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', background: '#ffffff' }}
      >
        <div className="flex-shrink-0">
          <PriorityIcon className="w-4 h-4" style={{ color: config.color }} strokeWidth={2} />
        </div>

        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0, 0, 0, 0.04)' }}
        >
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6e6e73' }}>
            {item.patientInitials}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.01em' }}>
              {item.patientName}
            </span>
            <span style={{ color: '#d1d1d6', fontSize: '0.6875rem' }}>&middot;</span>
            <span className="truncate" style={{ fontSize: '0.8125rem', color: '#6e6e73' }}>
              {item.medication}
            </span>
          </div>
          {item.aiStatus && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Brain className="w-3 h-3" style={{ color: '#aeaeb2' }} />
              <span style={{ fontSize: '0.6875rem', color: '#aeaeb2', fontWeight: 500 }}>{item.aiStatus}</span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div
            className="flex items-center gap-1.5"
            style={{
              padding: '5px 10px',
              background: '#1d1d1f',
              color: '#ffffff',
              fontSize: '0.6875rem',
              fontWeight: 600,
              borderRadius: '8px',
              letterSpacing: '-0.003em',
            }}
          >
            Process
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={cn('cursor-pointer group', className)}
      style={{
        borderRadius: '14px',
        border: `0.5px solid ${config.border}`,
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={() => onProcess(item.caseId)}
      whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' }}
      whileTap={{ scale: 0.995 }}
    >
      <div style={{ padding: '10px 16px', background: config.bg }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PriorityIcon className="w-3.5 h-3.5" style={{ color: config.color }} />
            <Badge
              variant={priority === 'high' ? 'error' : priority === 'medium' ? 'warning' : 'neutral'}
              size="sm"
            >
              {config.label}
            </Badge>
          </div>
          <span style={{ fontSize: '0.6875rem', color: '#aeaeb2', fontWeight: 500 }}>{item.payerName}</span>
        </div>
      </div>

      <div style={{ padding: '16px', background: '#ffffff' }}>
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0, 0, 0, 0.04)' }}
          >
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#6e6e73' }}>
              {item.patientInitials}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="truncate" style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.015em' }}>
              {item.patientName}
            </h4>
            <p className="truncate" style={{ fontSize: '0.8125rem', color: '#6e6e73' }}>{item.medication}</p>
          </div>
        </div>

        {item.aiStatus && (
          <div
            className="mt-3"
            style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.02)' }}
          >
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5" style={{ color: '#aeaeb2' }} />
              <span style={{ fontSize: '0.8125rem', color: '#6e6e73' }}>{item.aiStatus}</span>
            </div>
            {item.confidence !== undefined && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(0, 0, 0, 0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${item.confidence * 100}%`, background: '#1d1d1f' }}
                  />
                </div>
                <span style={{ fontSize: '0.6875rem', color: '#aeaeb2', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(item.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        )}

        <motion.button
          type="button"
          className="mt-3 w-full flex items-center justify-center gap-2"
          style={{
            padding: '8px 16px',
            background: '#1d1d1f',
            color: '#ffffff',
            fontSize: '0.8125rem',
            fontWeight: 600,
            borderRadius: '10px',
            letterSpacing: '-0.006em',
            border: 'none',
            cursor: 'pointer',
          }}
          whileTap={{ scale: 0.97 }}
          onClick={(e) => {
            e.stopPropagation()
            onProcess(item.caseId)
          }}
        >
          Process Case
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </motion.div>
  )
}

interface CaseQueueListProps {
  items: CaseQueueItem[]
  onProcess: (caseId: string) => void
  title?: string
  emptyMessage?: string
  maxItems?: number
  showViewAll?: boolean
  onViewAll?: () => void
}

export function CaseQueueList({
  items,
  onProcess,
  title,
  emptyMessage = 'No cases in queue',
  maxItems,
  showViewAll,
  onViewAll,
}: CaseQueueListProps) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items
  const hasMore = maxItems && items.length > maxItems

  return (
    <div>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#6e6e73', letterSpacing: '-0.01em' }}>{title}</h3>
          {showViewAll && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="transition-colors duration-200"
              style={{ fontSize: '0.75rem', fontWeight: 500, color: '#aeaeb2' }}
            >
              View all ({items.length})
            </button>
          )}
        </div>
      )}

      {displayItems.length === 0 ? (
        <div className="py-8 text-center">
          <User className="w-7 h-7 mx-auto mb-2" style={{ color: '#d1d1d6' }} />
          <p style={{ fontSize: '0.8125rem', color: '#aeaeb2' }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayItems.map((item) => (
            <CaseQueueCard
              key={item.caseId}
              item={item}
              onProcess={onProcess}
              variant="compact"
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={onViewAll}
              className="w-full py-2 transition-colors duration-200"
              style={{ fontSize: '0.75rem', fontWeight: 500, color: '#aeaeb2' }}
            >
              + {items.length - displayItems.length} more cases
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default CaseQueueCard
