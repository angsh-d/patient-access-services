/**
 * AIActivityFeed - Real-time feed of AI agent activities
 *
 * Shows:
 * - Recent agent actions color-coded by type
 * - Expandable reasoning for each action
 * - Time-based grouping (just now, minutes ago, etc.)
 */

/**
 * AIActivityFeed - Real-time feed of AI agent activities
 *
 * Design Philosophy:
 * - Greyscale-first with minimal semantic colors
 * - Apple HIG inspired - clean, professional
 * - Color only for status indication (active/success/error)
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  FileSearch,
  Lightbulb,
  Play,
  AlertTriangle,
  ChevronDown,
  Clock,
  CheckCircle2,
  Activity,
} from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { AgentBadge, AgentType } from '@/components/ui/AgentBadge'
import { cn } from '@/lib/utils'
import { formatRelativeDate } from '@/lib/utils'
import { listItem, staggerContainer } from '@/lib/animations'

export interface AIActivityItem {
  id: string
  agentType: AgentType
  action: string
  detail?: string
  reasoning?: string
  confidence?: number
  timestamp: string
  caseId?: string
  patientName?: string
  status?: 'success' | 'in_progress' | 'warning' | 'error'
}

export interface AIActivityFeedProps {
  activities: AIActivityItem[]
  maxItems?: number
  showExpand?: boolean
  onActivityClick?: (activity: AIActivityItem) => void
  className?: string
  isLoading?: boolean
}

const AGENT_ICONS: Record<AgentType, React.ElementType> = {
  intake: FileSearch,
  policy_analyzer: Brain,
  strategy_generator: Lightbulb,
  action_coordinator: Play,
  recovery: AlertTriangle,
  human_review: CheckCircle2,
}

export function AIActivityFeed({
  activities,
  maxItems = 5,
  showExpand = true,
  onActivityClick,
  className,
  isLoading = false,
}: AIActivityFeedProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const displayedActivities = activities.slice(0, maxItems)

  if (isLoading) {
    return <AIActivityFeedSkeleton />
  }

  if (activities.length === 0) {
    return (
      <GlassPanel variant="light" padding="md" className={className}>
        <div className="text-center py-6">
          <Brain className="w-8 h-8 text-grey-300 mx-auto mb-2" />
          <p className="text-sm text-grey-500">No recent AI activity</p>
          <p className="text-xs text-grey-400 mt-1">
            Start a new case to see AI agents in action
          </p>
        </div>
      </GlassPanel>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-grey-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-grey-500" />
          AI Activity Feed
        </h3>
        {activities.length > maxItems && (
          <span className="text-xs text-grey-500">
            Showing {maxItems} of {activities.length}
          </span>
        )}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-2"
      >
        {displayedActivities.map((activity) => {
          const isExpanded = expandedItems.has(activity.id)
          const Icon = AGENT_ICONS[activity.agentType]

          return (
            <motion.div
              key={activity.id}
              variants={listItem}
              className={cn(
                'rounded-xl border bg-white overflow-hidden transition-all',
                activity.status === 'in_progress'
                  ? 'border-grey-300 shadow-sm ring-1 ring-grey-200'
                  : 'border-grey-200'
              )}
            >
              <div
                className="p-3 cursor-pointer hover:bg-grey-50 transition-colors"
                onClick={() => onActivityClick?.(activity)}
              >
                <div className="flex items-start gap-3">
                  {/* Agent Icon - Greyscale first, only status gets color */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      'bg-grey-100 border border-grey-200/50',
                      activity.status === 'in_progress' && 'bg-grey-900',
                      activity.status === 'error' && 'bg-red-50 border-red-200'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 text-grey-500',
                        activity.status === 'in_progress' && 'text-white',
                        activity.status === 'error' && 'text-red-600'
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-grey-900 truncate">
                        {activity.action}
                      </span>
                      {activity.status === 'in_progress' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-grey-900 text-white animate-pulse">
                          Active
                        </span>
                      )}
                    </div>

                    {activity.detail && (
                      <p className="text-xs text-grey-600 mt-0.5 truncate">
                        {activity.detail}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1">
                      <AgentBadge agent={activity.agentType} size="sm" showIcon={false} />
                      {activity.confidence !== undefined && (
                        <span className="text-xs text-grey-500">
                          {Math.round(activity.confidence * 100)}% confidence
                        </span>
                      )}
                      <span className="text-xs text-grey-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeDate(activity.timestamp)}
                      </span>
                    </div>

                    {activity.patientName && (
                      <p className="text-xs text-grey-500 mt-1">
                        Case: {activity.patientName}
                      </p>
                    )}
                  </div>

                  {/* Expand Toggle */}
                  {showExpand && activity.reasoning && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(activity.id)
                      }}
                      className="p-1 hover:bg-grey-100 rounded-lg transition-colors"
                    >
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-grey-400 transition-transform',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Reasoning */}
              <AnimatePresence>
                {isExpanded && activity.reasoning && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-0">
                      <div className="p-3 bg-grey-50 rounded-lg border border-grey-200">
                        <p className="text-xs text-grey-700 leading-relaxed">
                          <span className="font-medium">Reasoning: </span>
                          {activity.reasoning}
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
  )
}

/**
 * AIActivityFeedSkeleton - Loading state
 */
function AIActivityFeedSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-grey-200 animate-pulse" />
        <div className="h-4 bg-grey-200 rounded w-32 animate-pulse" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-grey-200 p-3 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-grey-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-grey-200 rounded w-3/4" />
              <div className="h-3 bg-grey-200 rounded w-1/2" />
              <div className="flex gap-2">
                <div className="h-5 bg-grey-200 rounded w-16" />
                <div className="h-5 bg-grey-200 rounded w-20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * AIActivityFeedCompact - Smaller version for sidebars
 */
export function AIActivityFeedCompact({
  activities,
  maxItems = 3,
}: {
  activities: AIActivityItem[]
  maxItems?: number
}) {
  return (
    <div className="space-y-2">
      {activities.slice(0, maxItems).map((activity) => {
        const Icon = AGENT_ICONS[activity.agentType]
        return (
          <div
            key={activity.id}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-grey-50 transition-colors cursor-pointer"
          >
            <Icon className="w-4 h-4 text-grey-400" />
            <span className="text-xs text-grey-600 truncate flex-1">
              {activity.action}
            </span>
            <span className="text-xs text-grey-400">
              {formatRelativeDate(activity.timestamp)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default AIActivityFeed
