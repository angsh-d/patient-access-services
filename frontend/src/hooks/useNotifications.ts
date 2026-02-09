/**
 * Hook for subscribing to system-wide policy notifications via WebSocket.
 */

import { useEffect, useRef, useState } from 'react'
import { NotificationsWebSocket } from '@/services/websocket'
import type { PolicyUpdateNotification } from '@/types/api'

interface UseNotificationsOptions {
  onPolicyUpdate?: (notification: PolicyUpdateNotification) => void
}

export function useNotifications({ onPolicyUpdate }: UseNotificationsOptions = {}) {
  const wsRef = useRef<NotificationsWebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const callbackRef = useRef(onPolicyUpdate)
  callbackRef.current = onPolicyUpdate

  useEffect(() => {
    const ws = new NotificationsWebSocket()
    wsRef.current = ws

    const unsubscribe = ws.onNotification((notification) => {
      callbackRef.current?.(notification)
    })

    ws.connect()

    const checkConnection = setInterval(() => {
      setIsConnected(ws.isConnected)
    }, 2000)

    return () => {
      clearInterval(checkConnection)
      unsubscribe()
      ws.disconnect()
      wsRef.current = null
    }
  }, [])

  return { isConnected }
}
