/**
 * CaseDetail - Step-by-Step Wizard for PA Case Processing
 *
 * 5-step wizard: Review -> Policy Analysis -> Cohort Analysis -> AI Recommendation -> Decision
 *
 * Post-decision: strategy generation + action coordination run automatically.
 *
 * Step content is extracted into focused components under
 * @/components/domain/wizard/ while this file retains ownership of:
 * - Wizard navigation / step orchestration
 * - Top-level mutations (useRunStage, useApproveStage, etc.)
 * - SSE streaming lifecycle
 * - The audit trail slide-out
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Eye,
  XCircle,
  AlertTriangle,
  Sparkles,
  X,
  RotateCcw,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import {
  Button,
  GlassPanel,
  SkeletonCard,
} from '@/components/ui'
import {
  WizardStepper,
  stageToWizardStep,
  getWizardSteps,
} from '@/components/domain/WizardStepper'
import { AppealPanel } from '@/components/domain/AppealPanel'
import { WizardStepSkeleton } from '@/components/domain/WizardStep'
import { PayerStatusBadge } from '@/components/domain/PayerStatusBadge'
import { DecisionTrace } from '@/components/domain/DecisionTrace'
import { PolicyAssistantPanel } from '@/components/domain/PolicyAssistantPanel'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import {
  ReviewStep,
  AnalysisStep,
  CohortStep,
  AIRecommendationStep,
  DecisionStep,
  SubmitStep,
  CompletedStep,
  FailedStep,
  getPatientName,
  getPrimaryPayer,
  transformToCriteriaResults,
} from '@/components/domain/wizard'
import {
  useCase,
  useProcessCase,
  useCaseTrace,
  useRunStage,
  useApproveStage,
  useConfirmDecision,
  useResetCase,
  type StageAnalysis,
} from '@/hooks/useCase'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useSSEStream } from '@/hooks/useSSEStream'
import { getInitials, cn } from '@/lib/utils'
import type { Strategy, BackendStrategy } from '@/types/strategy'
import { transformBackendStrategy } from '@/types/strategy'
import type { CaseStage, HumanDecisionAction } from '@/types/case'

export function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [currentAnalysis, setCurrentAnalysis] = useState<StageAnalysis | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiRecommendation, setAiRecommendation] = useState<Record<string, any> | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [showAuditTrail, setShowAuditTrail] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [viewingStep, setViewingStep] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [postDecisionRunning, setPostDecisionRunning] = useState(false)
  const [artificialProcessing, setArtificialProcessing] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Per-step analysis cache — survives step navigation, avoids re-triggering API calls
  const analysisCache = useRef<Record<number, StageAnalysis>>({})
  // Track SSE start time for minimum processing animation
  const sseStartTimeRef = useRef<number>(0)

  // Data fetching
  const { data: caseData, isLoading: caseLoading, refetch: refetchCase } = useCase(caseId)
  const caseState = caseData?.case

  // Use strategies from caseState.available_strategies
  // available_strategies comes from API as BackendStrategy[] shape but is typed as Strategy[] in CaseState
  const strategies: Strategy[] = ((caseState?.available_strategies ?? []) as unknown as BackendStrategy[]).map(transformBackendStrategy)

  const { data: traceData, isLoading: traceLoading } = useCaseTrace(
    showAuditTrail ? caseId : undefined
  )

  // Mutations
  const processCase = useProcessCase(caseId || '')
  const runStage = useRunStage(caseId || '')
  const approveStage = useApproveStage(caseId || '')
  const confirmDecision = useConfirmDecision(caseId || '')
  const resetCase = useResetCase(caseId || '')

  // SSE streaming for progressive analysis output
  const sseStream = useSSEStream()

  // Real-time updates
  useWebSocket(caseId, {
    onStageChange: () => {
      setCurrentAnalysis(null)
      setViewingStep(null)
      refetchCase()
    },
  })

  // Calculate current wizard step
  const currentWizardStep = caseState ? stageToWizardStep(caseState.stage) : 0
  const isCompleted = caseState?.stage === 'completed'
  const isFailed = caseState?.stage === 'failed'
  const isProcessing = runStage.isPending || approveStage.isPending || confirmDecision.isPending || sseStream.status === 'streaming' || sseStream.status === 'connecting' || postDecisionRunning || artificialProcessing

  // Backward navigation: compute which step to display
  const isRecovery = caseState?.stage === 'recovery'
  const displayStep = isCompleted
    ? (viewingStep ?? 0)  // Default to Review tab for completed cases
    : isRecovery
      ? (viewingStep ?? 6)  // Default to Appeal step for recovery cases
      : (viewingStep ?? currentWizardStep)
  const isStepReadOnly = isCompleted || (viewingStep !== null && viewingStep < currentWizardStep)

  // Restore analysis from cache when navigating between steps
  useEffect(() => {
    if (displayStep !== null && displayStep !== undefined) {
      const cached = analysisCache.current[displayStep]
      if (cached) {
        setCurrentAnalysis(cached)
      } else if (viewingStep !== null) {
        setCurrentAnalysis(null)
      }
    }
  }, [displayStep, viewingStep])

  // When SSE stream completes, update currentAnalysis and refetch case data
  const sseHandledRef = useRef(false)
  useEffect(() => {
    if (sseStream.status === 'done' && sseStream.result && !sseHandledRef.current) {
      sseHandledRef.current = true
      const result = sseStream.result
      const analysis: StageAnalysis = {
        stage: (result.stage as string) || 'policy_analysis',
        reasoning: (result.reasoning as string) || '',
        confidence: (result.confidence as number) || 0,
        findings: (result.findings as StageAnalysis['findings']) || [],
        recommendations: (result.recommendations as string[]) || [],
        warnings: (result.warnings as string[]) || [],
        assessments: result.assessments as Record<string, unknown>,
      }
      // Minimum animation time for policy analysis (sum of POLICY_ANALYSIS_STEPS durations)
      const elapsed = Date.now() - (sseStartTimeRef.current || Date.now())
      const remaining = Math.max(0, 4400 - elapsed)
      const applyResult = () => {
        setArtificialProcessing(false)
        analysisCache.current[1] = analysis
        setCurrentAnalysis(analysis)
        refetchCase()
      }
      if (remaining > 0) {
        setTimeout(applyResult, remaining)
      } else {
        applyResult()
      }
    }
  }, [sseStream.status, sseStream.result, refetchCase])

  // Auto-dismiss action error after 8 seconds
  useEffect(() => {
    if (actionError) {
      const timer = setTimeout(() => setActionError(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [actionError])

  // Handlers

  /**
   * Run policy analysis with SSE streaming. Falls back to regular runStage
   * if the SSE connection fails before receiving any events.
   */
  const handleRunAnalysisStreaming = (refresh: boolean = false) => {
    if (!caseId) return
    sseHandledRef.current = false
    sseStartTimeRef.current = Date.now()
    setArtificialProcessing(true)
    sseStream.start(caseId, 'policy_analysis', refresh)
  }

  // Minimum processing animation times per stage (ms)
  const STAGE_MIN_MS: Record<string, number> = {
    cohort_analysis: 4000,
    ai_recommendation: 4200,
    strategy_generation: 2500,
    action_coordination: 2000,
  }

  const handleRunStage = async (stage: CaseStage, refresh: boolean = false) => {
    // For policy_analysis, prefer SSE streaming
    if (stage === 'policy_analysis') {
      handleRunAnalysisStreaming(refresh)
      return
    }

    const startTime = Date.now()
    setArtificialProcessing(true)

    try {
      const analysis = await runStage.mutateAsync(refresh ? { stage, refresh } : stage)

      // Ensure minimum processing time for visual feedback
      const elapsed = Date.now() - startTime
      const minTime = STAGE_MIN_MS[stage] || 2000
      if (elapsed < minTime) {
        await new Promise(resolve => setTimeout(resolve, minTime - elapsed))
      }

      setArtificialProcessing(false)
      const stepIdx = stageToWizardStep(stage)
      analysisCache.current[stepIdx] = analysis as StageAnalysis
      setCurrentAnalysis(analysis as StageAnalysis)
      // Refresh case data to get the persisted state - MUST await to ensure UI updates
      await refetchCase()
    } catch (error) {
      setArtificialProcessing(false)
      const msg = error instanceof Error ? error.message : 'Failed to run stage'
      setActionError(msg)
      console.error('Failed to run stage:', error)
    }
  }

  const handleApproveStage = async (stage: CaseStage) => {
    try {
      await approveStage.mutateAsync(stage)
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to approve stage'
      setActionError(msg)
      console.error('Failed to approve stage:', error)
    }
  }

  // Combined handler: approve intake and advance to policy analysis step
  const handleApproveIntakeAndRunAnalysis = async () => {
    try {
      await approveStage.mutateAsync('intake')
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to approve intake'
      setActionError(msg)
      console.error('Failed to approve intake:', error)
    }
  }

  // Approve policy analysis and advance to cohort analysis step
  const handleApproveAnalysis = async () => {
    try {
      await approveStage.mutateAsync('policy_analysis')
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to approve analysis'
      setActionError(msg)
      console.error('Failed to approve analysis:', error)
    }
  }

  // Approve cohort analysis and advance to AI recommendation step
  const handleApproveCohort = async () => {
    try {
      await approveStage.mutateAsync('cohort_analysis')
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to approve cohort analysis'
      setActionError(msg)
      console.error('Failed to approve cohort:', error)
    }
  }

  // Approve AI recommendation and advance to human decision step
  const handleApproveRecommendation = async () => {
    try {
      // Store the AI recommendation for the decision step before clearing analysis
      if (currentAnalysis) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAiRecommendation((currentAnalysis as any)?.recommendation || null)
      }
      await approveStage.mutateAsync('ai_recommendation')
      setCurrentAnalysis(null)
      await refetchCase()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to approve recommendation'
      setActionError(msg)
      console.error('Failed to approve recommendation:', error)
    }
  }

  const handleConfirmDecision = async (action: HumanDecisionAction) => {
    try {
      await confirmDecision.mutateAsync({
        action,
        reviewer_id: 'current_user',
        reason: action === 'return_to_provider' ? (decisionReason || 'See AI recommendation') : (decisionReason || undefined),
        notes: decisionReason || undefined,
      })
      setDecisionReason('')
      await refetchCase()

      // Post-decision automation: auto-run strategy + action for submit/follow actions
      if (action === 'submit_to_payer' || action === 'follow_recommendation') {
        setPostDecisionRunning(true)
        try {
          await runStage.mutateAsync('strategy_generation')
          await refetchCase()
          await runStage.mutateAsync('action_coordination')
          await refetchCase()
        } catch (postError) {
          const msg = postError instanceof Error ? postError.message : 'Post-decision automation failed'
          setActionError(msg)
          console.error('Post-decision automation error:', postError)
        } finally {
          setPostDecisionRunning(false)
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to confirm decision'
      setActionError(msg)
      console.error('Failed to confirm decision:', error)
    }
  }

  const handleResetCase = async () => {
    try {
      await resetCase.mutateAsync()
      setShowResetConfirm(false)
      setCurrentAnalysis(null)
      setAiRecommendation(null)
      setViewingStep(null)
      setDecisionReason('')
      setActionError(null)
      analysisCache.current = {}
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to reset case'
      setActionError(msg)
      setShowResetConfirm(false)
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

  // Include recovery step when case has denials or is in recovery stage
  const hasDenials = Object.values(caseState.payer_states ?? {}).some(
    (s) => s?.status?.toLowerCase().includes('denied')
  )
  const includeRecovery = caseState.stage === 'recovery' || hasDenials
  const wizardSteps = getWizardSteps(includeRecovery)

  // Step-specific AI Assistant configuration
  const stepAssistantProps = (step: number | null | undefined) => {
    const configs: Record<number, { title: string; subtitle: string; suggestedQuestions: string[]; followUpQuestions: string[]; emptyStateText: string }> = {
      0: {
        title: 'Case Assistant',
        subtitle: 'Ask about patient data',
        suggestedQuestions: [
          `Is ${patientName}'s clinical information complete for submission?`,
          `What are the key clinical factors for ${caseState.medication.medication_name}?`,
          'Are there any red flags in the patient history?',
          `What does ${caseState.patient.primary_payer} typically require?`,
        ],
        followUpQuestions: [
          'Summarize the clinical case',
          'Check for missing information',
          'Explain the diagnosis codes',
        ],
        emptyStateText: 'Ask questions about the patient data, clinical history, or case requirements.',
      },
      1: {
        title: 'Policy Assistant',
        subtitle: 'Ask about policy analysis',
        suggestedQuestions: [
          'What are the biggest risks for denial?',
          'Which documentation gaps should I address first?',
          'What are the step therapy requirements?',
          'What documentation would strengthen this case?',
        ],
        followUpQuestions: [
          'What documentation is missing?',
          'How can I improve approval odds?',
          'Summarize the coverage criteria.',
        ],
        emptyStateText: 'Ask questions about the policy analysis, coverage criteria, or documentation gaps.',
      },
      2: {
        title: 'Cohort Assistant',
        subtitle: 'Ask about cohort patterns',
        suggestedQuestions: [
          'How does this patient compare to approved cases?',
          'What patterns differentiate approvals from denials?',
          'Which gaps have the highest denial rates?',
          'What are the strongest approval predictors?',
        ],
        followUpQuestions: [
          'Explain the denial patterns',
          'What makes approved cases different?',
          'How relevant is the cohort data?',
        ],
        emptyStateText: 'Ask questions about historical cohort patterns and case comparisons.',
      },
      3: {
        title: 'AI Assistant',
        subtitle: 'Ask about the recommendation',
        suggestedQuestions: [
          'Why was this action recommended?',
          'What are the main risks with this approach?',
          'How confident should I be in this recommendation?',
          'What alternative actions could I consider?',
        ],
        followUpQuestions: [
          'Break down the evidence cited',
          'What would change the recommendation?',
          'Explain the confidence score',
        ],
        emptyStateText: 'Ask questions about the AI recommendation, evidence, and risk factors.',
      },
      4: {
        title: 'Decision Assistant',
        subtitle: 'Help with your decision',
        suggestedQuestions: [
          'What factors should I weigh most in my decision?',
          'What are the consequences of returning to provider?',
          'How strong is the evidence supporting submission?',
          'What additional steps could improve the outcome?',
        ],
        followUpQuestions: [
          'Summarize the full case analysis',
          'What are the next steps after submission?',
          'What should I document in my decision?',
        ],
        emptyStateText: 'Ask questions to help inform your decision on this case.',
      },
      5: {
        title: 'Submission Assistant',
        subtitle: 'Ask about the submission',
        suggestedQuestions: [
          'What is the expected timeline for payer response?',
          'What should I do while waiting for the decision?',
          'What are common reasons for delayed responses?',
          'What happens if the submission is rejected?',
        ],
        followUpQuestions: [
          'Summarize what was submitted',
          'What are the next milestones?',
          'How do I track the submission status?',
        ],
        emptyStateText: 'Ask questions about the submission process and expected timelines.',
      },
      6: {
        title: 'Appeal Assistant',
        subtitle: 'Ask about the appeal',
        suggestedQuestions: [
          'What are the strongest grounds for this appeal?',
          'What additional evidence should I gather?',
          'What is the typical appeal success rate?',
          'What are the deadlines I need to be aware of?',
        ],
        followUpQuestions: [
          'Draft an appeal strategy',
          'What precedents support this appeal?',
          'How do I strengthen the case?',
        ],
        emptyStateText: 'Ask questions about appeal strategy, evidence, and deadlines.',
      },
    }
    return configs[step ?? 0] || configs[0]
  }

  return (
    <div className="min-h-screen bg-grey-50">
      {/* Simplified Header */}
      <div className="bg-white border-b border-grey-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
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
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset Case
              </Button>
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
        isFailed ? "max-w-5xl px-6" : "max-w-[1600px] px-4"
      )}>
        {/* Wizard Stepper */}
        <GlassPanel variant="default" padding="lg" className="mb-8">
          <WizardStepper
            steps={wizardSteps}
            currentStep={isCompleted ? wizardSteps.length - 1 : currentWizardStep}
            completedSteps={isCompleted ? Array.from({ length: wizardSteps.length }, (_, i) => i) : Array.from({ length: currentWizardStep }, (_, i) => i)}
            isProcessing={isProcessing}
            onStepClick={(step) => {
              if (isCompleted) {
                setViewingStep(step === viewingStep ? null : step)
              } else if (step <= currentWizardStep) {
                setViewingStep(step === viewingStep ? null : step)
              }
            }}
          />
          {/* For completed cases, users navigate via the stepper */}
          {!isCompleted && !isFailed && viewingStep !== null && viewingStep !== currentWizardStep && (
            <div className="mt-3 flex items-center justify-center">
              <button
                onClick={() => setViewingStep(null)}
                className="text-xs text-grey-600 hover:text-grey-800 underline font-medium"
              >
                Back to Current Step
              </button>
            </div>
          )}
        </GlassPanel>

        {/* Action error banner */}
        <AnimatePresence>
          {actionError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-3 rounded-lg border border-grey-300 bg-grey-50 px-4 py-3 text-sm text-grey-800"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-grey-600" />
              <span className="flex-1">{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-grey-400 hover:text-grey-600">
                <XCircle className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content + AI Assistant */}
        {!isFailed ? (
          <div className="flex gap-6 items-start">
            {/* Step content */}
            <div className="flex-1 min-w-0 space-y-6" aria-live="polite">
              <AnimatePresence mode="wait">
                {/* Step 0: Review */}
                {displayStep === 0 && (
                  <ReviewStep
                    key="review"
                    caseState={caseState}
                    onContinue={handleApproveIntakeAndRunAnalysis}
                    isProcessing={isProcessing}
                    readOnly={isStepReadOnly}
                  />
                )}

                {/* Step 1: Policy Analysis */}
                {displayStep === 1 && (
                  <AnalysisStep
                    key="analysis"
                    caseState={caseState}
                    assessment={primaryAssessment}
                    currentAnalysis={currentAnalysis}
                    onRunAnalysis={() => handleRunStage('policy_analysis')}
                    onReAnalyze={() => handleRunStage('policy_analysis', true)}
                    onApprove={handleApproveAnalysis}
                    isProcessing={isProcessing}
                    readOnly={isStepReadOnly}
                    onRefresh={refetchCase}
                    sseStream={sseStream}
                  />
                )}

                {/* Step 2: Cohort Analysis */}
                {displayStep === 2 && (
                  <CohortStep
                    key="cohort"
                    caseState={caseState}
                    onApprove={handleApproveCohort}
                    isProcessing={isProcessing}
                    readOnly={isStepReadOnly}
                    onRefresh={refetchCase}
                  />
                )}

                {/* Step 3: AI Recommendation */}
                {displayStep === 3 && (
                  <AIRecommendationStep
                    key="recommendation"
                    caseState={caseState}
                    currentAnalysis={currentAnalysis}
                    onRunRecommendation={() => handleRunStage('ai_recommendation')}
                    onApprove={handleApproveRecommendation}
                    isProcessing={isProcessing}
                    readOnly={isStepReadOnly}
                    onRefresh={refetchCase}
                  />
                )}

                {/* Step 4: Human Decision */}
                {displayStep === 4 && (
                  <DecisionStep
                    key="decision"
                    caseState={caseState}
                    criteriaResults={criteriaResults}
                    assessment={primaryAssessment}
                    decisionReason={decisionReason}
                    onReasonChange={setDecisionReason}
                    onConfirmDecision={handleConfirmDecision}
                    isProcessing={isProcessing}
                    readOnly={isStepReadOnly}
                    aiRecommendation={aiRecommendation}
                  />
                )}

                {/* Step 5: Post-decision stages */}
                {displayStep === 5 && (
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

                {/* Step 6: Recovery/Appeal (conditional) */}
                {displayStep === 6 && includeRecovery && (
                  <SectionErrorBoundary fallbackTitle="Appeal panel unavailable">
                    <AppealPanel
                      key="recovery"
                      caseId={caseState.case_id}
                      caseData={caseState as unknown as Record<string, unknown>}
                    />
                  </SectionErrorBoundary>
                )}

                {/* Completed State (default summary) */}
                {isCompleted && displayStep === null && (
                  <CompletedStep
                    key="completed"
                    caseState={caseState}
                    strategies={strategies}
                    onViewStep={(step) => setViewingStep(step)}
                  />
                )}
              </AnimatePresence>
            </div>

          </div>
        ) : (
          <div className="space-y-6" aria-live="polite">
            <FailedStep
              key="failed"
              caseState={caseState}
              onRetry={() => processCase.mutate({})}
            />
          </div>
        )}

        {/* Floating AI Assistant FAB + Panel */}
        <AnimatePresence>
          {showAssistant && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed bottom-20 right-6 z-40 w-[360px] shadow-2xl rounded-2xl overflow-hidden border border-grey-200"
              style={{ height: 'min(520px, calc(100vh - 160px))' }}
            >
              <div className="relative h-full flex flex-col">
                <button
                  type="button"
                  onClick={() => setShowAssistant(false)}
                  className="absolute top-2.5 right-2.5 z-10 p-1 rounded-lg hover:bg-grey-100 transition-colors"
                  aria-label="Close assistant"
                >
                  <X className="w-4 h-4 text-grey-400" />
                </button>
                <SectionErrorBoundary fallbackTitle="Case assistant unavailable">
                  <PolicyAssistantPanel
                    caseId={caseState.case_id}
                    className="h-full"
                    {...stepAssistantProps(displayStep)}
                  />
                </SectionErrorBoundary>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => setShowAssistant(!showAssistant)}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-grey-900 text-white flex items-center justify-center shadow-lg hover:bg-grey-800 transition-colors"
          whileTap={{ scale: 0.92 }}
          aria-label={showAssistant ? 'Close assistant' : 'Open assistant'}
        >
          {showAssistant ? (
            <X className="w-5 h-5" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
        </motion.button>

        {/* Reset confirmation dialog */}
        {showResetConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowResetConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl shadow-xl"
              style={{ padding: '28px', maxWidth: '380px', width: '90%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#181818', letterSpacing: '-0.02em' }}>
                Reset this case?
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#706E6B', marginTop: '8px', lineHeight: 1.5 }}>
                This will clear all analysis, strategies, and decisions, returning the case to the Review stage. Patient and medication data will be preserved.
              </p>
              <div className="flex items-center gap-2 mt-5" style={{ justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#706E6B',
                    background: 'rgba(0, 0, 0, 0.04)',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetCase}
                  disabled={resetCase.isPending}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#ffffff',
                    background: '#181818',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    opacity: resetCase.isPending ? 0.6 : 1,
                  }}
                >
                  {resetCase.isPending ? 'Resetting...' : 'Reset Case'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Audit Trail Modal/Slide-out */}
        <AnimatePresence>
          {showAuditTrail && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex justify-end"
              role="dialog"
              aria-modal="true"
              aria-labelledby="audit-trail-title"
              onClick={() => setShowAuditTrail(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowAuditTrail(false) }}
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
                  <h2 id="audit-trail-title" className="text-lg font-semibold text-grey-900">Audit Trail</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAuditTrail(false)}
                  >
                    <XCircle className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-6">
                  <SectionErrorBoundary fallbackTitle="Audit trail unavailable">
                    {traceLoading ? (
                      <WizardStepSkeleton />
                    ) : traceData?.events && traceData.events.length > 0 ? (
                      <DecisionTrace events={traceData.events} />
                    ) : (
                      <p className="text-grey-500 text-center py-8">No audit events yet.</p>
                    )}
                  </SectionErrorBoundary>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default CaseDetail
