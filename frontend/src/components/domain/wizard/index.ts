/**
 * Wizard step components for the CaseDetail page.
 *
 * Each file owns a single wizard step's rendering and step-specific
 * local state. The parent CaseDetail.tsx retains ownership of:
 * - wizard navigation / step orchestration
 * - top-level mutations (useRunStage, useApproveStage, etc.)
 * - the audit trail slide-out
 */

export { ReviewStep } from './ReviewStep'
export { AnalysisStep } from './AnalysisStep'
export { CohortStep } from './CohortStep'
export { AIRecommendationStep } from './AIRecommendationStep'
export { DecisionStep } from './DecisionStep'
export { StrategyStep } from './StrategyStep'
export { SubmitStep } from './SubmitStep'
export { CompletedStep } from './CompletedStep'
export { FailedStep } from './FailedStep'
export { ReferenceInfoContent } from './ReferenceInfoContent'
export {
  getPatientName,
  getPrimaryPayer,
  transformToCriteriaResults,
  transformToCriteriaResultsForPayer,
} from './wizardHelpers'
