/**
 * ExtractedDataReview - Modern EHR-style patient data review
 *
 * Layout:
 * - Left sidebar with section navigation
 * - Main content area with active section details
 * - Slide-out PDF viewer panel on the right
 */

import { useState, useMemo } from 'react'
import { PdfViewer } from '@/components/ui/PdfViewer'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  CreditCard,
  Stethoscope,
  Pill,
  FileText,
  Activity,
  ClipboardList,
  FlaskConical,
  ScanLine,
  AlertTriangle,
  X,
  ExternalLink,
  Edit3,
  Check,
  FileWarning,
  CheckCircle2,
  Clock,
  Scale,
  ChevronDown,
  ChevronRight,
  Circle,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENDPOINTS, QUERY_KEYS, CACHE_TIMES } from '@/lib/constants'
import type {
  PatientData,
  PatientDocument,
  Diagnosis,
  PriorTreatment,
  LabPanel,
  LabResult,
} from '@/hooks/usePatientData'

// Section definition for navigation
interface Section {
  id: string
  label: string
  icon: React.ReactNode
  badge?: { text: string; variant: 'success' | 'warning' | 'error' | 'neutral' }
}

interface ExtractedDataReviewProps {
  patientData: PatientData
  documents: PatientDocument[]
  onViewDocument: (filename: string) => void
  onEditField?: (section: string, value: string, reason?: string) => Promise<void>
  isEditing?: boolean
}

// Helper to format address object
function formatAddress(address?: { street: string; city: string; state: string; zip: string }): string {
  if (!address) return ''
  return `${address.street}, ${address.city}, ${address.state} ${address.zip}`
}

/**
 * DataField - Stacked label/value display for grid layouts (Apple HIG style)
 * Label on top, value below - works well in multi-column grids
 */
function DataField({
  label,
  value,
  className,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <div className={cn("py-3", className)}>
      <p className="text-xs font-medium text-grey-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={cn(
        "text-sm text-grey-900",
        mono && "font-mono"
      )}>
        {value || <span className="text-grey-300">—</span>}
      </p>
    </div>
  )
}

/**
 * Editable field component - stacked layout with edit capability
 */
function EditableField({
  label,
  value,
  fieldPath,
  onEdit,
}: {
  label: string
  value: string | number | undefined
  fieldPath: string
  onEdit?: (section: string, value: string, reason?: string) => Promise<void>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value || ''))

  const handleSave = async () => {
    if (onEdit && editValue !== String(value)) {
      await onEdit(fieldPath, editValue)
    }
    setIsEditing(false)
  }

  return (
    <div className="py-3 group">
      <p className="text-xs font-medium text-grey-400 uppercase tracking-wide mb-1">{label}</p>
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-sm text-grey-900 border border-grey-300 rounded-lg px-3 py-1.5 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-grey-900/10"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            className="p-1.5 text-grey-600 hover:bg-grey-100 rounded-lg transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="p-1.5 text-grey-400 hover:bg-grey-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-grey-900">{value || <span className="text-grey-300">—</span>}</span>
          {onEdit && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1 hover:bg-grey-100 rounded opacity-0 group-hover:opacity-100 transition-all"
            >
              <Edit3 className="w-3 h-3 text-grey-400" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Section header with source document link
 */
function SectionHeader({
  title,
  sourceDocument,
  onViewDocument,
}: {
  title: string
  sourceDocument?: string
  onViewDocument?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-grey-100">
      <h3 className="text-xl font-semibold text-grey-900">{title}</h3>
      {sourceDocument && onViewDocument && (
        <button
          type="button"
          onClick={onViewDocument}
          className="flex items-center gap-1.5 text-sm text-grey-500 hover:text-grey-900 font-medium transition-colors"
        >
          <FileText className="w-4 h-4" />
          View Source
          <ExternalLink className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

/**
 * Main ExtractedDataReview component
 */
export function ExtractedDataReview({
  patientData,
  documents,
  onEditField,
}: ExtractedDataReviewProps) {
  const [activeSection, setActiveSection] = useState('demographics')
  const [pdfViewerDoc, setPdfViewerDoc] = useState<string | null>(null)
  const [isDocViewerMaximized, setIsDocViewerMaximized] = useState(false)

  // Get payer and medication for policy lookup
  const payerName = patientData.insurance?.primary?.payer_name?.toLowerCase() || ''
  const medicationName = patientData.medication_request?.medication_name?.toLowerCase().replace(/\s+/g, '') || ''

  // Fetch digitized policy for this case
  const { data: digitizedPolicy, isLoading: policyLoading } = useQuery({
    queryKey: QUERY_KEYS.policyDigitized(payerName, medicationName),
    queryFn: async () => {
      const { request } = await import('@/services/api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await request<any>(ENDPOINTS.policyDigitized(payerName, medicationName))
    },
    enabled: !!payerName && !!medicationName,
    staleTime: CACHE_TIMES.STATIC,
    refetchOnMount: true,
  })

  // Match patient diagnosis to policy indication
  const matchedIndication = useMemo(() => {
    if (!digitizedPolicy?.indications || !patientData.diagnoses) return null

    // Get patient's ICD-10 codes
    const patientCodes = patientData.diagnoses.map(d => d.icd10_code?.toUpperCase())

    // Find matching indication based on ICD-10 codes or name matching
    for (const indication of digitizedPolicy.indications) {
      // Check ICD-10 code matches
      if (indication.indication_codes) {
        for (const code of indication.indication_codes) {
          if (patientCodes.some(pc => pc?.startsWith(code.code?.split('.')[0]))) {
            return indication
          }
        }
      }
      // Generic name-based matching
      const indicationNameLower = indication.indication_name?.toLowerCase() || ''
      for (const dx of patientData.diagnoses) {
        const dxDesc = dx.description?.toLowerCase() || ''
        // Check if indication name appears in diagnosis description or vice versa
        if (indicationNameLower && dxDesc && (
          dxDesc.includes(indicationNameLower) ||
          indicationNameLower.includes(dxDesc.split(',')[0].trim())
        )) {
          return indication
        }
      }
    }
    return null
  }, [digitizedPolicy, patientData.diagnoses])

  // Get the relevant criteria for the matched indication
  const relevantCriteria = useMemo(() => {
    if (!digitizedPolicy || !matchedIndication) return []

    const criteriaIds = new Set<string>()

    // Recursively collect all criterion IDs from a group
    const collectCriteriaIds = (groupId: string) => {
      const group = digitizedPolicy.criterion_groups?.[groupId]
      if (!group) return

      group.criteria?.forEach((id: string) => criteriaIds.add(id))
      group.subgroups?.forEach((subgroupId: string) => collectCriteriaIds(subgroupId))
    }

    // Start from the indication's root criteria group
    if (matchedIndication.initial_approval_criteria) {
      collectCriteriaIds(matchedIndication.initial_approval_criteria)
    }

    // Return the actual criterion objects
    return Array.from(criteriaIds)
      .map(id => digitizedPolicy.atomic_criteria?.[id])
      .filter(Boolean)
  }, [digitizedPolicy, matchedIndication])

  // Count of policy requirements (used for future badge display)
  const _policyRequirementCount = relevantCriteria.length
  void _policyRequirementCount // Suppress unused warning

  // Build sections list based on available data
  const sections: Section[] = [
    { id: 'demographics', label: 'Demographics', icon: <User className="w-4 h-4" /> },
    { id: 'insurance', label: 'Insurance', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'prescriber', label: 'Prescriber', icon: <Stethoscope className="w-4 h-4" /> },
    { id: 'medication', label: 'Medication', icon: <Pill className="w-4 h-4" /> },
    { id: 'diagnoses', label: 'Diagnoses', icon: <ClipboardList className="w-4 h-4" />, badge: { text: `${patientData.diagnoses?.length || 0}`, variant: 'neutral' as const } },
    ...(patientData.disease_activity ? [{ id: 'disease_activity', label: 'Disease Activity', icon: <Activity className="w-4 h-4" /> }] : []),
    ...(patientData.prior_treatments?.length ? [{ id: 'prior_treatments', label: 'Prior Treatments', icon: <FileText className="w-4 h-4" />, badge: { text: `${patientData.prior_treatments.length}`, variant: 'neutral' as const } }] : []),
    ...(patientData.laboratory_results ? [{ id: 'labs', label: 'Laboratory', icon: <FlaskConical className="w-4 h-4" /> }] : []),
    ...(patientData.procedures?.length ? [{ id: 'procedures', label: 'Procedures', icon: <ScanLine className="w-4 h-4" /> }] : []),
    ...(patientData.imaging?.length ? [{ id: 'imaging', label: 'Imaging', icon: <ScanLine className="w-4 h-4" /> }] : []),
  ]

  const handleViewDoc = (filename?: string) => {
    if (filename) {
      setPdfViewerDoc(filename)
    }
  }

  // PA Readiness status
  const readinessStatus = patientData.overall_pa_readiness?.status
  const gapCount = patientData.documentation_gaps?.length || 0

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[600px] bg-grey-50/50 rounded-2xl overflow-hidden border border-grey-200/60">
      {/* Left Sidebar Navigation - Glassmorphism style */}
      <nav className="w-64 bg-white/80 backdrop-blur-xl border-r border-grey-200/60 flex flex-col flex-shrink-0">
        {/* PA Readiness Header */}
        <div className={cn(
          "p-4 border-b border-grey-100",
          readinessStatus === 'READY_FOR_SUBMISSION' && 'bg-grey-900',
          readinessStatus === 'NEEDS_DOCUMENTATION' && 'bg-grey-800',
          readinessStatus === 'NOT_READY' && 'bg-grey-700',
          !readinessStatus && 'bg-grey-100'
        )}>
          <div className="flex items-center gap-2 mb-1">
            {readinessStatus === 'READY_FOR_SUBMISSION' && <CheckCircle2 className="w-4 h-4 text-white" />}
            {readinessStatus === 'NEEDS_DOCUMENTATION' && <Clock className="w-4 h-4 text-grey-300" />}
            {readinessStatus === 'NOT_READY' && <AlertTriangle className="w-4 h-4 text-grey-300" />}
            <span className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              readinessStatus ? "text-grey-400" : "text-grey-500"
            )}>
              PA Readiness
            </span>
          </div>
          <p className={cn(
            "text-sm font-medium",
            readinessStatus ? "text-white" : "text-grey-500"
          )}>
            {readinessStatus?.replace(/_/g, ' ') || 'Checking...'}
          </p>
          {gapCount > 0 && (
            <p className={cn(
              "text-xs mt-1",
              readinessStatus ? "text-grey-400" : "text-grey-500"
            )}>
              {gapCount} item{gapCount > 1 ? 's' : ''} need attention
            </p>
          )}
        </div>

        {/* Section Links */}
        <div className="flex-1 overflow-y-auto py-3">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-2.5 text-left transition-all duration-150",
                activeSection === section.id
                  ? "bg-grey-100 text-grey-900"
                  : "text-grey-500 hover:bg-grey-50 hover:text-grey-700"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "transition-colors",
                  activeSection === section.id ? "text-grey-900" : "text-grey-400"
                )}>
                  {section.icon}
                </span>
                <span className="text-sm font-medium">{section.label}</span>
              </div>
              {section.badge && (
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded",
                  section.badge.variant === 'warning'
                    ? "bg-grey-200 text-grey-700"
                    : "bg-grey-100 text-grey-500"
                )}>
                  {section.badge.text}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Documents Section */}
        <div className="border-t border-grey-100 p-4">
          <p className="text-xs font-medium text-grey-400 uppercase tracking-wide mb-3">Source Documents</p>
          <div className="space-y-1">
            {documents.slice(0, 4).map((doc) => (
              <button
                key={doc.filename}
                type="button"
                onClick={() => handleViewDoc(doc.filename)}
                className="w-full flex items-center gap-2 px-2 py-2 text-left text-xs text-grey-600 hover:bg-grey-100 rounded-lg transition-all"
              >
                <FileText className="w-3.5 h-3.5 text-grey-400 flex-shrink-0" />
                <span className="truncate">{doc.filename.replace(/^\d+_/, '').replace(/_/g, ' ').replace('.pdf', '')}</span>
              </button>
            ))}
            {documents.length > 4 && (
              <p className="text-xs text-grey-400 px-2 pt-1">+{documents.length - 4} more</p>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 bg-white/90 backdrop-blur-sm min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {activeSection === 'demographics' && (
              <DemographicsSection
                data={patientData.demographics}
                sourceDocument={patientData.demographics?.source_document}
                onViewDocument={() => handleViewDoc(patientData.demographics?.source_document)}
                onEditField={onEditField}
              />
            )}

            {activeSection === 'insurance' && (
              <InsuranceSection
                data={patientData.insurance}
                sourceDocument={patientData.insurance?.primary?.source_document}
                onViewDocument={() => handleViewDoc(patientData.insurance?.primary?.source_document)}
              />
            )}

            {activeSection === 'prescriber' && (
              <PrescriberSection
                data={patientData.prescriber}
                sourceDocument={patientData.prescriber?.source_document}
                onViewDocument={() => handleViewDoc(patientData.prescriber?.source_document)}
              />
            )}

            {activeSection === 'medication' && (
              <MedicationSection
                data={patientData.medication_request}
                sourceDocument={patientData.medication_request?.source_document}
                onViewDocument={() => handleViewDoc(patientData.medication_request?.source_document)}
              />
            )}

            {activeSection === 'diagnoses' && (
              <DiagnosesSection
                diagnoses={patientData.diagnoses || []}
                onViewDocument={(doc) => handleViewDoc(doc)}
              />
            )}

            {activeSection === 'disease_activity' && patientData.disease_activity && (
              <DiseaseActivitySection
                data={patientData.disease_activity}
                onViewDocument={() => handleViewDoc(patientData.disease_activity?.source_documents?.[0])}
              />
            )}

            {activeSection === 'prior_treatments' && (
              <PriorTreatmentsSection
                treatments={patientData.prior_treatments || []}
                onViewDocument={(doc) => handleViewDoc(doc)}
              />
            )}

            {activeSection === 'labs' && patientData.laboratory_results && (
              <LaboratorySection
                data={patientData.laboratory_results}
                onViewDocument={() => handleViewDoc(patientData.laboratory_results?.source_document)}
              />
            )}

            {activeSection === 'procedures' && (
              <ProceduresSection
                procedures={patientData.procedures || []}
                onViewDocument={(doc) => handleViewDoc(doc)}
              />
            )}

            {activeSection === 'imaging' && (
              <ImagingSection
                imaging={patientData.imaging || []}
                onViewDocument={(doc) => handleViewDoc(doc)}
              />
            )}

            {activeSection === 'screening' && patientData.pre_biologic_screening && (
              <ScreeningSection data={patientData.pre_biologic_screening} />
            )}

            {activeSection === 'gaps' && (
              <DocumentationGapsSection gaps={patientData.documentation_gaps || []} />
            )}

            {activeSection === 'policy_requirements' && (
              <PolicyRequirementsSection
                policy={digitizedPolicy}
                matchedIndication={matchedIndication}
                relevantCriteria={relevantCriteria}
                patientData={patientData}
                isLoading={policyLoading}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* PDF Viewer Slide-out Panel */}
      <AnimatePresence>
        {pdfViewerDoc && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "bg-grey-900 border-l border-grey-800 flex flex-col flex-shrink-0 transition-all duration-300",
              isDocViewerMaximized ? "w-[calc(100%-256px)]" : "w-[520px]"
            )}
          >
            <div className="flex items-center justify-between p-4 border-b border-grey-800 min-w-0">
              <h3 className="text-sm font-medium text-white truncate flex-1 min-w-0 pr-4">
                {pdfViewerDoc.replace(/^\d+_/, '').replace(/_/g, ' ')}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDocViewerMaximized(!isDocViewerMaximized)}
                  className="p-1.5 hover:bg-grey-800 rounded-lg transition-colors"
                  title={isDocViewerMaximized ? "Restore panel size" : "Maximize panel"}
                >
                  {isDocViewerMaximized ? (
                    <Minimize2 className="w-4 h-4 text-grey-400" />
                  ) : (
                    <Maximize2 className="w-4 h-4 text-grey-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPdfViewerDoc(null)
                    setIsDocViewerMaximized(false)
                  }}
                  className="p-2 hover:bg-grey-700 rounded-lg transition-colors"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                  title="Close panel"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-grey-800 m-2 rounded-lg overflow-hidden">
              <PdfViewer
                key={`${pdfViewerDoc}-${isDocViewerMaximized}`}
                url={`/api/v1/patients/${patientData.patient_id}/documents/${pdfViewerDoc}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Section Components

function DemographicsSection({
  data,
  sourceDocument,
  onViewDocument,
  onEditField,
}: {
  data: PatientData['demographics']
  sourceDocument?: string
  onViewDocument: () => void
  onEditField?: (section: string, value: string) => Promise<void>
}) {
  if (!data) return <EmptySection title="Demographics" />

  return (
    <div>
      <SectionHeader title="Demographics" sourceDocument={sourceDocument} onViewDocument={onViewDocument} />

      {/* Primary Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-6 border-b border-grey-100">
        <EditableField label="First Name" value={data.first_name} fieldPath="demographics.first_name" onEdit={onEditField} />
        <EditableField label="Last Name" value={data.last_name} fieldPath="demographics.last_name" onEdit={onEditField} />
        <EditableField label="Date of Birth" value={data.date_of_birth} fieldPath="demographics.date_of_birth" onEdit={onEditField} />
        <DataField label="Age" value={data.age ? `${data.age} years` : undefined} />
        <DataField label="Gender" value={data.gender} />
        <DataField label="MRN" value={data.mrn} mono />
      </div>

      {/* Secondary Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6">
        <DataField label="Phone" value={data.phone} />
        <DataField label="Ethnicity" value={data.ethnicity} />
        {data.address && (
          <DataField
            label="Address"
            value={formatAddress(data.address)}
            className="col-span-2"
          />
        )}
      </div>
    </div>
  )
}

function InsuranceSection({
  data,
  sourceDocument,
  onViewDocument,
}: {
  data: PatientData['insurance']
  sourceDocument?: string
  onViewDocument: () => void
}) {
  if (!data) return <EmptySection title="Insurance" />

  return (
    <div className="space-y-6">
      <SectionHeader title="Insurance" sourceDocument={sourceDocument} onViewDocument={onViewDocument} />

      {/* Primary Insurance */}
      <div className="bg-grey-50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-grey-200">
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-grey-900 text-white">Primary</span>
          <span className="text-base font-semibold text-grey-900">{data.primary?.payer_name}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6">
          <DataField label="Plan" value={data.primary?.plan_name} />
          <DataField label="Plan Type" value={data.primary?.plan_type} />
          <DataField label="Member ID" value={data.primary?.member_id} mono />
          <DataField label="Group Number" value={data.primary?.group_number} mono />
          <DataField label="Payer ID" value={data.primary?.payer_id} mono />
        </div>
      </div>

      {/* Secondary Insurance */}
      {data.secondary && (
        <div className="bg-grey-50/50 rounded-xl p-5 border border-grey-100">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-grey-200">
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-grey-200 text-grey-700">Secondary</span>
            <span className="text-base font-semibold text-grey-900">{data.secondary.payer_name}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
            <DataField label="Member ID" value={data.secondary.member_id} mono />
          </div>
        </div>
      )}
    </div>
  )
}

function PrescriberSection({
  data,
  sourceDocument,
  onViewDocument,
}: {
  data: PatientData['prescriber']
  sourceDocument?: string
  onViewDocument: () => void
}) {
  if (!data) return <EmptySection title="Prescriber" />

  return (
    <div>
      <SectionHeader title="Prescriber" sourceDocument={sourceDocument} onViewDocument={onViewDocument} />

      {/* Main Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 border-b border-grey-100">
        <DataField label="Physician Name" value={data.name} />
        <DataField label="NPI" value={data.npi} mono />
        <DataField label="Specialty" value={data.specialty} />
        <DataField label="Phone" value={data.phone} />
        <DataField label="Fax" value={data.fax} />
      </div>

      {/* Address */}
      {data.address && (
        <div className="grid grid-cols-1">
          <DataField label="Practice Address" value={formatAddress(data.address)} />
        </div>
      )}
    </div>
  )
}

function MedicationSection({
  data,
  sourceDocument,
  onViewDocument,
}: {
  data: PatientData['medication_request']
  sourceDocument?: string
  onViewDocument: () => void
}) {
  if (!data) return <EmptySection title="Medication Request" />

  // Format frequency display
  const frequencyDisplay = typeof data.frequency === 'object'
    ? `Induction: ${data.frequency.induction || 'N/A'}, Maintenance: ${data.frequency.maintenance || 'N/A'}`
    : data.frequency

  return (
    <div>
      <SectionHeader title="Medication Request" sourceDocument={sourceDocument} onViewDocument={onViewDocument} />

      {/* Medication Hero */}
      <div className="bg-grey-900 rounded-xl p-5 mb-6">
        <h4 className="text-xl font-semibold text-white">{data.medication_name}</h4>
        {data.brand_name && <p className="text-sm text-grey-300 mt-1">{data.brand_name}</p>}
        {data.j_code && (
          <p className="text-xs font-mono text-grey-400 mt-2">J-Code: {data.j_code}</p>
        )}
      </div>

      {/* Dosing Information */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 border-b border-grey-100">
        <DataField label="Dose" value={data.dose} />
        <DataField label="Route" value={data.route} />
        <DataField label="Frequency" value={frequencyDisplay} />
        <DataField label="Site of Care" value={data.site_of_care} />
      </div>

      {/* Request Details */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6">
        <DataField label="Duration Requested" value={data.duration_requested} />
        <DataField label="Quantity" value={data.quantity_requested} />
        <DataField label="Start Date" value={data.start_date_requested} />
      </div>
    </div>
  )
}

function DiagnosesSection({
  diagnoses,
  onViewDocument,
}: {
  diagnoses: Diagnosis[]
  onViewDocument: (doc: string) => void
}) {
  if (!diagnoses.length) return <EmptySection title="Diagnoses" />

  return (
    <div>
      <SectionHeader title="Diagnoses" />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {diagnoses.map((dx, idx) => (
          <div
            key={idx}
            className="bg-grey-50 rounded-xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded",
                  dx.rank === 'primary' ? "bg-grey-900 text-white" : "bg-grey-200 text-grey-600"
                )}>
                  {dx.rank === 'primary' ? 'Primary' : 'Secondary'}
                </span>
              </div>
              {dx.status && (
                <span className="text-xs font-medium text-grey-500 bg-grey-100 px-2 py-0.5 rounded">
                  {dx.status}
                </span>
              )}
            </div>
            <code className="text-base font-mono font-semibold text-grey-900 block mb-2">{dx.icd10_code}</code>
            <p className="text-sm text-grey-700">{dx.description}</p>
            {dx.coding_note && (
              <p className="text-xs text-grey-400 mt-2 italic">{dx.coding_note}</p>
            )}
            {dx.source_document && (
              <button
                type="button"
                onClick={() => onViewDocument(dx.source_document!)}
                className="mt-3 text-xs text-grey-500 hover:text-grey-700 flex items-center gap-1 transition-colors"
              >
                <FileText className="w-3 h-3" />
                View Source
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DiseaseActivitySection({
  data,
  onViewDocument,
}: {
  data: NonNullable<PatientData['disease_activity']>
  onViewDocument: () => void
}) {
  return (
    <div>
      <SectionHeader
        title="Disease Activity"
        sourceDocument={data.source_documents?.[0]}
        onViewDocument={onViewDocument}
      />

      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 border-b border-grey-100">
        <DataField label="Disease Severity" value={data.disease_severity?.replace(/_/g, ' ')} />
        <DataField label="Assessment Date" value={data.assessment_date} />
        <DataField label="Phenotype" value={data.disease_phenotype} />
      </div>

      {/* Activity Scores */}
      <div className="mt-6">
        <p className="text-xs font-medium text-grey-400 uppercase tracking-wide mb-3">Clinical Activity Scores</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.cdai_score !== undefined && (
            <div className="bg-grey-50 rounded-xl p-4">
              <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">CDAI Score</p>
              <p className="text-2xl font-semibold text-grey-900 mt-1">{data.cdai_score}</p>
              {data.cdai_interpretation && (
                <p className="text-sm text-grey-500 mt-1">{data.cdai_interpretation}</p>
              )}
            </div>
          )}
          {data.ses_cd_score !== undefined && (
            <div className="bg-grey-50 rounded-xl p-4">
              <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">SES-CD Score</p>
              <p className="text-2xl font-semibold text-grey-900 mt-1">{data.ses_cd_score}</p>
              {data.ses_cd_interpretation && (
                <p className="text-sm text-grey-500 mt-1">{data.ses_cd_interpretation}</p>
              )}
            </div>
          )}
          {data.harvey_bradshaw_index !== undefined && (
            <div className="bg-grey-50 rounded-xl p-4">
              <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">Harvey-Bradshaw Index</p>
              <p className="text-2xl font-semibold text-grey-900 mt-1">{data.harvey_bradshaw_index}</p>
              {data.hbi_interpretation && (
                <p className="text-sm text-grey-500 mt-1">{data.hbi_interpretation}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PriorTreatmentsSection({
  treatments,
  onViewDocument,
}: {
  treatments: PriorTreatment[]
  onViewDocument: (doc: string) => void
}) {
  if (!treatments.length) return <EmptySection title="Prior Treatments" />

  return (
    <div>
      <SectionHeader title="Prior Treatments" />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {treatments.map((tx, idx) => (
          <div key={idx} className="bg-grey-50 rounded-xl p-5 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="text-base font-semibold text-grey-900">{tx.medication_name}</h4>
                {tx.brand_name && <p className="text-sm text-grey-500">{tx.brand_name}</p>}
                {tx.drug_class && <p className="text-xs text-grey-400 mt-0.5">{tx.drug_class}</p>}
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded-md text-xs font-medium",
                tx.outcome === 'inadequate_response' || tx.outcome === 'intolerance'
                  ? 'bg-grey-800 text-white'
                  : 'bg-grey-200 text-grey-700'
              )}>
                {tx.outcome?.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">Dose</p>
                <p className="text-grey-900">{tx.dose || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">Duration</p>
                <p className="text-grey-900">{tx.duration_weeks ? `${tx.duration_weeks} weeks` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">Start</p>
                <p className="text-grey-900">{tx.start_date || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-grey-400 uppercase tracking-wide">End</p>
                <p className="text-grey-900">{tx.end_date || '—'}</p>
              </div>
            </div>

            {/* Outcome Description */}
            {tx.outcome_description && (
              <p className="text-sm text-grey-600 mt-4 pt-3 border-t border-grey-200 flex-1">
                {tx.outcome_description}
              </p>
            )}

            {/* Source Link */}
            {tx.source_document && (
              <button
                type="button"
                onClick={() => onViewDocument(tx.source_document!)}
                className="mt-3 text-xs text-grey-500 hover:text-grey-700 flex items-center gap-1 transition-colors"
              >
                <FileText className="w-3 h-3" />
                View Source
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function LaboratorySection({
  data,
  onViewDocument,
}: {
  data: NonNullable<PatientData['laboratory_results']>
  onViewDocument: () => void
}) {
  return (
    <div>
      <SectionHeader
        title="Laboratory Results"
        sourceDocument={data.source_document}
        onViewDocument={onViewDocument}
      />

      <p className="text-sm text-grey-500 mb-4">Collection Date: {data.collection_date}</p>

      {/* Lab Panels - panels is a Record<string, LabPanel> */}
      {data.panels && Object.entries(data.panels).map(([panelKey, panel]: [string, LabPanel]) => (
        <div key={panelKey} className="mb-6 last:mb-0">
          <h4 className="text-sm font-semibold text-grey-900 mb-3 flex items-center gap-2">
            {panel.panel_name}
            {panel.clinical_interpretation && (
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-grey-200 text-grey-700">
                {panel.clinical_interpretation}
              </span>
            )}
          </h4>
          <div className="bg-grey-50 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-grey-100">
                  <th className="text-left px-3 py-2 font-medium text-grey-600">Test</th>
                  <th className="text-right px-3 py-2 font-medium text-grey-600">Value</th>
                  <th className="text-right px-3 py-2 font-medium text-grey-600">Reference</th>
                  <th className="text-center px-3 py-2 font-medium text-grey-600">Flag</th>
                </tr>
              </thead>
              <tbody>
                {panel.results?.map((result: LabResult, ridx: number) => (
                  <tr key={ridx} className="border-t border-grey-200">
                    <td className="px-3 py-2 text-grey-900">{result.test}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {result.value} <span className="text-grey-500">{result.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-grey-500">{result.reference_range}</td>
                    <td className="px-3 py-2 text-center">
                      {result.flag && (
                        <span className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-medium",
                          result.flag === 'H' || result.flag === 'L'
                            ? 'bg-grey-800 text-white'
                            : 'bg-grey-200 text-grey-700'
                        )}>
                          {result.flag}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProceduresSection({
  procedures,
  onViewDocument,
}: {
  procedures: NonNullable<PatientData['procedures']>
  onViewDocument: (doc: string) => void
}) {
  if (!procedures.length) return <EmptySection title="Procedures" />

  return (
    <div>
      <SectionHeader title="Procedures" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {procedures.map((proc, idx) => (
          <div key={idx} className="p-4 bg-grey-50 rounded-lg border border-grey-200">
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold text-grey-900">{proc.procedure_type}</h4>
              <span className="text-xs text-grey-500">{proc.procedure_date}</span>
            </div>
            {proc.findings_summary && (
              <p className="text-sm text-grey-700 mb-2">{proc.findings_summary}</p>
            )}
            {proc.source_document && (
              <button
                type="button"
                onClick={() => onViewDocument(proc.source_document!)}
                className="text-xs text-grey-600 hover:text-grey-900 flex items-center gap-1 transition-colors"
              >
                <FileText className="w-3 h-3" />
                View Report
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ImagingSection({
  imaging,
  onViewDocument,
}: {
  imaging: NonNullable<PatientData['imaging']>
  onViewDocument: (doc: string) => void
}) {
  if (!imaging.length) return <EmptySection title="Imaging" />

  return (
    <div>
      <SectionHeader title="Imaging Studies" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {imaging.map((img, idx) => (
          <div key={idx} className="p-4 bg-grey-50 rounded-lg border border-grey-200">
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold text-grey-900">{img.modality}</h4>
              <span className="text-xs text-grey-500">{img.study_date}</span>
            </div>
            {img.findings_summary && (
              <p className="text-sm text-grey-700 mb-2">{img.findings_summary}</p>
            )}
            {img.impression && (
              <p className="text-sm text-grey-600 italic">{img.impression}</p>
            )}
            {img.source_document && (
              <button
                type="button"
                onClick={() => onViewDocument(img.source_document!)}
                className="mt-2 text-xs text-grey-600 hover:text-grey-900 flex items-center gap-1 transition-colors"
              >
                <FileText className="w-3 h-3" />
                View Report
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScreeningSection({
  data,
}: {
  data: NonNullable<PatientData['pre_biologic_screening']>
}) {
  // Helper to get greyscale status styling
  const getStatusStyle = (result?: string) => {
    const isNegative = result?.toLowerCase() === 'negative'
    return isNegative
      ? 'bg-grey-900 text-white'
      : 'bg-grey-200 text-grey-700'
  }

  return (
    <div>
      <SectionHeader title="Pre-Biologic Screening" />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* TB Screening */}
        {data.tb_screening && (
          <div className="p-5 bg-grey-50 rounded-xl border border-grey-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-grey-900">TB Screening</h4>
              <span className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium",
                getStatusStyle(data.tb_screening.result)
              )}>
                {data.tb_screening.result || data.tb_screening.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <DataField label="Test Type" value={data.tb_screening.test_type} />
              <DataField label="Date" value={data.tb_screening.date} />
            </div>
          </div>
        )}

        {/* Hepatitis B Screening */}
        {data.hepatitis_b_screening && (
          <div className="p-5 bg-grey-50 rounded-xl border border-grey-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-grey-900">Hepatitis B Screening</h4>
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-grey-200 text-grey-700">
                {data.hepatitis_b_screening.status}
              </span>
            </div>
          </div>
        )}

        {/* Hepatitis C Screening */}
        {data.hepatitis_c_screening && (
          <div className="p-5 bg-grey-50 rounded-xl border border-grey-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-grey-900">Hepatitis C Screening</h4>
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-grey-200 text-grey-700">
                {data.hepatitis_c_screening.status}
              </span>
            </div>
            {data.hepatitis_c_screening.note && (
              <p className="text-xs text-grey-600">{data.hepatitis_c_screening.note}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DocumentationGapsSection({
  gaps,
}: {
  gaps: NonNullable<PatientData['documentation_gaps']>
}) {
  if (!gaps.length) {
    return (
      <div>
        <SectionHeader title="Documentation Gaps" />
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-grey-300 mx-auto mb-4" />
          <p className="text-base font-medium text-grey-900">All documentation complete</p>
          <p className="text-sm text-grey-500">No gaps identified</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader title="Documentation Gaps" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {gaps.map((gap, idx) => (
          <div
            key={idx}
            className="p-5 bg-grey-100 rounded-xl border border-grey-200"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-grey-900 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileWarning className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-grey-900">{gap.gap_type || 'Missing Information'}</h4>
                <p className="text-sm text-grey-600 mt-1">{gap.description}</p>
                {gap.impact && (
                  <p className="text-xs text-grey-500 mt-2">
                    <span className="font-medium text-grey-700">Impact:</span> {gap.impact}
                  </p>
                )}
                {gap.recommended_action && (
                  <p className="text-xs text-grey-600 mt-1">
                    <span className="font-medium">Action:</span> {gap.recommended_action}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Policy Requirements Section - Shows criteria specific to this case
 */
interface PolicyRequirementsSectionProps {
  policy: any
  matchedIndication: any
  relevantCriteria: any[]
  patientData: PatientData
  isLoading: boolean
}

function PolicyRequirementsSection({
  policy,
  matchedIndication,
  relevantCriteria,
  patientData,
  isLoading,
}: PolicyRequirementsSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['all']))

  // Group criteria by category
  const groupedCriteria = useMemo(() => {
    const groups: Record<string, any[]> = {}
    relevantCriteria.forEach(criterion => {
      const category = criterion.category || 'other'
      if (!groups[category]) groups[category] = []
      groups[category].push(criterion)
    })
    return groups
  }, [relevantCriteria])

  // All criteria show as "pending" on the Review step (pre-AI analysis)
  const statusCounts = useMemo(() => {
    return { met: 0, notMet: 0, partial: 0, pending: relevantCriteria.length, total: relevantCriteria.length }
  }, [relevantCriteria])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Policy Requirements" />
        <div className="space-y-4">
          <div className="h-24 bg-grey-100 rounded-xl animate-pulse" />
          <div className="h-40 bg-grey-100 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  // No policy found
  if (!policy) {
    return (
      <div>
        <SectionHeader title="Policy Requirements" />
        <div className="text-center py-12 bg-grey-50 rounded-xl">
          <Scale className="w-12 h-12 text-grey-300 mx-auto mb-4" />
          <p className="text-base font-medium text-grey-900">Policy Not Found</p>
          <p className="text-sm text-grey-500 mt-1">
            No digitized policy found for {patientData.insurance?.primary?.payer_name || 'this payer'} / {patientData.medication_request?.medication_name || 'this medication'}
          </p>
        </div>
      </div>
    )
  }

  // No matching indication
  if (!matchedIndication) {
    return (
      <div>
        <SectionHeader title="Policy Requirements" />
        <div className="bg-grey-50 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-grey-200 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-grey-500" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-grey-900">No Matching Indication</h4>
              <p className="text-sm text-grey-600 mt-1">
                Patient's diagnosis does not match any covered indication in the {policy.payer_name} policy for {policy.medication_name}.
              </p>
              <p className="text-xs text-grey-500 mt-3">
                Patient diagnoses: {patientData.diagnoses?.map(d => `${d.icd10_code} - ${d.description}`).join(', ') || 'None documented'}
              </p>
              <p className="text-xs text-grey-500 mt-1">
                Covered indications: {policy.indications?.map((i: any) => i.indication_name).join(', ')}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Category display names
  const categoryLabels: Record<string, string> = {
    age: 'Age Requirements',
    diagnosis: 'Diagnosis',
    step_therapy: 'Step Therapy',
    prior_treatment: 'Prior Treatments',
    safety: 'Safety Screenings',
    safety_screening: 'Pre-Biologic Safety Screening',
    prescriber: 'Prescriber Requirements',
    lab: 'Laboratory',
    documentation: 'Documentation',
    clinical: 'Clinical Criteria',
    other: 'Other Requirements',
  }

  return (
    <div>
      <SectionHeader title="Policy Requirements for This Case" />

      {/* Indication Match Header */}
      <div className="bg-grey-900 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-grey-400 uppercase tracking-wide mb-1">Matched Indication</p>
            <h4 className="text-lg font-semibold text-white">{matchedIndication.indication_name}</h4>
            {matchedIndication.indication_codes?.length > 0 && (
              <p className="text-xs font-mono text-grey-400 mt-1">
                {matchedIndication.indication_codes.map((c: any) => `${c.system}: ${c.code}`).join(' | ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-grey-400">Initial Approval</p>
            <p className="text-sm font-medium text-white">{matchedIndication.initial_approval_duration_months} months</p>
          </div>
        </div>
      </div>

      {/* Pending AI Analysis banner */}
      <div className="p-4 rounded-xl bg-grey-100 border border-grey-200 mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-grey-400" />
          <div>
            <h4 className="text-sm font-semibold text-grey-700">Pending AI Analysis</h4>
            <p className="text-xs text-grey-500 mt-0.5">{statusCounts.total} criteria will be evaluated during AI policy analysis.</p>
          </div>
        </div>
      </div>

      {/* Criteria by Category */}
      <div className="space-y-3">
        {Object.entries(groupedCriteria).map(([category, criteria]) => {
          const isExpanded = expandedCategories.has('all') || expandedCategories.has(category)
          const categoryTotal = criteria.length

          const isOrLogic = category === 'step_therapy'

          return (
            <div key={category} className="border border-grey-200 rounded-xl overflow-hidden">
              {/* Category Header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-4 py-3 bg-grey-50 hover:bg-grey-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-grey-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-grey-500" />
                  )}
                  <span className="text-sm font-semibold text-grey-900">
                    {categoryLabels[category] || category.replace(/_/g, ' ')}
                  </span>
                  {categoryTotal > 1 && (
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      isOrLogic ? "bg-blue-100 text-blue-700" : "bg-grey-200 text-grey-600"
                    )}>
                      {isOrLogic ? 'ANY ONE' : 'ALL REQUIRED'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-grey-500">
                    {categoryTotal} criteria
                  </span>
                </div>
              </button>

              {/* Category Criteria — all pending */}
              {isExpanded && (
                <div className="divide-y divide-grey-100">
                  {criteria.map((criterion, idx) => (
                    <div key={idx} className="px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5">
                        <Circle className="w-4 h-4 text-grey-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-grey-600">{criterion.name}</p>
                        <p className="text-xs text-grey-500 mt-0.5">{criterion.description}</p>
                        {criterion.policy_text && criterion.policy_text !== criterion.description && (
                          <p className="text-xs text-grey-400 mt-1 italic">"{criterion.policy_text}"</p>
                        )}
                        {criterion.clinical_codes?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {criterion.clinical_codes.slice(0, 3).map((code: any, codeIdx: number) => (
                              <span key={codeIdx} className="px-1.5 py-0.5 bg-grey-100 text-grey-600 text-xs font-mono rounded">
                                {code.system}: {code.code}
                              </span>
                            ))}
                            {criterion.clinical_codes.length > 3 && (
                              <span className="text-xs text-grey-400">+{criterion.clinical_codes.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-grey-100 text-grey-500 flex-shrink-0">
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Policy Reference */}
      <div className="mt-6 pt-4 border-t border-grey-200">
        <p className="text-xs text-grey-400">
          Source: {policy.payer_name} Policy {policy.policy_number} - {policy.policy_title}
        </p>
        {policy.effective_date && (
          <p className="text-xs text-grey-400">Effective: {policy.effective_date}</p>
        )}
      </div>
    </div>
  )
}

function EmptySection({ title }: { title: string }) {
  return (
    <div>
      <SectionHeader title={title} />
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-grey-300 mx-auto mb-3" />
        <p className="text-sm text-grey-500">No {title.toLowerCase()} data available</p>
      </div>
    </div>
  )
}
