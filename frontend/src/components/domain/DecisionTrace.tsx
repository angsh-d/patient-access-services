import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  MessageSquare,
  Zap,
  Eye,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { cn, formatTime, formatDate } from '@/lib/utils'
import { Card, Badge } from '@/components/ui'
import type { TraceEvent } from '@/types/api'

interface DecisionTraceProps {
  events: TraceEvent[]
  className?: string
}

export function DecisionTrace({ events, className }: DecisionTraceProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  const groupedEvents = events.reduce<Record<string, TraceEvent[]>>((acc, event) => {
    const date = formatDate(event.timestamp)
    if (!acc[date]) acc[date] = []
    acc[date].push(event)
    return acc
  }, {})

  return (
    <div className={cn('space-y-6', className)}>
      {Object.entries(groupedEvents).map(([date, dayEvents]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-grey-200" />
            <span className="text-xs text-grey-500 font-medium">{date}</span>
            <div className="h-px flex-1 bg-grey-200" />
          </div>

          <div className="space-y-2">
            {dayEvents.map((event, index) => (
              <TraceEventCard
                key={event.id}
                event={event}
                isExpanded={expandedIds.has(event.id)}
                onToggle={() => toggleExpand(event.id)}
                index={index}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface TraceEventCardProps {
  event: TraceEvent
  isExpanded: boolean
  onToggle: () => void
  index: number
}

function TraceEventCard({ event, isExpanded, onToggle, index }: TraceEventCardProps) {
  const eventIcons: Record<TraceEvent['event_type'], React.ReactNode> = {
    decision: <MessageSquare className="w-4 h-4" aria-hidden="true" />,
    action: <Zap className="w-4 h-4" aria-hidden="true" />,
    observation: <Eye className="w-4 h-4" aria-hidden="true" />,
    error: <AlertCircle className="w-4 h-4" aria-hidden="true" />,
  }

  const eventColors: Record<TraceEvent['event_type'], string> = {
    decision: 'bg-semantic-info/10 text-semantic-info',
    action: 'bg-semantic-success/10 text-semantic-success',
    observation: 'bg-grey-200 text-grey-600',
    error: 'bg-semantic-error/10 text-semantic-error',
  }

  const hasReasoning = !!event.reasoning

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      <Card variant="default" padding="none" className="overflow-hidden">
        <button
          onClick={onToggle}
          aria-expanded={hasReasoning ? isExpanded : undefined}
          aria-controls={hasReasoning ? `trace-reasoning-${event.id}` : undefined}
          aria-label={`${event.event_type} by ${event.agent}: ${event.description}${hasReasoning ? `. Click to ${isExpanded ? 'collapse' : 'expand'} reasoning.` : ''}`}
          className="w-full p-4 flex items-start gap-3 text-left hover:bg-grey-50 transition-colors focus:outline-none focus:ring-2 focus:ring-grey-400 focus:ring-offset-2"
        >
          {/* Event type icon */}
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            eventColors[event.event_type]
          )}>
            {eventIcons[event.event_type]}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-grey-900">
                {event.agent}
              </span>
              <Badge variant="neutral" size="sm">
                {event.event_type}
              </Badge>
              <span className="text-xs text-grey-400 ml-auto flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(event.timestamp)}
              </span>
            </div>
            <p className="text-sm text-grey-600 line-clamp-2">
              {event.description}
            </p>

            {/* Confidence */}
            {event.confidence !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-grey-500">Confidence:</span>
                <span className={cn(
                  'text-xs font-medium',
                  event.confidence >= 0.7 ? 'text-semantic-success' :
                  event.confidence >= 0.4 ? 'text-semantic-warning' :
                  'text-semantic-error'
                )}>
                  {(event.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {/* Expand indicator */}
          {event.reasoning && (
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-grey-400"
            >
              <ChevronRight className="w-5 h-5" />
            </motion.div>
          )}
        </button>

        {/* Expanded reasoning */}
        <AnimatePresence>
          {isExpanded && event.reasoning && (
            <motion.div
              id={`trace-reasoning-${event.id}`}
              role="region"
              aria-label={`Reasoning for ${event.event_type} by ${event.agent}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="px-4 pb-4 pt-0 ml-11">
                <div className="p-3 bg-grey-50 rounded-lg">
                  <p className="text-xs text-grey-500 mb-1">Reasoning</p>
                  <p className="text-sm text-grey-700 whitespace-pre-wrap">
                    {event.reasoning}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

export default DecisionTrace
