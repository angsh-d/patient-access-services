import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CaseWebSocket } from '@/services/websocket'
import { QUERY_KEYS } from '@/lib/constants'
import type { WebSocketMessage, StageUpdateMessage } from '@/types/api'

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void
  onStageChange?: (previousStage: string, newStage: string) => void
  onError?: (error: Event) => void
  enabled?: boolean
}

/**
 * Hook to subscribe to real-time case updates via WebSocket.
 * Callbacks are stored in refs to prevent reconnect on every render.
 */
export function useWebSocket(caseId: string | undefined, options: UseWebSocketOptions = {}) {
  const { onMessage, onStageChange, onError, enabled = true } = options
  const queryClient = useQueryClient()
  const wsRef = useRef<CaseWebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)

  // Store callbacks in refs so they don't trigger reconnection
  const onMessageRef = useRef(onMessage)
  const onStageChangeRef = useRef(onStageChange)
  const onErrorRef = useRef(onError)

  // Keep refs current
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onStageChangeRef.current = onStageChange }, [onStageChange])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // Handle incoming messages — stable callback via refs
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setLastMessage(message)
    onMessageRef.current?.(message)

    // Handle backend event types (normalized from "event" field)
    const caseId = message.case_id
    switch (message.type) {
      case 'stage_update': {
        const msg = message as StageUpdateMessage
        if (msg.previous_stage && msg.stage) {
          onStageChangeRef.current?.(msg.previous_stage, msg.stage)
        }
        // Invalidate case data so TanStack Query refetches
        if (caseId) {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
        }
        break
      }

      case 'processing_completed': {
        // Refetch all case-related data after processing finishes
        if (caseId) {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.strategies(caseId) })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cases })
        }
        break
      }

      case 'processing_error':
      case 'error': {
        // Refetch to get latest state after error
        if (caseId) {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.case(caseId) })
        }
        break
      }

      // heartbeat and connected are handled silently
    }
  }, [queryClient])

  // Connect/disconnect based on caseId and enabled only
  useEffect(() => {
    if (!caseId || !enabled) {
      return
    }

    const ws = new CaseWebSocket(caseId, {
      onOpen: () => setIsConnected(true),
      onClose: () => setIsConnected(false),
      onError: (e) => onErrorRef.current?.(e),
    })

    ws.connect()
    const unsubscribe = ws.onMessage(handleMessage)

    wsRef.current = ws

    return () => {
      unsubscribe()
      ws.disconnect()
      wsRef.current = null
      setIsConnected(false)
    }
  }, [caseId, enabled, handleMessage])

  // Send message through WebSocket
  const send = useCallback((message: Record<string, unknown>) => {
    wsRef.current?.send(message)
  }, [])

  return {
    isConnected,
    lastMessage,
    send,
  }
}

export default useWebSocket
