import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Pill, ArrowRight, Check, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, Button, GlassPanel } from '@/components/ui'
import { useCreateCase } from '@/hooks/useCases'
import { cn, getInitials } from '@/lib/utils'
import { ENDPOINTS, CACHE_TIMES } from '@/lib/constants'

interface PatientScenario {
  patient_id: string
  first_name: string
  last_name: string
  age: number | null
  condition: string
  icd10_code: string
  payer: string
  medication_name: string
  generic_name: string
  indication: string
}

function useAvailablePatients() {
  return useQuery({
    queryKey: ['patients', 'available'],
    queryFn: async () => {
      const res = await fetch(ENDPOINTS.patients)
      if (!res.ok) throw new Error('Failed to fetch patients')
      const data = await res.json()
      return data.patients as PatientScenario[]
    },
    staleTime: CACHE_TIMES.STATIC,
  })
}

export function NewCase() {
  const navigate = useNavigate()
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null)
  const createCase = useCreateCase()
  const { data: patients, isLoading: patientsLoading } = useAvailablePatients()

  // Group patients by payer
  const grouped = useMemo(() => {
    if (!patients) return {}
    const groups: Record<string, PatientScenario[]> = {}
    for (const p of patients) {
      const key = p.payer || 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return groups
  }, [patients])

  const handleCreateCase = async () => {
    if (!selectedPatient) return

    try {
      const result = await createCase.mutateAsync({
        patient_id: selectedPatient,
      })
      navigate(`/cases/${result.case_id}`)
    } catch (error) {
      console.error('Failed to create case:', error)
    }
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Start New Case"
        subtitle="Select a patient scenario to begin"
        showBack
        backTo="/"
      />

      <div className="p-8 max-w-4xl mx-auto">
        {/* Intro */}
        <GlassPanel variant="light" padding="md" className="mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-grey-900 flex items-center justify-center flex-shrink-0">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-grey-900 mb-1">
                Prior Authorization Request
              </h2>
              <p className="text-sm text-grey-600">
                Select a patient scenario below. The agentic system will analyze the
                patient's eligibility, assess payer policies, and recommend the
                optimal strategy for approval.
              </p>
            </div>
          </div>
        </GlassPanel>

        {/* Loading state */}
        {patientsLoading && (
          <div className="flex items-center justify-center py-12 gap-3 text-grey-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading available patients...</span>
          </div>
        )}

        {/* Patient cards grouped by payer */}
        {Object.entries(grouped).map(([payerName, payerPatients]) => (
          <div key={payerName} className="mb-8">
            <h3 className="text-sm font-medium text-grey-500 uppercase tracking-wider mb-4">
              {payerName} ({payerPatients.length} patients)
            </h3>

            <div className="space-y-3">
              {payerPatients.map((patient, index) => (
                <motion.div
                  key={patient.patient_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <PatientCard
                    patient={patient}
                    isSelected={selectedPatient === patient.patient_id}
                    onSelect={() => setSelectedPatient(patient.patient_id)}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        ))}

        {/* Action */}
        {patients && patients.length > 0 && (
          <motion.div
            className="flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              variant="primary"
              size="lg"
              disabled={!selectedPatient}
              isLoading={createCase.isPending}
              onClick={handleCreateCase}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Start Case
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

interface PatientCardProps {
  patient: PatientScenario
  isSelected: boolean
  onSelect: () => void
}

function PatientCard({ patient, isSelected, onSelect }: PatientCardProps) {
  const fullName = `${patient.first_name} ${patient.last_name}`
  const ageDisplay = patient.age !== null && patient.age !== undefined
    ? `${patient.age} yrs`
    : ''

  return (
    <Card
      variant={isSelected ? 'elevated' : 'default'}
      padding="none"
      className={cn(
        'cursor-pointer transition-all duration-normal',
        isSelected && 'ring-2 ring-grey-900'
      )}
      onClick={onSelect}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Patient avatar */}
            <div className="w-12 h-12 rounded-xl bg-grey-200 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-grey-600">
                {getInitials(fullName)}
              </span>
            </div>

            {/* Patient & medication info */}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <h3 className="font-semibold text-grey-900">
                  {fullName}
                </h3>
                {ageDisplay && (
                  <span className="text-xs text-grey-400">{ageDisplay}</span>
                )}
              </div>
              <p className="text-sm text-grey-500 mb-1.5 line-clamp-1">
                {patient.condition}
              </p>

              <div className="flex items-center gap-2">
                <Pill className="w-3.5 h-3.5 text-grey-400" />
                <span className="text-sm font-medium text-grey-700">
                  {patient.medication_name}
                </span>
                {patient.icd10_code && (
                  <span className="text-xs text-grey-400 ml-1">
                    {patient.icd10_code}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Selection indicator */}
          <div
            className={cn(
              'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
              isSelected
                ? 'bg-grey-900 border-grey-900'
                : 'border-grey-300'
            )}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default NewCase
