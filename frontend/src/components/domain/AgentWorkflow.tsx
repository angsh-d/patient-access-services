/**
 * AgentWorkflow - Human-in-the-Loop workflow component
 *
 * This component manages the step-by-step agentic workflow with
 * human approval gates at each stage. It showcases:
 * - Agent reasoning and analysis
 * - Strategy recommendations with justification
 * - Counterfactual analysis ("what if" scenarios)
 * - Manual approval before proceeding
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  FileSearch,
  Lightbulb,
  Play,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Eye,
  ThumbsUp,
  RotateCcw,
  UserCheck,
  XCircle,
  ArrowUpRight,
} from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, GlassPanel } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CaseState, CaseStage } from '@/types/case'
import type { Strategy } from '@/types/strategy'
import type { ConfirmDecisionRequest } from '@/types/api'
import { PolicyCriteriaAnalysis } from '@/components/domain/PolicyCriteriaAnalysis'
import {
  CounterfactualPanel,
  type StrategyOption,
} from '@/components/domain/CounterfactualPanel'
import {
  ChainOfThought,
  type ThoughtStep,
} from '@/components/domain/ChainOfThought'

interface AgentWorkflowProps {
  caseState: CaseState
  onRunStage: (stage: CaseStage) => Promise<void>
  onApproveStage: (stage: CaseStage) => void
  onSelectStrategy: (strategyId: string) => Promise<void>
  onConfirmDecision?: (data: ConfirmDecisionRequest) => Promise<void>
  isProcessing: boolean
  currentAnalysis?: StageAnalysis | null
  strategies?: Strategy[]
  recommendedStrategyId?: string
}

interface StageAnalysis {
  stage: string
  reasoning: string
  findings: Finding[]
  confidence: number
  recommendations: string[]
  warnings?: string[]
}

interface Finding {
  title: string
  detail: string
  status: 'positive' | 'negative' | 'neutral' | 'warning'
}

// Stage configuration for the workflow
// Note: 'intake' is handled automatically during case creation
// The HITL workflow starts from policy_analysis
const WORKFLOW_STAGES: {
  stage: CaseStage
  title: string
  description: string
  agentAction: string
  icon: React.ReactNode
  requiresHumanApproval: boolean
  isAutoAdvance?: boolean // Some stages auto-advance after human selection
}[] = [
  {
    stage: 'intake',
    title: 'Case Intake',
    description: 'Patient and medication data loaded',
    agentAction: 'Case intake completed during creation',
    icon: <FileSearch className="w-5 h-5" />,
    requiresHumanApproval: false, // Auto-completed on case creation
  },
  {
    stage: 'policy_analysis',
    title: 'Policy Analysis',
    description: 'Analyze payer policies and assess coverage likelihood',
    agentAction: 'Reasoning through policy requirements and clinical evidence...',
    icon: <Brain className="w-5 h-5" />,
    requiresHumanApproval: true,
  },
  {
    stage: 'awaiting_human_decision',
    title: 'Human Decision Gate',
    description: 'Review AI recommendation and make coverage decision',
    agentAction: 'Awaiting human decision on AI coverage assessment...',
    icon: <UserCheck className="w-5 h-5" />,
    requiresHumanApproval: true,
  },
  {
    stage: 'strategy_generation',
    title: 'Strategy Generation',
    description: 'Generate and evaluate access strategies with trade-offs',
    agentAction: 'Generating strategies and calculating optimal approach...',
    icon: <Lightbulb className="w-5 h-5" />,
    requiresHumanApproval: true,
  },
  {
    stage: 'strategy_selection',
    title: 'Strategy Selection',
    description: 'Review and select the optimal strategy',
    agentAction: 'Awaiting human strategy selection...',
    icon: <CheckCircle2 className="w-5 h-5" />,
    requiresHumanApproval: true,
    isAutoAdvance: true, // Advances when strategy is selected
  },
  {
    stage: 'action_coordination',
    title: 'Action Execution',
    description: 'Execute the selected strategy actions',
    agentAction: 'Coordinating actions with payer systems...',
    icon: <Play className="w-5 h-5" />,
    requiresHumanApproval: true,
  },
  {
    stage: 'monitoring',
    title: 'Monitoring',
    description: 'Monitor payer responses and track progress',
    agentAction: 'Monitoring submission status...',
    icon: <Eye className="w-5 h-5" />,
    requiresHumanApproval: false, // Auto-completes based on payer responses
  },
]


/**
 * Transform strategies to CounterfactualPanel format
 */
function transformToStrategyOptions(
  strategies: Strategy[],
  recommendedId?: string,
  selectedId?: string | null
): { current: StrategyOption; alternatives: StrategyOption[] } {
  const strategyOptions: StrategyOption[] = strategies.map((s) => ({
    id: s.id,
    name: s.name,
    score: (s.score as any)?.weighted_score || s.score?.total_score || 5,
    approvalProbability: s.score?.approval_probability || 0.5,
    daysToTherapy: s.estimated_days || 5,
    reworkRisk: s.score?.rework_risk || 0.3,
    isRecommended: s.id === recommendedId,
    isCurrent: s.id === selectedId,
    tradeoffs: s.estimated_days < 5
      ? ['Faster but may face initial pushback', 'Requires more documentation upfront']
      : s.estimated_days > 7
        ? ['More thorough but takes longer', 'Higher approval certainty']
        : undefined,
    bestWhen: s.estimated_days < 5
      ? 'Speed is critical and documentation is strong'
      : s.estimated_days > 7
        ? 'Approval certainty is more important than speed'
        : 'Balanced approach is needed',
  }))

  const currentStrategy = strategyOptions.find((s) => s.id === recommendedId) || strategyOptions[0]
  const alternatives = strategyOptions.filter((s) => s.id !== currentStrategy.id)

  return { current: currentStrategy, alternatives }
}

export function AgentWorkflow({
  caseState,
  onRunStage,
  onApproveStage,
  onSelectStrategy,
  onConfirmDecision,
  isProcessing,
  currentAnalysis,
  strategies: strategiesProp,
  recommendedStrategyId,
}: AgentWorkflowProps) {
  const [showCounterfactual, setShowCounterfactual] = useState(false)
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')

  // Use strategies from prop, or fall back to caseState.available_strategies
  const strategies = strategiesProp ?? caseState.available_strategies ?? []

  const currentStageIndex = WORKFLOW_STAGES.findIndex(s => s.stage === caseState.stage)
  const isCompleted = caseState.stage === 'completed'
  const isFailed = caseState.stage === 'failed'
  const isMonitoring = caseState.stage === 'monitoring'

  // Determine what action is available
  const getNextAction = (): { type: 'run' | 'approve' | 'select_strategy' | 'advance_intake' | 'complete_monitoring' | 'human_decision'; stage: CaseStage } | null => {
    if (isCompleted || isFailed) return null

    const stage = WORKFLOW_STAGES.find(s => s.stage === caseState.stage)
    if (!stage) return null

    // Intake stage - just needs approval to advance (data already loaded)
    if (caseState.stage === 'intake') {
      return { type: 'advance_intake', stage: caseState.stage }
    }

    // Human decision gate - requires explicit human decision (Anthropic skill pattern)
    if (caseState.stage === 'awaiting_human_decision') {
      return { type: 'human_decision', stage: caseState.stage }
    }

    // Monitoring stage - show complete button
    if (isMonitoring) {
      return { type: 'complete_monitoring', stage: caseState.stage }
    }

    // If we have analysis results pending approval
    if (currentAnalysis && currentAnalysis.stage === caseState.stage) {
      return { type: 'approve', stage: caseState.stage }
    }

    // If we're at strategy selection and have strategies to pick from
    if (caseState.stage === 'strategy_selection' && strategies && strategies.length > 0) {
      return { type: 'select_strategy', stage: caseState.stage }
    }

    // Default: run the current stage
    return { type: 'run', stage: caseState.stage }
  }

  const nextAction = getNextAction()

  return (
    <div className="space-y-6">
      {/* Workflow Header */}
      <GlassPanel variant="default" padding="lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-grey-900 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-grey-900">Agentic Workflow</h2>
              <p className="text-sm text-grey-500">Human-in-the-loop approval required at each step</p>
            </div>
          </div>
          {isProcessing && (
            <Badge variant="warning" className="animate-pulse">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Agent Processing
            </Badge>
          )}
        </div>

        {/* Progress indicator - Greyscale */}
        <div className="flex items-center gap-2">
          {WORKFLOW_STAGES.map((stage, index) => {
            const isPast = index < currentStageIndex
            const isCurrent = index === currentStageIndex
            const isFuture = index > currentStageIndex

            return (
              <div key={stage.stage} className="flex-1 flex items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                    isPast && 'bg-grey-900 text-white',
                    isCurrent && 'bg-grey-700 text-white ring-2 ring-grey-400 ring-offset-2',
                    isFuture && 'bg-grey-200 text-grey-400'
                  )}
                >
                  {isPast ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                </div>
                {index < WORKFLOW_STAGES.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2 transition-colors',
                      isPast ? 'bg-grey-900' : 'bg-grey-200'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </GlassPanel>

      {/* Current Stage Display */}
      {nextAction && (
        <Card variant="elevated" padding="lg">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-grey-100 flex items-center justify-center text-grey-600">
                {WORKFLOW_STAGES[currentStageIndex]?.icon}
              </div>
              <div>
                <CardTitle>{WORKFLOW_STAGES[currentStageIndex]?.title}</CardTitle>
                <p className="text-sm text-grey-500 mt-0.5">
                  {WORKFLOW_STAGES[currentStageIndex]?.description}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="mt-6">
            {/* Intake Summary - Show loaded patient/medication data */}
            {caseState.stage === 'intake' && (
              <IntakeSummaryPanel caseState={caseState} />
            )}

            {/* Agent Reasoning Display */}
            {currentAnalysis && currentAnalysis.stage === caseState.stage && (
              <AgentReasoningPanel analysis={currentAnalysis} />
            )}

            {/* Policy Match Viewer - Show during/after policy analysis */}
            {(caseState.stage === 'policy_analysis' || caseState.stage === 'awaiting_human_decision') &&
              caseState.coverage_assessments &&
              Object.keys(caseState.coverage_assessments).length > 0 && (
              <PolicyMatchSection caseState={caseState} />
            )}

            {/* Strategy Selection UI */}
            {caseState.stage === 'strategy_selection' && strategies && strategies.length > 0 && (
              <StrategySelectionPanel
                strategies={strategies}
                recommendedId={recommendedStrategyId}
                selectedId={selectedStrategyId || caseState.selected_strategy_id}
                onSelect={setSelectedStrategyId}
                showCounterfactual={showCounterfactual}
              />
            )}

            {/* Monitoring Status Display */}
            {isMonitoring && (
              <MonitoringStatusPanel caseState={caseState} />
            )}

            {/* Human Decision Gate UI (Anthropic skill pattern) */}
            {caseState.stage === 'awaiting_human_decision' && (
              <HumanDecisionGatePanel
                caseState={caseState}
                reason={decisionReason}
                onReasonChange={setDecisionReason}
              />
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-6 pt-6 border-t border-grey-200">
              {nextAction.type === 'advance_intake' && (
                <Button
                  variant="primary"
                  onClick={() => onApproveStage(nextAction.stage)}
                  disabled={isProcessing}
                  className="min-w-[200px]"
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  Review Complete - Begin Analysis
                </Button>
              )}

              {nextAction.type === 'run' && (
                <Button
                  variant="primary"
                  onClick={() => onRunStage(nextAction.stage)}
                  disabled={isProcessing}
                  className="min-w-[200px]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Agent Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run {WORKFLOW_STAGES[currentStageIndex]?.title}
                    </>
                  )}
                </Button>
              )}

              {nextAction.type === 'approve' && (
                <>
                  <Button
                    variant="primary"
                    onClick={() => onApproveStage(nextAction.stage)}
                    disabled={isProcessing}
                    className="min-w-[200px]"
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    Approve & Continue
                  </Button>
                  <Button variant="secondary" disabled={isProcessing}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Request Revision
                  </Button>
                </>
              )}

              {nextAction.type === 'select_strategy' && (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const strategyToSelect = selectedStrategyId || recommendedStrategyId
                      if (strategyToSelect) {
                        onSelectStrategy(strategyToSelect)
                      }
                    }}
                    disabled={isProcessing || (!selectedStrategyId && !recommendedStrategyId)}
                    className="min-w-[200px]"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {selectedStrategyId && selectedStrategyId !== recommendedStrategyId
                      ? 'Override & Select'
                      : 'Approve Recommendation'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowCounterfactual(!showCounterfactual)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {showCounterfactual ? 'Hide' : 'View'} Alternative Outcomes
                  </Button>
                </>
              )}

              {nextAction.type === 'complete_monitoring' && (
                <Button
                  variant="primary"
                  onClick={() => onApproveStage(nextAction.stage)}
                  disabled={isProcessing}
                  className="min-w-[200px]"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark as Complete
                </Button>
              )}

              {/* Human Decision Gate Actions - Greyscale (Anthropic skill pattern) */}
              {nextAction.type === 'human_decision' && onConfirmDecision && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    onClick={() => onConfirmDecision({
                      action: 'approve',
                      reviewer_id: 'current_user', // TODO: Get from auth context
                      notes: decisionReason || undefined,
                    })}
                    disabled={isProcessing}
                    className="min-w-[160px]"
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onConfirmDecision({
                      action: 'override',
                      reviewer_id: 'current_user',
                      reason: decisionReason || 'Manual override by reviewer',
                      notes: decisionReason || undefined,
                    })}
                    disabled={isProcessing || !decisionReason}
                    title={!decisionReason ? 'Provide a reason for override' : undefined}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Override
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onConfirmDecision({
                      action: 'reject',
                      reviewer_id: 'current_user',
                      reason: decisionReason || 'Rejected by reviewer',
                      notes: decisionReason || undefined,
                    })}
                    disabled={isProcessing || !decisionReason}
                    className="text-grey-700 hover:bg-grey-100"
                    title={!decisionReason ? 'Provide a reason for rejection' : undefined}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onConfirmDecision({
                      action: 'escalate',
                      reviewer_id: 'current_user',
                      reason: decisionReason || 'Escalated for additional review',
                      notes: decisionReason || undefined,
                    })}
                    disabled={isProcessing}
                    className="text-grey-600 hover:bg-grey-100"
                  >
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                    Escalate
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed State - Greyscale */}
      {isCompleted && (
        <Card variant="default" padding="lg" className="border-grey-300 bg-grey-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-grey-900 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-grey-900">Workflow Complete</h3>
              <p className="text-sm text-grey-600">
                All stages approved and executed. View the Decision Trace for full audit trail.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/**
 * Transform analysis to chain-of-thought steps
 */
function analysisToThoughtSteps(analysis: StageAnalysis): ThoughtStep[] {
  const steps: ThoughtStep[] = []
  let stepNum = 1

  // Step 1: Initial assessment
  steps.push({
    id: `step-${stepNum}`,
    stepNumber: stepNum++,
    title: 'Analyzing case context',
    reasoning: analysis.reasoning,
    conclusion: 'Initial context established from case data.',
    confidence: analysis.confidence,
    source: { type: 'patient_record', name: 'Case Data', reference: 'Patient & medication info' },
    status: 'complete',
  })

  // Step 2-N: Findings as steps
  analysis.findings.forEach((finding) => {
    const sourceType = finding.title.toLowerCase().includes('policy')
      ? 'policy'
      : finding.title.toLowerCase().includes('diagnosis')
        ? 'patient_record'
        : finding.title.toLowerCase().includes('treatment')
          ? 'clinical'
          : 'inference'

    steps.push({
      id: `step-${stepNum}`,
      stepNumber: stepNum++,
      title: finding.title,
      reasoning: finding.detail,
      conclusion: finding.status === 'positive'
        ? 'Criterion satisfied'
        : finding.status === 'warning'
          ? 'Requires attention'
          : 'Gap identified',
      confidence: finding.status === 'positive' ? 0.9 : finding.status === 'warning' ? 0.6 : 0.3,
      source: { type: sourceType, name: 'Evidence Review', reference: 'Analysis results' },
      status: finding.status === 'positive' ? 'complete' : finding.status === 'warning' ? 'warning' : 'info',
    })
  })

  // Final step: Recommendations synthesis
  if (analysis.recommendations.length > 0) {
    steps.push({
      id: `step-${stepNum}`,
      stepNumber: stepNum++,
      title: 'Generating recommendations',
      reasoning: analysis.recommendations.join(' '),
      conclusion: `${analysis.recommendations.length} actionable recommendations identified.`,
      confidence: analysis.confidence,
      source: { type: 'inference', name: 'AI Reasoning', reference: 'Strategy synthesis' },
      status: 'complete',
    })
  }

  return steps
}

/**
 * Agent Reasoning Panel - Greyscale design
 * Shows the agent's analysis with chain-of-thought
 */
function AgentReasoningPanel({ analysis }: { analysis: StageAnalysis }) {
  const thoughtSteps = analysisToThoughtSteps(analysis)

  return (
    <div className="space-y-4">
      {/* Chain of Thought Display */}
      <ChainOfThought
        agentType={analysis.stage}
        agentLabel={`${analysis.stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`}
        steps={thoughtSteps}
        summary={analysis.reasoning}
        totalConfidence={analysis.confidence}
      />

      {/* Warnings - Greyscale */}
      {analysis.warnings && analysis.warnings.length > 0 && (
        <div className="p-3 bg-grey-100 rounded-lg border border-grey-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-grey-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-grey-900">Attention Required</p>
              <ul className="mt-1 space-y-1">
                {analysis.warnings.map((warning, index) => (
                  <li key={index} className="text-xs text-grey-700">{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Strategy Selection Panel - Greyscale design
 * Shows strategies with comparison and counterfactual analysis
 */
function StrategySelectionPanel({
  strategies,
  recommendedId,
  selectedId,
  onSelect,
  showCounterfactual,
}: {
  strategies: Strategy[]
  recommendedId?: string
  selectedId?: string | null
  onSelect: (id: string) => void
  showCounterfactual: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Agent's Strategy Reasoning */}
      <div className="p-4 bg-grey-50 rounded-xl border border-grey-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-grey-900 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-grey-700 leading-relaxed">
              Generated {strategies.length} strategies with different trade-offs between speed,
              approval likelihood, and risk. The recommended strategy optimizes for highest approval
              confidence while maintaining acceptable speed to therapy.
            </p>
          </div>
        </div>
      </div>

      {/* Strategy Cards - Greyscale */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {strategies.map((strategy) => {
          const isRecommended = strategy.id === recommendedId
          const isSelected = strategy.id === selectedId

          return (
            <motion.div
              key={strategy.id}
              className={cn(
                'relative p-4 rounded-xl border-2 cursor-pointer transition-all',
                isSelected
                  ? 'border-grey-900 bg-grey-100'
                  : isRecommended
                    ? 'border-grey-700 bg-grey-50'
                    : 'border-grey-200 bg-white hover:border-grey-300'
              )}
              onClick={() => onSelect(strategy.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isRecommended && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-grey-900 text-white rounded">
                  Recommended
                </span>
              )}

              <h4 className="text-sm font-semibold text-grey-900 mb-2">{strategy.name}</h4>
              <p className="text-xs text-grey-600 mb-4">{strategy.description}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-grey-500">Approval Confidence</span>
                  <span className="font-medium text-grey-900">
                    {Math.round((strategy.score?.approval_probability || 0) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-grey-500">Days to Therapy</span>
                  <span className="font-medium text-grey-900">{strategy.estimated_days} days</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-grey-500">Rework Risk</span>
                  <span className="font-medium text-grey-900">
                    {(strategy.score?.rework_risk || 0) < 0.3 ? 'Low' : (strategy.score?.rework_risk || 0) < 0.6 ? 'Medium' : 'High'}
                  </span>
                </div>
              </div>

              {isSelected && (
                <div className="absolute top-2 left-2">
                  <CheckCircle2 className="w-5 h-5 text-grey-900" />
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Counterfactual Analysis with CounterfactualPanel */}
      <AnimatePresence>
        {showCounterfactual && strategies.length > 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-4"
          >
            {(() => {
              const { current, alternatives } = transformToStrategyOptions(strategies, recommendedId, selectedId)
              return (
                <CounterfactualPanel
                  currentStrategy={current}
                  alternatives={alternatives}
                  onSelectStrategy={onSelect}
                  isExpanded={true}
                />
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Intake Summary Panel - Shows loaded patient and medication data for review
 */
function IntakeSummaryPanel({ caseState }: { caseState: CaseState }) {
  const { patient, medication } = caseState

  return (
    <div className="space-y-4">
      <div className="p-4 bg-grey-50 rounded-xl border border-grey-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-grey-900 flex items-center justify-center flex-shrink-0">
            <FileSearch className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-grey-900">Case Data Loaded</span>
              <Badge variant="success" size="sm">Ready for Review</Badge>
            </div>
            <p className="text-sm text-grey-700 leading-relaxed">
              I've loaded the patient information and medication request. Please review the data below
              before proceeding to policy analysis.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Patient Info */}
        <div className="p-4 bg-white rounded-lg border border-grey-200">
          <h4 className="text-sm font-semibold text-grey-900 mb-3">Patient Information</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-grey-500">Name</span>
              <span className="font-medium text-grey-900">{patient.first_name} {patient.last_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">DOB</span>
              <span className="font-medium text-grey-900">{patient.date_of_birth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">Primary Payer</span>
              <span className="font-medium text-grey-900">{patient.primary_payer}</span>
            </div>
            {patient.secondary_payer && (
              <div className="flex justify-between">
                <span className="text-grey-500">Secondary Payer</span>
                <span className="font-medium text-grey-900">{patient.secondary_payer}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-grey-500">Diagnosis Codes</span>
              <span className="font-medium text-grey-900">{patient.diagnosis_codes?.join(', ') || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Medication Info */}
        <div className="p-4 bg-white rounded-lg border border-grey-200">
          <h4 className="text-sm font-semibold text-grey-900 mb-3">Medication Request</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-grey-500">Medication</span>
              <span className="font-medium text-grey-900">{medication.medication_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">Dose</span>
              <span className="font-medium text-grey-900">{medication.dose}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">Frequency</span>
              <span className="font-medium text-grey-900">{medication.frequency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">Diagnosis</span>
              <span className="font-medium text-grey-900">{medication.diagnosis}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">Prescriber</span>
              <span className="font-medium text-grey-900">{medication.prescriber_name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Clinical Rationale */}
      <div className="p-4 bg-white rounded-lg border border-grey-200">
        <h4 className="text-sm font-semibold text-grey-900 mb-2">Clinical Rationale</h4>
        <p className="text-sm text-grey-700">{medication.clinical_rationale}</p>
      </div>
    </div>
  )
}

/**
 * Policy Match Section - Uses the new PolicyCriteriaAnalysis component
 * Shows decomposed policy criteria and patient evidence mapping
 */
function PolicyMatchSection({ caseState }: { caseState: CaseState }) {
  const primaryPayer = caseState.patient.primary_payer
  const medicationName = caseState.medication.medication_name

  return (
    <div className="mt-6">
      <PolicyCriteriaAnalysis
        caseState={caseState}
        payerName={primaryPayer}
        medicationName={medicationName}
      />
    </div>
  )
}

/**
 * Monitoring Status Panel - Greyscale design
 * Shows current payer submission statuses
 */
function MonitoringStatusPanel({ caseState }: { caseState: CaseState }) {
  const payerEntries = Object.entries(caseState.payer_states || {})

  return (
    <div className="space-y-4">
      <div className="p-4 bg-grey-50 rounded-xl border border-grey-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-grey-900 flex items-center justify-center flex-shrink-0">
            <Eye className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-grey-900">Monitoring Submissions</span>
              <span className="px-2 py-0.5 text-xs font-medium bg-grey-200 text-grey-700 rounded">
                In Progress
              </span>
            </div>
            <p className="text-sm text-grey-700 leading-relaxed">
              Submissions have been sent to payers. Monitoring responses and tracking approval status.
            </p>
          </div>
        </div>
      </div>

      {/* Payer Status Cards - Greyscale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {payerEntries.map(([payerName, payerState]) => {
          const status = payerState.status || 'unknown'
          const isApproved = status === 'approved'

          return (
            <div
              key={payerName}
              className={cn(
                'p-4 rounded-lg border',
                isApproved ? 'bg-grey-100 border-grey-300' : 'bg-grey-50 border-grey-200'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-grey-900">{payerName}</span>
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded',
                  isApproved ? 'bg-grey-900 text-white' : 'bg-grey-200 text-grey-700'
                )}>
                  {status.replace(/_/g, ' ')}
                </span>
              </div>
              {payerState.reference_number && (
                <p className="text-xs text-grey-500">Ref: {payerState.reference_number}</p>
              )}
              {payerState.submitted_at && (
                <p className="text-xs text-grey-500">Submitted: {payerState.submitted_at}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Human Decision Gate Panel - Greyscale-first design
 * Displays AI recommendation and decision input
 * Following Anthropic's prior-auth-review-skill pattern:
 * - AI recommends APPROVE or PEND only (never auto-DENY)
 * - Human must explicitly confirm, reject, or override
 */
function HumanDecisionGatePanel({
  caseState,
  reason,
  onReasonChange,
}: {
  caseState: CaseState
  reason: string
  onReasonChange: (reason: string) => void
}) {
  // Extract AI recommendation from coverage assessments
  const primaryPayer = caseState.patient.primary_payer
  const primaryAssessment = caseState.coverage_assessments?.[primaryPayer]
  const aiRecommendation = primaryAssessment?.coverage_status || 'requires_human_review'
  const confidence = primaryAssessment?.approval_likelihood || 0
  const decisionReason = caseState.human_decision_reason || 'AI assessment requires human review'

  return (
    <div className="space-y-4">
      {/* AI Recommendation Display - Greyscale */}
      <div className="p-4 bg-grey-50 rounded-xl border border-grey-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-grey-900 flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-grey-900">Human Decision Required</span>
              <span className="px-2 py-0.5 text-xs font-medium bg-grey-200 text-grey-700 rounded">
                {aiRecommendation.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-grey-500">
                {Math.round(confidence * 100)}% confidence
              </span>
            </div>
            <p className="text-sm text-grey-700 leading-relaxed">
              {decisionReason}
            </p>
            <p className="text-xs text-grey-500 mt-2">
              AI recommends only APPROVE or PEND. Human review is required for all coverage decisions.
            </p>
          </div>
        </div>
      </div>

      {/* Coverage Assessment Summary - Greyscale */}
      {caseState.coverage_assessments && Object.keys(caseState.coverage_assessments).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-grey-500 uppercase tracking-wider">Coverage Assessments</h4>
          <div className="grid gap-2">
            {Object.entries(caseState.coverage_assessments).map(([payerName, assessment]) => {
              const status = assessment.coverage_status
              const isPositive = status === 'covered' || status === 'likely_covered'

              return (
                <div
                  key={payerName}
                  className={cn(
                    'p-3 rounded-lg border',
                    isPositive ? 'bg-grey-100 border-grey-300' : 'bg-grey-50 border-grey-200'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-grey-900">{payerName}</span>
                    <span className={cn(
                      'px-2 py-0.5 text-xs font-medium rounded',
                      isPositive ? 'bg-grey-900 text-white' : 'bg-grey-200 text-grey-700'
                    )}>
                      {status?.replace(/_/g, ' ') || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-grey-600">
                    <span>Likelihood: {Math.round((assessment.approval_likelihood || 0) * 100)}%</span>
                    <span>Criteria: {assessment.criteria_met_count || 0}/{assessment.criteria_total_count || 0} met</span>
                  </div>
                  {assessment.approval_likelihood_reasoning && (
                    <p className="text-xs text-grey-600 mt-2">{assessment.approval_likelihood_reasoning}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Documentation Gaps - Greyscale */}
      {caseState.documentation_gaps && caseState.documentation_gaps.length > 0 && (
        <div className="p-3 bg-grey-100 rounded-lg border border-grey-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-grey-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-grey-900">Documentation Gaps ({caseState.documentation_gaps.length})</p>
              <ul className="mt-1 space-y-1">
                {caseState.documentation_gaps.slice(0, 3).map((gap, index) => (
                  <li key={index} className="text-xs text-grey-700">
                    <span className="font-medium">{gap.gap_type}:</span> {gap.description}
                  </li>
                ))}
                {caseState.documentation_gaps.length > 3 && (
                  <li className="text-xs text-grey-500">
                    +{caseState.documentation_gaps.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Decision Reason Input */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-grey-500 uppercase tracking-wider">
          Decision Notes
        </label>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Enter notes or reason for your decision..."
          className="w-full p-3 text-sm border border-grey-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-grey-900/20 resize-none bg-white"
          rows={3}
        />
        <p className="text-xs text-grey-400">Required for reject or override actions</p>
      </div>
    </div>
  )
}

export default AgentWorkflow
