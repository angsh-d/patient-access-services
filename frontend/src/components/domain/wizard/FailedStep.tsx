/**
 * FailedStep - Error state when case processing fails
 *
 * Shows the error message and provides a retry action.
 */

import {
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import type { CaseState } from '@/types/case'

interface FailedStepProps {
  caseState: CaseState
  onRetry: () => void
}

export function FailedStep({
  caseState,
  onRetry,
}: FailedStepProps) {
  return (
    <WizardStep
      title="Case Failed"
      description="An error occurred during processing"
      icon={<XCircle className="w-6 h-6 text-grey-500" />}
      primaryAction={{
        label: 'Retry Processing',
        onClick: onRetry,
        icon: <RefreshCw className="w-4 h-4" />,
      }}
    >
      <div className="p-6 rounded-xl bg-grey-100 border border-grey-300">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-grey-200 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-6 h-6 text-grey-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-grey-900">Processing Failed</h3>
            <p className="text-sm text-grey-600 mt-1">
              {caseState.error_message || 'An unexpected error occurred during case processing.'}
            </p>
            <p className="text-sm text-grey-500 mt-3">
              You can retry processing or contact support if the issue persists.
            </p>
          </div>
        </div>
      </div>
    </WizardStep>
  )
}
