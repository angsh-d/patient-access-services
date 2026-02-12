/**
 * ReviewStep (Step 0) - EHR-style patient data review
 *
 * Modern EHR layout with:
 * - Left sidebar navigation for sections
 * - Main content area with section details
 * - Integrated slide-out PDF viewer
 * - Processing animation while extracting data from documents
 */

import { useState, useEffect } from 'react'
import {
  FileText,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { WizardStep } from '@/components/domain/WizardStep'
import { ExtractedDataReview } from '@/components/domain/ExtractedDataReview'
import { ProcessingAnimation, DATA_EXTRACTION_STEPS } from '@/components/domain/wizard/ProcessingAnimation'
import {
  usePatientData,
  usePatientDocuments,
  useUpdatePatientField,
} from '@/hooks/usePatientData'
import type { CaseState } from '@/types/case'

interface ReviewStepProps {
  caseState: CaseState
  onContinue: () => void
  isProcessing: boolean
  readOnly?: boolean
}

export function ReviewStep({
  caseState,
  onContinue,
  isProcessing,
  readOnly = false,
}: ReviewStepProps) {
  // Get the patient_id from case metadata - try multiple possible locations
  const patientId = (caseState.metadata?.source_patient_id as string | undefined)
    || caseState.patient?.patient_id
    || caseState.case_id // Fallback to case_id if no separate patient ID

  // Fetch full patient data and documents
  const { data: patientData, isLoading: patientLoading, isError, error } = usePatientData(patientId)
  const { data: documentsData } = usePatientDocuments(patientId)
  const updateField = useUpdatePatientField(patientId || '')

  const handleEditField = async (section: string, value: string, reason?: string) => {
    await updateField.mutateAsync({ section, value, reason })
  }

  // Processing animation: show for minimum time before revealing data
  const [animationDone, setAnimationDone] = useState(readOnly)
  useEffect(() => {
    if (readOnly) return
    const timer = setTimeout(() => setAnimationDone(true), 4000)
    return () => clearTimeout(timer)
  }, [readOnly])

  // Show error state if API failed
  if (isError) {
    return (
      <WizardStep
        title="Verify Extracted Data"
        description="Unable to load patient data — cannot proceed without verified data"
        icon={<FileText className="w-6 h-6" />}
      >
        <div className="p-6 bg-grey-50 rounded-xl border border-grey-200 text-center">
          <AlertTriangle className="w-8 h-8 text-grey-400 mx-auto mb-3" />
          <p className="text-sm text-grey-600 mb-2">
            Could not load patient data. Coverage assessment requires verified patient information.
          </p>
          <p className="text-xs text-grey-400">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <p className="text-xs text-grey-500 mt-3">
            Please retry or select a different patient.
          </p>
        </div>
      </WizardStep>
    )
  }

  // If no data and not loading/error, show a helpful message
  if (!patientLoading && !patientData && animationDone) {
    return (
      <WizardStep
        title="Verify Extracted Data"
        description="Patient data not available"
        icon={<FileText className="w-6 h-6" />}
        primaryAction={{
          label: 'Continue Anyway',
          onClick: onContinue,
          disabled: isProcessing,
          icon: <ChevronRight className="w-4 h-4" />,
        }}
      >
        <div className="p-6 bg-grey-50 rounded-xl border border-grey-200 text-center">
          <FileText className="w-8 h-8 text-grey-400 mx-auto mb-3" />
          <p className="text-sm text-grey-600">
            No detailed patient record found for this case.
          </p>
          <p className="text-xs text-grey-400 mt-2">
            Patient ID: {patientId || 'Not available'}
          </p>
        </div>
      </WizardStep>
    )
  }

  return (
    <WizardStep
      title="Verify Extracted Data"
      description={readOnly ? "Patient information reviewed during intake" : "Review patient information, view source documents, and correct any errors before AI analysis"}
      icon={<FileText className="w-6 h-6" />}
      primaryAction={readOnly ? undefined : {
        label: 'Continue to Policy Analysis',
        onClick: onContinue,
        disabled: isProcessing || !animationDone,
        icon: <ChevronRight className="w-4 h-4" />,
      }}
    >
      {/* Processing animation */}
      {!animationDone && (
        <ProcessingAnimation steps={DATA_EXTRACTION_STEPS} isActive={true} />
      )}

      {/* Extracted data — mounted hidden during animation so queries prefetch */}
      <div className={animationDone ? '' : 'hidden'}>
        {patientData && (
          <ExtractedDataReview
            patientData={patientData}
            documents={documentsData?.documents || []}
            onViewDocument={() => {}} // PDF viewing handled internally by component
            onEditField={readOnly ? undefined : handleEditField}
          />
        )}
      </div>
    </WizardStep>
  )
}
