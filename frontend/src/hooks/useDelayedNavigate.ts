/**
 * useDelayedNavigate - Navigation hook with simulated processing delay
 *
 * Adds a random delay (5-8 seconds) before navigation to simulate
 * real-time processing effects in the demo.
 * Uses refs to prevent setState after unmount.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, NavigateOptions } from 'react-router-dom'

interface DelayedNavigateOptions extends NavigateOptions {
  /** Skip the delay and navigate immediately */
  skipDelay?: boolean
  /** Custom delay range in ms [min, max]. Default: [5000, 8000] */
  delayRange?: [number, number]
}

export function useDelayedNavigate() {
  const navigate = useNavigate()
  const [isNavigating, setIsNavigating] = useState(false)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track mount state to prevent setState after unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const delayedNavigate = useCallback(
    async (to: string | number, options?: DelayedNavigateOptions) => {
      const { skipDelay = false, delayRange = [5000, 8000], ...navigateOptions } = options || {}

      if (skipDelay) {
        if (typeof to === 'number') {
          navigate(to)
        } else {
          navigate(to, navigateOptions)
        }
        return
      }

      if (mountedRef.current) {
        setIsNavigating(true)
      }

      // Generate random delay between min and max
      const [min, max] = delayRange
      const delay = Math.floor(Math.random() * (max - min + 1)) + min

      await new Promise<void>(resolve => {
        timerRef.current = setTimeout(resolve, delay)
      })

      if (!mountedRef.current) return

      setIsNavigating(false)

      if (typeof to === 'number') {
        navigate(to)
      } else {
        navigate(to, navigateOptions)
      }
    },
    [navigate]
  )

  return { navigate: delayedNavigate, isNavigating }
}

export default useDelayedNavigate
