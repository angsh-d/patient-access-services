/**
 * SubmitStep (Step 4) - Execute and monitor PA submissions
 *
 * Auto-submit is disabled; PA submissions require explicit user confirmation.
 * Shows:
 * - Ready to submit prompt with manual submit button
 * - Submission progress spinner
 * - Payer status cards with reference numbers
 * - Error / timeout retry handling
 * - Mark as complete action when in monitoring stage
 */

import { useState, useRef, useEffect } from 'react'
import {
  Play,
  RefreshCw,
  CheckCircle2,
  Eye,
  Loader2,
  XCircle,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { Button } from '@/components/ui'
import { PayerStatusBadge } from '@/components/domain/PayerStatusBadge'
import { ReferenceInfoContent } from '@/components/domain/wizard/ReferenceInfoContent'
import type { CaseState } from '@/types/case'
import { formatDate, cn } from '@/lib/utils'

interface SubmitStepProps {
  caseState: CaseState
  onRunCoordination: () => Promise<void>
  onComplete: () => void
  isProcessing: boolean
  hasError?: boolean
  onRetry?: () => void
}

export function SubmitStep({
  caseState,
  onRunCoordination,
  onComplete,
  isProcessing,
  hasError,
  onRetry,
}: SubmitStepProps) {
  const hasAutoSubmitted = useRef(false)
  const [isWaitingForRefresh, setIsWaitingForRefresh] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const payerEntries = Object.entries(caseState.payer_states || {})
  const isMonitoring = caseState.stage === 'monitoring'
  const hasSubmissions = payerEntries.some(([, state]) => state.status !== 'not_submitted')

  // Clear waiting state when data is refreshed OR when error occurs
  useEffect(() => {
    if (isWaitingForRefresh && (isMonitoring || hasSubmissions || hasError)) {
      setIsWaitingForRefresh(false)
      setHasTimedOut(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isWaitingForRefresh, isMonitoring, hasSubmissions, hasError])

  const handleManualSubmit = async () => {
    if (hasAutoSubmitted.current) return
    hasAutoSubmitted.current = true
    setIsWaitingForRefresh(true)
    setHasTimedOut(false)
    timeoutRef.current = setTimeout(() => {
      setHasTimedOut(true)
      setIsWaitingForRefresh(false)
    }, 30000)
    try {
      await onRunCoordination()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    } catch (error) {
      console.error('Submit failed:', error)
      setIsWaitingForRefresh(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }

  // Auto-submit DISABLED: PA submissions require explicit user confirmation
  // to prevent accidental submissions. User must click "Submit" button.

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Handle retry
  const handleRetry = () => {
    hasAutoSubmitted.current = false
    setIsWaitingForRefresh(false)
    setHasTimedOut(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    onRetry?.()
  }

  // Show loading state while processing OR waiting for data refresh after submission
  const isSubmitting = isProcessing || isWaitingForRefresh
  const showError = hasError || hasTimedOut

  return (
    <WizardStep
      title={isMonitoring ? 'Monitoring Submissions' : 'Submitting to Payers'}
      description={isMonitoring ? 'Tracking payer responses' : 'Executing strategy and submitting PA requests'}
      icon={isMonitoring ? <Eye className="w-6 h-6" /> : <Play className="w-6 h-6" />}
      primaryAction={
        isMonitoring
          ? {
              label: 'Mark as Complete',
              onClick: onComplete,
              disabled: isProcessing,
              icon: <CheckCircle2 className="w-4 h-4" />,
            }
          : undefined // No manual submit button - auto-submits
      }
      referenceInfo={{
        title: 'Patient & Medication Details',
        content: <ReferenceInfoContent caseState={caseState} />,
      }}
    >
      {showError ? (
        <div className="p-12 rounded-xl border border-grey-200 text-center bg-grey-50">
          <XCircle className="w-12 h-12 text-grey-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-grey-700 mb-2">
            {hasTimedOut ? 'Submission Timed Out' : 'Submission Failed'}
          </h3>
          <p className="text-sm text-grey-500 max-w-md mx-auto mb-4">
            {hasTimedOut
              ? 'The submission is taking longer than expected. The backend may still be processing. You can retry or check back later.'
              : 'There was an error submitting the PA requests. Please try again.'
            }
          </p>
          <Button variant="primary" onClick={handleRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Submission
          </Button>
        </div>
      ) : (hasSubmissions || isMonitoring) && !isSubmitting ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-grey-50 border border-grey-200">
            <div className="flex items-center gap-2 mb-2">
              {isMonitoring ? (
                <Eye className="w-4 h-4 text-grey-500" />
              ) : (
                <Play className="w-4 h-4 text-grey-500" />
              )}
              <span className="text-sm font-medium text-grey-700">
                {isMonitoring ? 'Monitoring Status' : 'Execution Status'}
              </span>
            </div>
            <p className="text-sm text-grey-600">
              {isMonitoring
                ? 'Submissions sent to payers. Monitoring for responses and tracking approval status.'
                : 'Executing the selected strategy and submitting PA requests to payers.'
              }
            </p>
          </div>

          {/* Payer Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payerEntries.map(([payerName, payerState]) => {
              const status = payerState.status || 'unknown'
              const isApproved = status === 'approved'

              return (
                <div
                  key={payerName}
                  className={cn(
                    'p-4 rounded-xl border',
                    isApproved ? 'bg-grey-900 border-grey-900' : 'bg-grey-50 border-grey-200'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      'font-semibold',
                      isApproved ? 'text-white' : 'text-grey-900'
                    )}>{payerName}</span>
                    <PayerStatusBadge status={payerState.status} />
                  </div>
                  {payerState.reference_number && (
                    <p className={cn('text-xs', isApproved ? 'text-grey-300' : 'text-grey-500')}>
                      Ref: {payerState.reference_number}
                    </p>
                  )}
                  {payerState.submitted_at && (
                    <p className={cn('text-xs', isApproved ? 'text-grey-300' : 'text-grey-500')}>
                      Submitted: {formatDate(payerState.submitted_at)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : isSubmitting ? (
        <div className="p-12 rounded-xl border border-grey-200 text-center bg-grey-50">
          <Loader2 className="w-12 h-12 text-grey-400 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-grey-700 mb-2">Submitting PA Requests</h3>
          <p className="text-sm text-grey-500 max-w-md mx-auto">
            Automatically submitting to payers using the selected strategy...
          </p>
        </div>
      ) : (
        <div className="p-12 rounded-xl border border-grey-200 text-center bg-grey-50">
          <Play className="w-12 h-12 text-grey-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-grey-700 mb-2">Ready to Submit</h3>
          <p className="text-sm text-grey-500 max-w-md mx-auto mb-6">
            Submit prior authorization requests to payers using the selected strategy.
          </p>
          <Button variant="primary" onClick={handleManualSubmit}>
            <Play className="w-4 h-4 mr-2" />
            Submit Now
          </Button>
        </div>
      )}
    </WizardStep>
  )
}
