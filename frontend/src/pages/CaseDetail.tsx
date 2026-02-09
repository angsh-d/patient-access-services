/**
 * CaseDetail - Step-by-Step Wizard for PA Case Processing
 *
 * REDESIGNED following persona-driven UX principles:
 * - Single wizard flow (no duplicate timelines or tabs)
 * - 5 clear steps: Review -> Analysis -> Decision -> Strategy -> Submit
 * - AI reasoning visible by default (not hidden)
 * - Patient/medication info in collapsible accordion
 * - Clear primary CTA at each step
 *
 * Mental model: "I process cases step-by-step with AI assistance"
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  FileText,
  Play,
  RefreshCw,
  Brain,
  ChevronRight,
  ThumbsUp,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Eye,
  XCircle,
  ArrowUpRight,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import {
  Button,
  GlassPanel,
  SkeletonCard,
} from '@/components/ui'
import {
  WizardStepper,
  PA_WIZARD_STEPS,
  stageToWizardStep,
} from '@/components/domain/WizardStepper'
import { WizardStep, WizardStepSkeleton } from '@/components/domain/WizardStep'
import {
  AIAnalysisCard,
  type CriterionResult,
} from '@/components/domain/AIAnalysisCard'
import {
  PayerComparisonCard,
  createPayerSummary,
} from '@/components/domain/PayerComparisonCard'
import { PayerStatusBadge } from '@/components/domain/PayerStatusBadge'
import { StrategicIntelligence } from '@/components/domain/StrategicIntelligence'
import { DecisionTrace } from '@/components/domain/DecisionTrace'
import { ExtractedDataReview } from '@/components/domain/ExtractedDataReview'
import { PolicyValidationCard } from '@/components/domain/PolicyValidationCard'
import {
  useCase,
  useProcessCase,
  useCaseTrace,
  useSelectStrategy,
  useRunStage,
  useApproveStage,
  useConfirmDecision,
  type StageAnalysis,
} from '@/hooks/useCase'
import {
  usePatientData,
  usePatientDocuments,
  useUpdatePatientField,
} from '@/hooks/usePatientData'
import { useWebSocket } from '@/hooks/useWebSocket'
import { formatDate, getInitials, cn } from '@/lib/utils'
import type { Strategy, BackendStrategy } from '@/types/strategy'
import { transformBackendStrategy } from '@/types/strategy'
import type { CaseState, CaseStage, PayerState, HumanDecision } from '@/types/case'

// Helper to get patient full name
function getPatientName(patient: CaseState['patient']): string {
  return `${patient.first_name} ${patient.last_name}`
}

// Helper to get primary payer state
function getPrimaryPayer(caseState: CaseState): PayerState | null {
  const primaryPayerName = caseState.patient.primary_payer
  return caseState.payer_states[primaryPayerName] || null
}

// Transform coverage assessment to AI criteria results
function transformToCriteriaResults(caseState: CaseState): CriterionResult[] {
  const primaryPayerName = caseState.patient.primary_payer
  return transformToCriteriaResultsForPayer(caseState, primaryPayerName)
}

// Transform coverage assessment to AI criteria results for a specific payer
function transformToCriteriaResultsForPayer(caseState: CaseState, payerName: string): CriterionResult[] {
  const assessment = caseState.coverage_assessments?.[payerName]
  const results: CriterionResult[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const criteriaDetails = (assessment as any)?.criteria_details ?? (assessment as any)?.criteria_assessments
  if (criteriaDetails && Array.isArray(criteriaDetails)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    criteriaDetails.forEach((detail: any, idx: number) => {
      results.push({
        id: `crit-${payerName}-${idx}`,
        name: detail.criterion_name || `Criterion ${idx + 1}`,
        status: detail.is_met === true || detail.met === true ? 'met' : detail.is_met === false || detail.met === false ? 'not_met' : detail.partial ? 'partial' : 'unknown',
        detail: detail.reasoning || detail.description,
        source: detail.source || detail.supporting_evidence?.join('; '),
        actionNeeded: detail.action_needed || (detail.gaps?.length ? detail.gaps.join('; ') : undefined),
      })
    })
  }

  // Add documentation gaps relevant to this payer
  if (caseState.documentation_gaps && caseState.documentation_gaps.length > 0) {
    caseState.documentation_gaps.forEach((gap, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gapType = (gap as any).gap_type || gap.description?.split(':')[0] || `Gap ${idx + 1}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requiredBy = (gap as any).required_by as string[] | undefined
      // Only include gaps relevant to this payer (or all gaps if no specific payer requirement)
      const isRelevant = !requiredBy || requiredBy.length === 0 || requiredBy.includes(payerName)
      if (isRelevant && !results.some(r => r.name.toLowerCase().includes(gapType.toLowerCase()))) {
        results.push({
          id: `gap-${payerName}-${idx}`,
          name: gapType,
          status: 'not_met',
          detail: gap.description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          actionNeeded: (gap as any).recommended_action || 'Provide missing documentation',
        })
      }
    })
  }

  return results
}

export function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [currentAnalysis, setCurrentAnalysis] = useState<StageAnalysis | null>(null)
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [showAuditTrail, setShowAuditTrail] = useState(false)
  const [viewingStep, setViewingStep] = useState<number | null>(null)

  // Data fetching
  const { data: caseData, isLoading: caseLoading, refetch: refetchCase } = useCase(caseId)
  const caseState = caseData?.case

  // Use strategies from caseState.available_strategies
  // available_strategies comes from API as BackendStrategy[] shape but is typed as Strategy[] in CaseState
  const strategies: Strategy[] = ((caseState?.available_strategies ?? []) as unknown as BackendStrategy[]).map(transformBackendStrategy)

  const recommendedStrategyId = strategies.find(s => s.is_recommended)?.id
    ?? (caseState?.stage === 'strategy_selection' ? caseState?.selected_strategy_id : undefined)
    ?? strategies[0]?.id

  const { data: traceData, isLoading: traceLoading } = useCaseTrace(
    showAuditTrail ? caseId : undefined
  )

  // Mutations
  const processCase = useProcessCase(caseId || '')
  const selectStrategy = useSelectStrategy(caseId || '')
  const runStage = useRunStage(caseId || '')
  const approveStage = useApproveStage(caseId || '')
  const confirmDecision = useConfirmDecision(caseId || '')

  // Real-time updates
  useWebSocket(caseId, {
    onStageChange: () => {
      setCurrentAnalysis(null)
      refetchCase()
    },
  })

  // Calculate current wizard step
  const currentWizardStep = caseState ? stageToWizardStep(caseState.stage) : 0
  const isCompleted = caseState?.stage === 'completed'
  const isFailed = caseState?.stage === 'failed'
  const isProcessing = runStage.isPending || approveStage.isPending || selectStrategy.isPending || confirmDecision.isPending

  // Handlers
  const handleRunStage = async (stage: CaseStage, refresh: boolean = false) => {
    try {
      const analysis = await runStage.mutateAsync(refresh ? { stage, refresh } : stage)
      setCurrentAnalysis(analysis as StageAnalysis)
      // Refresh case data to get the persisted state - MUST await to ensure UI updates
      await refetchCase()
    } catch (error) {
      console.error('Failed to run stage:', error)
      // Re-throw so the mutation error state is preserved
      throw error
    }
  }

  const handleApproveStage = async (stage: CaseStage) => {
    try {
      await approveStage.mutateAsync(stage)
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      console.error('Failed to approve stage:', error)
    }
  }

  // Combined handler: approve intake and auto-run policy analysis (LLM)
  const handleApproveIntakeAndRunAnalysis = async () => {
    try {
      // First approve the intake stage
      await approveStage.mutateAsync('intake')
      setCurrentAnalysis(null)
      // Refresh to get updated stage
      await refetchCase()
      // Then automatically run policy analysis (LLM call)
      const analysis = await runStage.mutateAsync('policy_analysis')
      setCurrentAnalysis(analysis as StageAnalysis)
      await refetchCase()
    } catch (error) {
      console.error('Failed to approve intake and run analysis:', error)
    }
  }

  // Combined handler: approve policy_analysis and auto-run strategy generation
  const handleApproveAnalysisAndGenerateStrategy = async () => {
    try {
      // First approve the policy_analysis stage
      await approveStage.mutateAsync('policy_analysis')
      setCurrentAnalysis(null)
      // Refresh to get updated stage
      await refetchCase()
      // Then automatically run strategy generation
      await runStage.mutateAsync('strategy_generation')
      await refetchCase()
    } catch (error) {
      console.error('Failed to approve analysis and generate strategy:', error)
    }
  }

  const handleSelectStrategy = async (strategyId: string) => {
    try {
      await selectStrategy.mutateAsync({ strategy_id: strategyId })
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      console.error('Failed to select strategy:', error)
    }
  }

  const handleConfirmDecision = async (action: 'approve' | 'reject' | 'override' | 'escalate') => {
    try {
      await confirmDecision.mutateAsync({
        action,
        reviewer_id: 'current_user',
        reason: action !== 'approve' ? decisionReason : undefined,
        notes: decisionReason || undefined,
      })
      setDecisionReason('')
      await refetchCase()
    } catch (error) {
      console.error('Failed to confirm decision:', error)
    }
  }

  // Loading state
  if (caseLoading) {
    return (
      <div className="min-h-screen bg-grey-50">
        <Header title="Loading..." showBack backTo="/cases" />
        <div className="p-8 max-w-5xl mx-auto">
          <SkeletonCard />
        </div>
      </div>
    )
  }

  // Not found state
  if (!caseState) {
    return (
      <div className="min-h-screen bg-grey-50">
        <Header title="Case Not Found" showBack backTo="/cases" />
        <div className="p-8 text-center">
          <p className="text-grey-500">The requested case could not be found.</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => navigate('/cases')}
          >
            Back to Cases
          </Button>
        </div>
      </div>
    )
  }

  const patientName = getPatientName(caseState.patient)
  const primaryPayer = getPrimaryPayer(caseState)
  const criteriaResults = transformToCriteriaResults(caseState)
  const primaryAssessment = caseState.coverage_assessments?.[caseState.patient.primary_payer]

  return (
    <div className="min-h-screen bg-grey-50">
      {/* Simplified Header */}
      <div className="bg-white border-b border-grey-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 -ml-2 hover:bg-grey-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-grey-500" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-grey-200 flex items-center justify-center">
                  <span className="text-sm font-semibold text-grey-600">
                    {getInitials(patientName)}
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-grey-900">{patientName}</h1>
                  <p className="text-sm text-grey-500">
                    {caseState.medication.medication_name} | {caseState.patient.primary_payer}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {primaryPayer && (
                <PayerStatusBadge status={primaryPayer.status} />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAuditTrail(!showAuditTrail)}
              >
                <Eye className="w-4 h-4 mr-1" />
                Audit Trail
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(
        "mx-auto py-8",
        // Use full width for Review step (0), constrained for others
        (currentWizardStep === 0 && !isCompleted && !isFailed) || (isCompleted && viewingStep === 0)
          ? "max-w-[1600px] px-4"
          : "max-w-5xl px-6"
      )}>
        {/* Wizard Stepper */}
        <GlassPanel variant="default" padding="lg" className="mb-8">
          <WizardStepper
            steps={PA_WIZARD_STEPS}
            currentStep={viewingStep !== null ? viewingStep : (isCompleted ? PA_WIZARD_STEPS.length - 1 : currentWizardStep)}
            completedSteps={isCompleted ? Array.from({ length: PA_WIZARD_STEPS.length }, (_, i) => i) : Array.from({ length: currentWizardStep }, (_, i) => i)}
            isProcessing={isProcessing}
            onStepClick={isCompleted ? (step) => setViewingStep(step === viewingStep ? null : step) : undefined}
          />
          {isCompleted && viewingStep !== null && (
            <div className="mt-3 flex items-center justify-center">
              <button
                onClick={() => setViewingStep(null)}
                className="text-xs text-grey-500 hover:text-grey-700 underline"
              >
                Back to Summary
              </button>
            </div>
          )}
        </GlassPanel>

        {/* Step Content */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Review (active or viewing completed) */}
            {((currentWizardStep === 0 && !isCompleted && !isFailed) || (isCompleted && viewingStep === 0)) && (
              <ReviewStep
                key="review"
                caseState={caseState}
                onContinue={handleApproveIntakeAndRunAnalysis}
                isProcessing={isProcessing}
                readOnly={isCompleted}
              />
            )}

            {/* Step 2: AI Analysis (active or viewing completed) */}
            {((currentWizardStep === 1 && !isCompleted && !isFailed) || (isCompleted && viewingStep === 1)) && (
              <AnalysisStep
                key="analysis"
                caseState={caseState}
                assessment={primaryAssessment}
                currentAnalysis={currentAnalysis}
                onRunAnalysis={() => handleRunStage('policy_analysis')}
                onReAnalyze={() => handleRunStage('policy_analysis', true)}
                onApprove={handleApproveAnalysisAndGenerateStrategy}
                isProcessing={isProcessing}
                readOnly={isCompleted}
                onRefresh={refetchCase}
              />
            )}

            {/* Step 3: Decision (active or viewing completed) */}
            {((currentWizardStep === 2 && !isCompleted && !isFailed) || (isCompleted && viewingStep === 2)) && (
              <DecisionStep
                key="decision"
                caseState={caseState}
                criteriaResults={criteriaResults}
                assessment={primaryAssessment}
                decisionReason={decisionReason}
                onReasonChange={setDecisionReason}
                onConfirmDecision={handleConfirmDecision}
                isProcessing={isProcessing}
                readOnly={isCompleted}
              />
            )}

            {/* Step 4: Strategy (active or viewing completed) */}
            {((currentWizardStep === 3 && !isCompleted && !isFailed) || (isCompleted && viewingStep === 3)) && (
              <StrategyStep
                key="strategy"
                caseState={caseState}
                strategies={strategies}
                recommendedId={recommendedStrategyId}
                selectedId={selectedStrategyId || caseState.selected_strategy_id}
                onSelect={setSelectedStrategyId}
                onConfirm={() => {
                  const strategyToSelect = selectedStrategyId || recommendedStrategyId
                  if (strategyToSelect) {
                    handleSelectStrategy(strategyToSelect)
                  }
                }}
                onRunGeneration={() => handleRunStage('strategy_generation')}
                isProcessing={isProcessing}
                hasError={selectStrategy.isError}
                onRetry={() => selectStrategy.reset()}
                readOnly={isCompleted}
              />
            )}

            {/* Step 5: Submit/Monitor (active or viewing completed) */}
            {((currentWizardStep === 4 && !isCompleted && !isFailed) || (isCompleted && viewingStep === 4)) && (
              <SubmitStep
                key="submit"
                caseState={caseState}
                onRunCoordination={() => handleRunStage('action_coordination')}
                onComplete={() => handleApproveStage('monitoring')}
                isProcessing={isProcessing}
                hasError={runStage.isError}
                onRetry={() => {
                  runStage.reset()
                }}
              />
            )}

            {/* Completed State (default summary) */}
            {isCompleted && viewingStep === null && (
              <CompletedStep
                key="completed"
                caseState={caseState}
                strategies={strategies}
                onViewStep={(step) => setViewingStep(step)}
              />
            )}

            {/* Failed State */}
            {isFailed && (
              <FailedStep
                key="failed"
                caseState={caseState}
                onRetry={() => processCase.mutate({})}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Audit Trail Modal/Slide-out */}
        <AnimatePresence>
          {showAuditTrail && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex justify-end"
              onClick={() => setShowAuditTrail(false)}
            >
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="w-full max-w-lg bg-white h-full overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-grey-200 px-6 py-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-grey-900">Audit Trail</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAuditTrail(false)}
                  >
                    <XCircle className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-6">
                  {traceLoading ? (
                    <WizardStepSkeleton />
                  ) : traceData?.events && traceData.events.length > 0 ? (
                    <DecisionTrace events={traceData.events} />
                  ) : (
                    <p className="text-grey-500 text-center py-8">No audit events yet.</p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Step 1: Review - EHR-style patient data review
 *
 * Modern EHR layout with:
 * - Left sidebar navigation for sections
 * - Main content area with section details
 * - Integrated slide-out PDF viewer
 */
function ReviewStep({
  caseState,
  onContinue,
  isProcessing,
  readOnly = false,
}: {
  caseState: CaseState
  onContinue: () => void
  isProcessing: boolean
  readOnly?: boolean
}) {
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

  // Show loading skeleton while patient data loads (only if actually loading)
  if (patientLoading) {
    return (
      <WizardStep
        title="Verify Extracted Data"
        description="Loading patient data..."
        icon={<FileText className="w-6 h-6" />}
      >
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </WizardStep>
    )
  }

  // If no data and not loading/error, show a helpful message
  if (!patientData) {
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
        label: 'Begin AI Analysis',
        onClick: onContinue,
        disabled: isProcessing,
        icon: <ChevronRight className="w-4 h-4" />,
      }}
    >
      <ExtractedDataReview
        patientData={patientData}
        documents={documentsData?.documents || []}
        onViewDocument={() => {}} // PDF viewing handled internally by component
        onEditField={readOnly ? undefined : handleEditField}
      />
    </WizardStep>
  )
}

/**
 * Step 2: AI Analysis - AI analyzes policy criteria
 */
function AnalysisStep({
  caseState,
  assessment: _assessment,
  currentAnalysis,
  onRunAnalysis,
  onReAnalyze,
  onApprove,
  isProcessing,
  readOnly = false,
  onRefresh,
}: {
  caseState: CaseState
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  currentAnalysis: StageAnalysis | null
  onRunAnalysis: () => void
  onReAnalyze?: () => void
  onApprove: () => void
  isProcessing: boolean
  readOnly?: boolean
  onRefresh?: () => void
}) {
  // Force-refresh case data on mount to ensure we have the latest from backend
  const refreshed = useRef(false)
  useEffect(() => {
    if (!refreshed.current && onRefresh) {
      refreshed.current = true
      onRefresh()
    }
  }, [onRefresh])

  // Auto-trigger LLM analysis when step mounts if no analysis results exist
  const hasAnalysisResults = !!(caseState.coverage_assessments && Object.keys(caseState.coverage_assessments).length > 0)
  const analysisTriggered = useRef(false)
  const onRunAnalysisRef = useRef(onRunAnalysis)
  useEffect(() => { onRunAnalysisRef.current = onRunAnalysis }, [onRunAnalysis])

  useEffect(() => {
    if (!readOnly && !hasAnalysisResults && !isProcessing && !analysisTriggered.current) {
      analysisTriggered.current = true
      onRunAnalysisRef.current()
    }
  }, [readOnly, hasAnalysisResults, isProcessing])
  // Check for secondary payer
  const primaryPayerName = caseState.patient.primary_payer
  const secondaryPayerName = caseState.patient.secondary_payer
  const primaryAssessment = caseState.coverage_assessments?.[primaryPayerName]
  const secondaryAssessment = secondaryPayerName
    ? caseState.coverage_assessments?.[secondaryPayerName]
    : null
  const hasSecondaryPayer = !!secondaryPayerName && !!secondaryAssessment

  // State for toggling between payers in detailed view
  const [selectedPayer, setSelectedPayer] = useState<'primary' | 'secondary'>('primary')

  // Get the currently selected payer's data
  const selectedPayerName = selectedPayer === 'primary' ? primaryPayerName : secondaryPayerName

  // Create payer summaries for comparison
  const primarySummary = createPayerSummary(primaryPayerName, true, primaryAssessment ?? null)
  const secondarySummary = secondaryPayerName
    ? createPayerSummary(secondaryPayerName, false, secondaryAssessment ?? null)
    : null

  return (
    <WizardStep
      title="AI Policy Analysis"
      description={readOnly ? "AI analysis results from policy review" : "AI analyzes payer policies and assesses coverage criteria"}
      icon={<Brain className="w-6 h-6" />}
      primaryAction={readOnly ? undefined : {
        label: 'Continue to Decision',
        onClick: onApprove,
        disabled: isProcessing,
        icon: <ChevronRight className="w-4 h-4" />,
      }}
      referenceInfo={{
        title: 'Patient & Medication Details',
        content: <ReferenceInfoContent caseState={caseState} />,
      }}
    >
      {/* Payer Toggle (if secondary payer exists) */}
      {hasSecondaryPayer && (
        <div className="flex items-center gap-2 p-1 bg-grey-100 rounded-lg w-fit mb-6">
          <button
            type="button"
            onClick={() => setSelectedPayer('primary')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all',
              selectedPayer === 'primary'
                ? 'bg-white text-grey-900 shadow-sm'
                : 'text-grey-600 hover:text-grey-900'
            )}
          >
            {primaryPayerName}
            <span className="ml-2 text-xs text-grey-500">Primary</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedPayer('secondary')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all',
              selectedPayer === 'secondary'
                ? 'bg-white text-grey-900 shadow-sm'
                : 'text-grey-600 hover:text-grey-900'
            )}
          >
            {secondaryPayerName}
            <span className="ml-2 text-xs text-grey-500">Secondary</span>
          </button>
        </div>
      )}

      {/* LLM Analysis Status */}
      {isProcessing && !hasAnalysisResults && (
        <div className="mb-6 p-4 rounded-xl bg-semantic-info/[0.08] border border-semantic-info/20">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-semantic-info animate-spin" />
            <div>
              <h4 className="text-sm font-semibold text-grey-900">AI Analysis in Progress</h4>
              <p className="text-xs text-grey-600 mt-0.5">Claude is analyzing payer policies and identifying documentation gaps...</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis Summary (from LLM) */}
      {currentAnalysis && (
        <div className="mb-6 p-4 rounded-xl bg-semantic-success/[0.08] border border-semantic-success/20">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-semantic-success flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-grey-900 mb-1">AI Analysis Complete</h4>
              <p className="text-sm text-grey-700">{currentAnalysis.reasoning}</p>
              {currentAnalysis.recommendations && currentAnalysis.recommendations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {currentAnalysis.recommendations.map((rec: string, idx: number) => (
                    <li key={idx} className="text-xs text-grey-600 flex items-start gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      {rec}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Re-analyze button (if analysis was already done) */}
      {!readOnly && hasAnalysisResults && !isProcessing && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onReAnalyze ?? onRunAnalysis}
            className="text-xs text-grey-500 hover:text-grey-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-analyze policies
          </button>
        </div>
      )}

      {/* Policy Validation Card - Always show detailed criteria */}
      <PolicyValidationCard
        patientId={caseState.metadata?.source_patient_id as string}
        payerName={selectedPayerName || primaryPayerName}
        medicationName={caseState.medication.medication_name}
        coverageAssessment={caseState.coverage_assessments?.[selectedPayerName || primaryPayerName]}
      />

      {/* Documentation Gaps from AI Analysis */}
      {caseState.documentation_gaps && caseState.documentation_gaps.length > 0 && (
        <div className="mt-6 p-4 rounded-xl bg-semantic-warning/[0.08] border border-semantic-warning/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-semantic-warning flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-grey-900 mb-2">Documentation Gaps Identified</h4>
              <ul className="space-y-2">
                {caseState.documentation_gaps.map((gap, idx) => (
                  <li key={idx} className="text-sm text-grey-700 flex items-start gap-2">
                    <span className={cn(
                      'mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded',
                      (gap as any).priority === 'high' ? 'bg-semantic-error/10 text-semantic-error' : 'bg-semantic-warning/10 text-semantic-warning'
                    )}>
                      {(gap as any).priority || 'medium'}
                    </span>
                    <span>{gap.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Payer Comparison Summary (if secondary payer exists) */}
      {hasSecondaryPayer && secondarySummary && (
        <div className="mt-6">
          <PayerComparisonCard
            primaryPayer={primarySummary}
            secondaryPayer={secondarySummary}
            onViewDetails={(payerName) => {
              setSelectedPayer(payerName === primaryPayerName ? 'primary' : 'secondary')
            }}
          />
        </div>
      )}
    </WizardStep>
  )
}

/**
 * Step 3: Decision - Human confirms AI assessment
 */
function DecisionStep({
  caseState,
  criteriaResults,
  assessment,
  decisionReason,
  onReasonChange,
  onConfirmDecision,
  isProcessing,
  readOnly = false,
}: {
  caseState: CaseState
  criteriaResults: CriterionResult[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  decisionReason: string
  onReasonChange: (reason: string) => void
  onConfirmDecision: (action: 'approve' | 'reject' | 'override' | 'escalate') => void
  isProcessing: boolean
  readOnly?: boolean
}) {
  const aiRecommendation = assessment?.coverage_status || 'requires_human_review'
  const confidence = assessment?.approval_likelihood || 0

  return (
    <WizardStep
      title="Human Decision Required"
      description="Review AI recommendation and make your decision"
      icon={<ThumbsUp className="w-6 h-6" />}
      referenceInfo={{
        title: 'AI Analysis Summary',
        content: (
          <AIAnalysisCard
            summary={
              assessment?.approval_likelihood_reasoning ||
              `${criteriaResults.filter(c => c.status === 'met').length} of ${criteriaResults.length} criteria met for ${caseState.patient.primary_payer}.`
            }
            criteria={criteriaResults}
            recommendation={{
              action: confidence > 0.7 ? 'approve' : confidence > 0.4 ? 'pend' : 'review',
              label: confidence > 0.7 ? 'Approve' : confidence > 0.4 ? 'Pend' : 'Review',
              confidence,
            }}
          />
        ),
        defaultExpanded: true,
      }}
    >
      <div className="space-y-6">
        {/* AI Recommendation Summary */}
        <div className="p-5 rounded-xl bg-grey-50 border border-grey-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-grey-900 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">AI Recommendation</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 text-xs font-medium bg-grey-200 text-grey-800 rounded">
                  {aiRecommendation.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-grey-500">
                  {Math.round(confidence * 100)}% confidence
                </span>
              </div>
            </div>
          </div>
          <p className="text-sm text-grey-600 italic">
            Following the conservative decision model: AI never auto-denies.
            Human review is required for all coverage decisions.
          </p>
        </div>

        {/* Documentation Gaps Notice */}
        {caseState.documentation_gaps && caseState.documentation_gaps.length > 0 && (
          <div className="p-4 rounded-lg bg-grey-100 border border-grey-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-grey-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-grey-900">Documentation Gaps</h4>
                <ul className="mt-2 space-y-1">
                  {caseState.documentation_gaps.slice(0, 3).map((gap, idx) => (
                    <li key={idx} className="text-sm text-grey-700">
                      <span className="font-medium">{gap.gap_type}:</span> {gap.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Decision made summary (read-only view) */}
        {readOnly && caseState.human_decisions && caseState.human_decisions.length > 0 ? (
          <div className="p-4 rounded-lg bg-grey-50 border border-grey-200">
            <h4 className="text-sm font-semibold text-grey-900 mb-2">Decision Recorded</h4>
            {caseState.human_decisions.map((decision: HumanDecision, idx: number) => (
              <div key={idx} className="text-sm text-grey-600 space-y-1">
                <p><span className="font-medium">Action:</span> {(decision.action || 'approve').replace(/_/g, ' ')}</p>
                {decision.reviewer_id && <p><span className="font-medium">Reviewer:</span> {decision.reviewer_id}</p>}
                {decision.timestamp && <p><span className="font-medium">Time:</span> {formatDate(decision.timestamp)}</p>}
                {decision.notes && <p><span className="font-medium">Notes:</span> {decision.notes}</p>}
              </div>
            ))}
          </div>
        ) : readOnly ? (
          <div className="p-4 rounded-lg bg-grey-50 border border-grey-200">
            <p className="text-sm text-grey-500">Decision was approved during workflow processing.</p>
          </div>
        ) : (
          <>
            {/* Decision Notes */}
            <div>
              <label className="block text-sm font-medium text-grey-700 mb-2">
                Decision Notes (required for reject/override)
              </label>
              <textarea
                value={decisionReason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Enter your decision rationale..."
                className="w-full p-3 text-sm border border-grey-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-grey-900/20 resize-none"
                rows={3}
              />
            </div>

            {/* Decision Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-grey-200">
              <Button
                variant="primary"
                onClick={() => onConfirmDecision('approve')}
                disabled={isProcessing}
                className="min-w-[140px]"
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => onConfirmDecision('override')}
                disabled={isProcessing || !decisionReason}
                title={!decisionReason ? 'Provide a reason for override' : undefined}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Override
              </Button>
              <Button
                variant="ghost"
                onClick={() => onConfirmDecision('reject')}
                disabled={isProcessing || !decisionReason}
                className="text-grey-600 hover:bg-grey-100"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                variant="ghost"
                onClick={() => onConfirmDecision('escalate')}
                disabled={isProcessing}
                className="text-grey-600 hover:bg-grey-100"
              >
                <ArrowUpRight className="w-4 h-4 mr-2" />
                Escalate
              </Button>
            </div>
          </>
        )}
      </div>
    </WizardStep>
  )
}

/**
 * Step 4: Strategy - Select submission strategy
 * Has timeout handling to prevent infinite spinner on slow API responses
 */
function StrategyStep({
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
}: {
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
}) {
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
          <StrategicIntelligence caseId={caseState.case_id} caseData={{ case: caseState }} />
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

/**
 * Step 5: Submit - Execute and monitor
 * Auto-submits when user reaches this step (no manual button click needed)
 */
function SubmitStep({
  caseState,
  onRunCoordination,
  onComplete,
  isProcessing,
  hasError,
  onRetry,
}: {
  caseState: CaseState
  onRunCoordination: () => Promise<void>
  onComplete: () => void
  isProcessing: boolean
  hasError?: boolean
  onRetry?: () => void
}) {
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
  // Previously auto-submitted when reaching this step.

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

/**
 * Completed State - Comprehensive summary with clickable step sections
 */
function CompletedStep({
  caseState,
  strategies = [],
  onViewStep,
}: {
  caseState: CaseState
  strategies?: Strategy[]
  onViewStep?: (step: number) => void
}) {
  const payerEntries = Object.entries(caseState.payer_states || {})
  const primaryAssessment = caseState.coverage_assessments?.[caseState.patient.primary_payer]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedStrategy = (caseState.available_strategies as any[])?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => s.strategy_id === caseState.selected_strategy_id
  )

  return (
    <WizardStep
      title="Case Complete"
      description="All steps have been completed successfully. Click any section to view details."
      icon={<CheckCircle2 className="w-6 h-6 text-grey-900" />}
    >
      {/* Success Banner */}
      <div className="p-6 rounded-xl bg-grey-900 text-white mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Workflow Complete</h3>
            <p className="text-sm text-grey-300">
              PA request processed successfully. Click the step indicators above or the sections below to review details.
            </p>
          </div>
        </div>

        {/* Final Payer Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {payerEntries.map(([payerName, payerState]) => (
            <div
              key={payerName}
              className="flex items-center justify-between p-3 bg-white/10 rounded-lg"
            >
              <span className="text-sm font-medium text-white">{payerName}</span>
              <PayerStatusBadge status={payerState.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Step Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Patient Review Summary */}
        <button
          onClick={() => onViewStep?.(0)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <FileText className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Patient Review</h4>
              <p className="text-xs text-grey-500">Step 1</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            <p>{caseState.patient.first_name} {caseState.patient.last_name} &middot; DOB {formatDate(caseState.patient.date_of_birth)}</p>
            <p>{caseState.medication.medication_name} &middot; {caseState.medication.dose}</p>
            <p className="text-xs text-grey-400">DX: {caseState.patient.diagnosis_codes.join(', ')}</p>
          </div>
        </button>

        {/* AI Analysis Summary */}
        <button
          onClick={() => onViewStep?.(1)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <Brain className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">AI Analysis</h4>
              <p className="text-xs text-grey-500">Step 2</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            {primaryAssessment ? (
              <>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p>Coverage: <span className="font-medium">{((primaryAssessment as any).coverage_status || 'assessed').replace(/_/g, ' ')}</span></p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p>Approval likelihood: <span className="font-medium">{Math.round(((primaryAssessment as any).approval_likelihood || 0) * 100)}%</span></p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p className="text-xs text-grey-400">{(primaryAssessment as any).criteria_met_count || 0} of {(primaryAssessment as any).criteria_total_count || 0} criteria met</p>
              </>
            ) : (
              <p>Policy analysis completed</p>
            )}
          </div>
        </button>

        {/* Decision Summary */}
        <button
          onClick={() => onViewStep?.(2)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <ThumbsUp className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Decision</h4>
              <p className="text-xs text-grey-500">Step 3</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            {caseState.human_decisions && caseState.human_decisions.length > 0 ? (
              <>
                <p>Action: <span className="font-medium capitalize">{caseState.human_decisions[0].action || 'approved'}</span></p>
                {caseState.human_decisions[0].reviewer_id && (
                  <p className="text-xs text-grey-400">By: {caseState.human_decisions[0].reviewer_id}</p>
                )}
              </>
            ) : (
              <p>Human decision recorded</p>
            )}
          </div>
        </button>

        {/* Strategy Summary */}
        <button
          onClick={() => onViewStep?.(3)}
          className="p-4 rounded-xl border border-grey-200 bg-white hover:bg-grey-50 hover:border-grey-300 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-grey-100 flex items-center justify-center group-hover:bg-grey-200 transition-colors">
              <Lightbulb className="w-4 h-4 text-grey-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-grey-900">Strategy</h4>
              <p className="text-xs text-grey-500">Step 4</p>
            </div>
            <ChevronRight className="w-4 h-4 text-grey-400 ml-auto group-hover:text-grey-600" />
          </div>
          <div className="text-sm text-grey-600 space-y-1">
            {selectedStrategy ? (
              <>
                <p className="font-medium">{selectedStrategy.name}</p>
                <p className="text-xs text-grey-400 line-clamp-2">{selectedStrategy.description}</p>
              </>
            ) : strategies.length > 0 ? (
              <p className="font-medium">{strategies[0].name}</p>
            ) : (
              <p>Strategy selected and executed</p>
            )}
          </div>
        </button>
      </div>

      {/* Submission Details */}
      {payerEntries.some(([, state]) => state.reference_number) && (
        <div className="mt-4 p-4 rounded-xl border border-grey-200 bg-grey-50">
          <h4 className="text-sm font-semibold text-grey-900 mb-3">Submission Details</h4>
          <div className="space-y-2">
            {payerEntries.map(([payerName, payerState]) => (
              <div key={payerName} className="flex items-center justify-between text-sm">
                <span className="text-grey-600">{payerName}</span>
                <div className="flex items-center gap-3">
                  {payerState.reference_number && (
                    <span className="text-xs text-grey-400 font-mono">Ref: {payerState.reference_number}</span>
                  )}
                  {payerState.submitted_at && (
                    <span className="text-xs text-grey-400">Submitted: {formatDate(payerState.submitted_at)}</span>
                  )}
                  <PayerStatusBadge status={payerState.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WizardStep>
  )
}

/**
 * Failed State
 */
function FailedStep({
  caseState,
  onRetry,
}: {
  caseState: CaseState
  onRetry: () => void
}) {
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

/**
 * Reference Info Content - Collapsible patient/medication details
 */
function ReferenceInfoContent({ caseState }: { caseState: CaseState }) {
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

export default CaseDetail
