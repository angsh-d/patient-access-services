/**
 * ReferenceInfoContent - Collapsible patient/medication details
 *
 * Used inside the WizardStep referenceInfo accordion across
 * multiple wizard steps (Analysis, Decision, Strategy, Submit).
 */

import type { CaseState } from '@/types/case'
import { formatDate } from '@/lib/utils'

interface ReferenceInfoContentProps {
  caseState: CaseState
}

export function ReferenceInfoContent({ caseState }: ReferenceInfoContentProps) {
  const { patient, medication } = caseState

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div>
        <h5 className="font-semibold text-grey-700 mb-2">Patient</h5>
        <div className="space-y-1 text-grey-600">
          <p>{patient.first_name} {patient.last_name}</p>
          <p>DOB: {formatDate(patient.date_of_birth)}</p>
          <p>Payer: {patient.primary_payer}</p>
          <p>DX: {patient.diagnosis_codes.join(', ')}</p>
        </div>
      </div>
      <div>
        <h5 className="font-semibold text-grey-700 mb-2">Medication</h5>
        <div className="space-y-1 text-grey-600">
          <p>{medication.medication_name}</p>
          <p>{medication.dose} - {medication.frequency}</p>
          <p>Prescriber: {medication.prescriber_name}</p>
        </div>
      </div>
    </div>
  )
}
