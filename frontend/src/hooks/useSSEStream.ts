/**
 * useSSEStream - React hook for consuming Server-Sent Events from the backend.
 *
 * Connects to the backend SSE streaming endpoint for a given case and stage,
 * parsing incremental progress events as the LLM processes. Uses the native
 * fetch API with ReadableStream for SSE parsing (avoids EventSource CORS
 * limitations and allows full control over reconnection).
 *
 * Event types from backend (see backend/api/routes/cases.py):
 *   stage_start    - {stage, case_id, timestamp}
 *   payer_start    - {payer_name, percent}
 *   progress       - {message, percent}
 *   payer_complete - {payer_name, coverage_status, approval_likelihood, criteria_met, criteria_total}
 *   stage_complete - {full result object}
 *   error          - {message}
 *   done           - signals stream end
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { ENDPOINTS } from '@/lib/constants'

// --- Types ---

export type SSEStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

export interface SSEEvent {
  event: string
  payer_name?: string
  coverage_status?: string
  approval_likelihood?: number
  criteria_met?: number
  criteria_total?: number
  message?: string
  percent?: number
  stage?: string
  case_id?: string
  timestamp?: string
  reasoning?: string
  confidence?: number
  findings?: Array<{
    title: string
    detail: string
    status: string
  }>
  recommendations?: string[]
  warnings?: string[]
  assessments?: Record<string, unknown>
  documentation_gaps?: unknown[]
  [key: string]: unknown
}

export interface SSEStreamState {
  /** Current connection status */
  status: SSEStatus
  /** All events received so far */
  events: SSEEvent[]
  /** Progress percentage (0-100) */
  percent: number
  /** Latest progress or error message */
  message: string
  /** The final stage_complete event, if received */
  result: SSEEvent | null
  /** Error message, if any */
  error: string | null
}

interface UseSSEStreamReturn extends SSEStreamState {
  /** Start streaming for the given case and stage */
  start: (caseId: string, stage: string, refresh?: boolean) => void
  /** Abort an in-progress stream */
  abort: () => void
  /** Reset state back to idle */
  reset: () => void
}

const INITIAL_STATE: SSEStreamState = {
  status: 'idle',
  events: [],
  percent: 0,
  message: '',
  result: null,
  error: null,
}

/**
 * Parse a single SSE `data:` line into a typed event object.
 */
function parseSSEData(raw: string): SSEEvent | null {
  try {
    return JSON.parse(raw) as SSEEvent
  } catch {
    return null
  }
}

// --- Hook ---

export function useSSEStream(): UseSSEStreamReturn {
  const [state, setState] = useState<SSEStreamState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const reconnectAttemptRef = useRef(0)
  const maxReconnects = 2

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(prev => ({
      ...prev,
      status: prev.status === 'streaming' || prev.status === 'connecting' ? 'error' : prev.status,
      error: prev.status === 'streaming' || prev.status === 'connecting' ? 'Stream aborted' : prev.error,
    }))
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    reconnectAttemptRef.current = 0
    setState(INITIAL_STATE)
  }, [])

  const start = useCallback((caseId: string, stage: string, refresh: boolean = false) => {
    // Abort any previous stream
    abortRef.current?.abort()
    reconnectAttemptRef.current = 0

    const controller = new AbortController()
    abortRef.current = controller

    setState({
      ...INITIAL_STATE,
      status: 'connecting',
      message: 'Connecting to analysis stream...',
    })

    const url = refresh
      ? `${ENDPOINTS.streamStage(caseId, stage)}?refresh=true`
      : ENDPOINTS.streamStage(caseId, stage)

    async function consume() {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'text/event-stream' },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        if (!response.body) {
          throw new Error('Response body is null - streaming not supported')
        }

        setState(prev => ({ ...prev, status: 'streaming' }))

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            // Process any remaining buffer
            if (buffer.trim()) {
              processBuffer(buffer)
            }
            // If we never got a 'done' event, mark as done anyway
            setState(prev => {
              if (prev.status === 'streaming') {
                return { ...prev, status: 'done' }
              }
              return prev
            })
            break
          }

          buffer += decoder.decode(value, { stream: true })

          // SSE messages are separated by double newlines
          const parts = buffer.split('\n\n')
          // Keep the last incomplete part in the buffer
          buffer = parts.pop() || ''

          for (const part of parts) {
            processBuffer(part)
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Intentional abort -- don't treat as error unless we set it already
          return
        }

        const errorMsg = err instanceof Error ? err.message : 'Stream connection failed'

        // Attempt reconnect for network-level failures
        if (reconnectAttemptRef.current < maxReconnects) {
          reconnectAttemptRef.current += 1
          const delay = 1000 * reconnectAttemptRef.current
          setState(prev => ({
            ...prev,
            message: `Connection lost, reconnecting in ${delay / 1000}s...`,
          }))
          await new Promise(resolve => setTimeout(resolve, delay))
          // Check if we were aborted during the wait
          if (!controller.signal.aborted) {
            consume()
          }
          return
        }

        setState(prev => ({
          ...prev,
          status: 'error',
          error: errorMsg,
          message: errorMsg,
        }))
      }
    }

    function processBuffer(chunk: string) {
      // Each SSE chunk may have multiple lines; we look for `data: ...`
      const lines = chunk.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (!raw) continue

        const event = parseSSEData(raw)
        if (!event) continue

        setState(prev => {
          const newEvents = [...prev.events, event]
          const update: Partial<SSEStreamState> = { events: newEvents }

          if (event.percent !== undefined) {
            update.percent = event.percent
          }

          switch (event.event) {
            case 'stage_start':
              update.message = `Starting ${event.stage || 'analysis'}...`
              break

            case 'payer_start':
              update.message = `Analyzing ${event.payer_name}...`
              break

            case 'progress':
              update.message = event.message || prev.message
              break

            case 'payer_complete':
              update.message = `${event.payer_name} complete -- ${Math.round((event.approval_likelihood || 0) * 100)}% approval likelihood`
              break

            case 'stage_complete':
              update.result = event
              update.message = 'Analysis complete'
              update.percent = 100
              break

            case 'error':
              update.status = 'error'
              update.error = event.message || 'Unknown error from backend'
              update.message = event.message || 'An error occurred during analysis'
              break

            case 'done':
              update.status = 'done'
              break
          }

          return { ...prev, ...update }
        })
      }
    }

    consume()
  }, [])

  return { ...state, start, abort, reset }
}

export default useSSEStream
