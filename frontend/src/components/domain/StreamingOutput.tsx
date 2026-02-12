/**
 * StreamingOutput - Progressive LLM output display for SSE-streamed analysis.
 *
 * Shows real-time progress as the backend streams events during policy analysis.
 * Features:
 *   - Animated progress bar with percentage
 *   - Per-payer status indicators as they complete
 *   - Progressive message feed with Framer Motion transitions
 *   - Loading shimmer while waiting for first token
 *   - Completion state with summary
 *
 * Uses the greyscale Apple-inspired design consistent with the rest of the app.
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Activity,
  Shield,
  Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SSEEvent, SSEStatus } from '@/hooks/useSSEStream'

// --- Types ---

interface StreamingOutputProps {
  /** Current stream status */
  status: SSEStatus
  /** All events received */
  events: SSEEvent[]
  /** Progress percentage 0-100 */
  percent: number
  /** Latest status message */
  message: string
  /** Error string, if any */
  error: string | null
  /** Optional className override */
  className?: string
}

// --- Sub-components ---

function ProgressBar({ percent, status }: { percent: number; status: SSEStatus }) {
  const isActive = status === 'connecting' || status === 'streaming'

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-grey-500 uppercase tracking-wider">
          {status === 'connecting' ? 'Connecting' : status === 'streaming' ? 'Analyzing' : status === 'done' ? 'Complete' : status === 'error' ? 'Error' : 'Ready'}
        </span>
        <span className="text-xs font-semibold text-grey-700 tabular-nums">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-grey-100 rounded-full overflow-hidden">
        <motion.div
          className={cn(
            'h-full rounded-full',
            status === 'error' ? 'bg-grey-400' : status === 'done' ? 'bg-grey-900' : 'bg-grey-700'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
        {isActive && percent < 100 && (
          <motion.div
            className="h-full bg-grey-300/40 rounded-full -mt-1.5"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{ width: '30%' }}
          />
        )}
      </div>
    </div>
  )
}

function PayerBadge({ event }: { event: SSEEvent }) {
  const likelihood = event.approval_likelihood || 0
  const criteriaMet = event.criteria_met || 0
  const criteriaTotal = event.criteria_total || 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-grey-200"
    >
      <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center flex-shrink-0">
        <Shield className="w-4 h-4 text-grey-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-grey-900 truncate">{event.payer_name}</span>
          <span className={cn(
            'px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded',
            likelihood > 0.7
              ? 'bg-grey-900 text-white'
              : likelihood > 0.4
              ? 'bg-grey-200 text-grey-700'
              : 'bg-grey-100 text-grey-500'
          )}>
            {event.coverage_status?.replace(/_/g, ' ') || 'assessed'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-grey-500">
            {Math.round(likelihood * 100)}% likelihood
          </span>
          <span className="text-xs text-grey-400">
            {criteriaMet}/{criteriaTotal} criteria
          </span>
        </div>
      </div>
      <CheckCircle2 className="w-4 h-4 text-grey-400 flex-shrink-0" />
    </motion.div>
  )
}

function MessageLine({ message, index }: { message: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-start gap-2 py-1"
    >
      <Activity className="w-3 h-3 text-grey-400 mt-0.5 flex-shrink-0" />
      <span className="text-xs text-grey-600 leading-relaxed">{message}</span>
    </motion.div>
  )
}

function WaitingShimmer() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="h-3 bg-grey-100 rounded"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
          style={{ width: `${60 + i * 12}%` }}
        />
      ))}
    </div>
  )
}

// --- Main Component ---

export function StreamingOutput({
  status,
  events,
  percent,
  message,
  error,
  className,
}: StreamingOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the message feed
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  // Extract payer_complete events for the badge list
  const payerCompleteEvents = events.filter(e => e.event === 'payer_complete')
  // Extract progress messages for the feed
  const progressMessages = events
    .filter(e => e.event === 'progress' || e.event === 'payer_start' || e.event === 'stage_start')
    .map(e => e.message || `${e.event}: ${e.payer_name || e.stage || ''}`)

  if (status === 'idle') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'rounded-xl border overflow-hidden',
        status === 'error'
          ? 'border-grey-300 bg-grey-50'
          : status === 'done'
          ? 'border-grey-200 bg-white'
          : 'border-grey-200 bg-grey-50/50',
        className
      )}
    >
      {/* Header with live indicator */}
      <div className="px-4 py-3 border-b border-grey-100 flex items-center gap-2.5">
        {(status === 'connecting' || status === 'streaming') && (
          <motion.div
            className="flex items-center gap-1.5"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Radio className="w-3.5 h-3.5 text-grey-600" />
            <span className="text-xs font-semibold text-grey-700 uppercase tracking-wider">Live</span>
          </motion.div>
        )}
        {status === 'done' && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-grey-600" />
            <span className="text-xs font-semibold text-grey-700 uppercase tracking-wider">Complete</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-grey-500" />
            <span className="text-xs font-semibold text-grey-500 uppercase tracking-wider">Error</span>
          </div>
        )}
        <div className="flex-1" />
        {(status === 'connecting' || status === 'streaming') && (
          <Loader2 className="w-3.5 h-3.5 text-grey-400 animate-spin" />
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Progress bar */}
        <ProgressBar percent={percent} status={status} />

        {/* Current status message */}
        <div className="flex items-center gap-2">
          {(status === 'connecting' || status === 'streaming') && (
            <Loader2 className="w-3.5 h-3.5 text-grey-400 animate-spin flex-shrink-0" />
          )}
          <p className="text-sm text-grey-600">{message}</p>
        </div>

        {/* Waiting shimmer before first progress event */}
        {status === 'connecting' && events.length === 0 && (
          <WaitingShimmer />
        )}

        {/* Payer completion badges */}
        <AnimatePresence mode="popLayout">
          {payerCompleteEvents.length > 0 && (
            <div className="space-y-2">
              {payerCompleteEvents.map((evt, idx) => (
                <PayerBadge key={`payer-${idx}`} event={evt} />
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Progress message feed (scrollable) */}
        {progressMessages.length > 0 && (
          <div
            ref={scrollRef}
            className="max-h-32 overflow-y-auto border-t border-grey-100 pt-3 -mx-1 px-1"
          >
            {progressMessages.map((msg, idx) => (
              <MessageLine key={idx} message={msg} index={idx} />
            ))}
          </div>
        )}

        {/* Error display */}
        {status === 'error' && error && (
          <div className="p-3 rounded-lg bg-grey-100 border border-grey-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-grey-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-grey-600">{error}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default StreamingOutput
