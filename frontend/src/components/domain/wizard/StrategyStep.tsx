/**
 * StrategyStep (Step 3) - Select submission strategy
 *
 * Has timeout handling to prevent infinite spinner on slow API responses.
 * Shows:
 * - Strategic intelligence (pattern learning, multi-step reasoning)
 * - Strategy cards with score breakdowns
 * - Risk factors
 * - Generate / Approve actions
 */

import { useState, useRef, useEffect } from 'react'
import {
  Play,
  RefreshCw,
  CheckCircle2,
  Lightbulb,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { Button } from '@/components/ui'
import { StrategicIntelligence } from '@/components/domain/StrategicIntelligence'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { ReferenceInfoContent } from '@/components/domain/wizard/ReferenceInfoContent'
import type { CaseState } from '@/types/case'
import type { Strategy } from '@/types/strategy'
import { cn } from '@/lib/utils'

interface StrategyStepProps {
  caseState: CaseState
  strategies: Strategy[]
  recommendedId?: string
  selectedId?: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
  onRunGeneration: () => void
  isProcessing: boolean
  hasError?: boolean
  onRetry?: () => void
  readOnly?: boolean
}

export function StrategyStep({
  caseState,
  strategies,
  recommendedId,
  selectedId,
  onSelect: _onSelect,
  onConfirm,
  onRunGeneration,
  isProcessing,
  hasError,
  onRetry,
  readOnly = false,
}: StrategyStepProps) {
  const hasStrategies = strategies.length > 0
  const hasConfirmed = useRef(false)
  const [isWaitingForConfirm, setIsWaitingForConfirm] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear waiting state when stage changes (success) or error occurs
  useEffect(() => {
    const stageAdvanced = isWaitingForConfirm && caseState.stage !== 'strategy_generation' && caseState.stage !== 'strategy_selection'
    const errorOccurred = isWaitingForConfirm && hasError

    if (stageAdvanced || errorOccurred) {
      setIsWaitingForConfirm(false)
      if (stageAdvanced) {
        setHasTimedOut(false) // Only clear timeout on success, not on error
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isWaitingForConfirm, caseState.stage, hasError])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Handle confirm with timeout
  const handleConfirmWithTimeout = () => {
    if (hasConfirmed.current) return

    hasConfirmed.current = true
    setIsWaitingForConfirm(true)
    setHasTimedOut(false)

    // Set a 30-second timeout
    timeoutRef.current = setTimeout(() => {
      setHasTimedOut(true)
      setIsWaitingForConfirm(false)
    }, 30000)

    onConfirm()
  }

  // Handle retry
  const handleRetry = () => {
    hasConfirmed.current = false
    setIsWaitingForConfirm(false)
    setHasTimedOut(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    onRetry?.()
  }

  // Check if we need to generate strategies first
  const needsGeneration = caseState.stage === 'strategy_generation' && !hasStrategies

  // Show error state (timeout or API error)
  const showError = hasTimedOut || hasError
  if (showError) {
    return (
      <WizardStep
        title="Submission Plan"
        description={hasTimedOut ? "Strategy selection timed out" : "Strategy selection failed"}
        icon={<Lightbulb className="w-6 h-6" />}
        referenceInfo={{
          title: 'Patient & Medication Details',
          content: <ReferenceInfoContent caseState={caseState} />,
        }}
      >
        <div className="p-12 rounded-xl border border-grey-200 text-center bg-grey-50">
          <XCircle className="w-12 h-12 text-grey-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-grey-700 mb-2">
            {hasTimedOut ? 'Strategy Selection Timed Out' : 'Strategy Selection Failed'}
          </h3>
          <p className="text-sm text-grey-500 max-w-md mx-auto mb-4">
            {hasTimedOut
              ? 'The operation is taking longer than expected. The backend may still be processing. You can retry or check back later.'
              : 'There was an error selecting the strategy. Please try again.'
            }
          </p>
          <Button variant="primary" onClick={handleRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </WizardStep>
    )
  }

  // Show local processing state if we're waiting
  const showProcessing = isProcessing || isWaitingForConfirm

  return (
    <WizardStep
      title="Submission Plan"
      description={readOnly ? "Strategy selected for this case" : "Review and approve the PA submission approach"}
      icon={<Lightbulb className="w-6 h-6" />}
      primaryAction={
        readOnly ? undefined :
        needsGeneration
          ? {
              label: 'Generate Submission Plan',
              onClick: onRunGeneration,
              disabled: showProcessing,
              loading: showProcessing,
              icon: <Play className="w-4 h-4" />,
            }
          : {
              label: 'Approve & Continue',
              onClick: handleConfirmWithTimeout,
              disabled: showProcessing || (!selectedId && !recommendedId),
              loading: showProcessing,
              icon: <CheckCircle2 className="w-4 h-4" />,
            }
      }
      referenceInfo={{
        title: 'Patient & Medication Details',
        content: <ReferenceInfoContent caseState={caseState} />,
      }}
    >
      {readOnly && hasStrategies ? (
        /* Read-only strategy summary from case data (no API calls needed) */
        <div className="space-y-4">
          {strategies.map((strategy) => {
            const isSelected = strategy.id === (selectedId || caseState.selected_strategy_id || recommendedId)
            return (
              <div
                key={strategy.id}
                className={cn(
                  'p-5 rounded-xl border',
                  isSelected ? 'border-grey-900 bg-grey-50' : 'border-grey-200 bg-white'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-grey-900">{strategy.name}</h4>
                      {isSelected && (
                        <span className="text-xs font-medium px-2 py-0.5 bg-grey-900 text-white rounded">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-grey-500 mt-1">{strategy.description}</p>
                  </div>
                </div>

                {/* Score breakdown */}
                <div className="grid grid-cols-4 gap-3 mt-4">
                  <div className="text-center p-2 bg-white rounded-lg border border-grey-100">
                    <p className="text-lg font-semibold text-grey-900">{Math.round(strategy.score.approval_probability * 100)}%</p>
                    <p className="text-xs text-grey-400">Approval</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg border border-grey-100">
                    <p className="text-lg font-semibold text-grey-900">{strategy.estimated_days}d</p>
                    <p className="text-xs text-grey-400">Est. Days</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg border border-grey-100">
                    <p className="text-lg font-semibold text-grey-900">{Math.round(strategy.score.rework_risk * 100)}%</p>
                    <p className="text-xs text-grey-400">Rework Risk</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg border border-grey-100">
                    <p className="text-lg font-semibold text-grey-900">{Math.round(strategy.score.cost_efficiency * 100)}%</p>
                    <p className="text-xs text-grey-400">Efficiency</p>
                  </div>
                </div>

                {/* Risk factors */}
                {strategy.risks.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-grey-500 mb-1">Risk Factors</p>
                    <ul className="space-y-1">
                      {strategy.risks.map((risk, idx) => (
                        <li key={idx} className="text-xs text-grey-600 flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-grey-400 mt-0.5 flex-shrink-0" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : hasStrategies ? (
        <div className="space-y-6">
          {/* AI Strategic Intelligence - Shows pattern learning and multi-step reasoning */}
          <SectionErrorBoundary fallbackTitle="Strategic intelligence unavailable">
            <StrategicIntelligence caseId={caseState.case_id} caseData={{ case: caseState }} />
          </SectionErrorBoundary>
        </div>
      ) : (
        <div className="p-12 rounded-xl border border-dashed border-grey-300 text-center">
          <Lightbulb className="w-12 h-12 text-grey-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-grey-700 mb-2">Generate Submission Plan</h3>
          <p className="text-sm text-grey-500 max-w-md mx-auto">
            Click below to generate the submission plan. This follows the standard approach:
            submit to primary insurance first, then coordinate with secondary.
          </p>
        </div>
      )}
    </WizardStep>
  )
}
