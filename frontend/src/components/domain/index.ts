// Domain components barrel export
export { CaseCard } from './CaseCard'
export { CoverageAssessment } from './CoverageAssessment'
export { DecisionTrace } from './DecisionTrace'
export { DocumentationGaps } from './DocumentationGaps'
export { PayerStatusBadge } from './PayerStatusBadge'
export { StageIndicator } from './StageIndicator'
export { StrategyComparison } from './StrategyComparison'

// New reasoning & provenance components
export { ChainOfThought, ChainOfThoughtCompact, ProvenanceIndicator } from './ChainOfThought'
export type { ThoughtStep, ChainOfThoughtProps } from './ChainOfThought'
export { ScoringRationale, ScoringRationaleInline, createScoreFactors } from './ScoringRationale'
export type { ScoreFactor, ScoringRationaleProps } from './ScoringRationale'

// UX Redesign: Wizard & Workspace components
export { WizardStepper, PA_WIZARD_STEPS, stageToWizardStep, wizardStepToStage } from './WizardStepper'
export type { WizardStep } from './WizardStepper'
export { default as WizardStepContent, WizardStepSkeleton } from './WizardStep'
export { AIAnalysisCard, AIAnalysisCardCompact } from './AIAnalysisCard'
export type { CriterionResult, AIAnalysisCardProps } from './AIAnalysisCard'
export { CaseQueueCard, CaseQueueList } from './CaseQueueCard'
export type { CaseQueueItem } from './CaseQueueCard'
export { WorkspaceStats, AIInsightCard, RecentActivity } from './WorkspaceStats'
export type { StatItem } from './WorkspaceStats'
export { PayerComparisonCard, createPayerSummary } from './PayerComparisonCard'
export type { PayerAssessmentSummary } from './PayerComparisonCard'
export { StrategicIntelligence } from './StrategicIntelligence'
