/**
 * DiscriminantPredictionCard — Statistical approval prediction
 *
 * Renders L2-penalized logistic regression results with plain-language
 * explanations for PA specialists and clinical staff:
 *   - Probability band with contextual interpretation
 *   - Probability gauge with CI bar and sentence interpretation
 *   - Clickable validity badge with explainer
 *   - Filtered feature impacts (>=3% only)
 *   - LLM narrative
 *   - "How this works" methodology section
 *   - "Model Quality" with plain-language metric translations
 *   - Plain-language broadening footnote
 *
 * Greyscale design consistent with CohortInsightsPanel.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUERY_KEYS, ENDPOINTS, CACHE_TIMES } from '@/lib/constants'
import type {
  DiscriminantPredictionResponse,
  FeatureContribution,
} from '@/types/discriminant'

// ── Fetcher ────────────────────────────────────────────────────────────

async function fetchDiscriminantPrediction(caseId: string): Promise<DiscriminantPredictionResponse> {
  const { request } = await import('@/services/api')
  return request<DiscriminantPredictionResponse>(ENDPOINTS.discriminantPrediction(caseId), {}, 120000)
}

// ── Helpers ────────────────────────────────────────────────────────────

function humanizeFeatureName(name: string): string {
  const mapping: Record<string, string> = {
    sev_crp: 'CRP level',
    sev_esr: 'ESR level',
    sev_albumin: 'Albumin level',
    sev_cdai_score: 'CDAI score',
    sev_hbi_score: 'HBI score',
    sev_mayo_score: 'Mayo score',
    sev_uceis_score: 'UCEIS score',
    sev_ses_cd_score: 'SES-CD score',
    sev_fecal_calprotectin: 'Fecal calprotectin',
    is_severe: 'Severe classification',
    is_moderate_to_severe: 'Moderate-to-severe classification',
    num_prior_treatments: 'Number of prior treatments',
    has_failed_immunomodulator: 'Failed immunomodulator',
    has_failed_corticosteroid: 'Failed corticosteroid',
    has_failed_5asa: 'Failed 5-ASA',
    has_tdm_documented: 'TDM documented',
    max_treatment_duration: 'Treatment duration',
    is_ppo: 'PPO plan',
    is_hmo: 'HMO plan',
    crp_x_missing_tb: 'CRP × missing TB screening',
    severity_x_missing_hep: 'Severity × missing hepatitis panel',
    lab_severity_bundle: 'Lab severity markers (CRP+albumin+ESR)',
  }

  if (mapping[name]) return mapping[name]

  if (name.startsWith('doc_missing_')) {
    const docName = name.replace('doc_missing_', '').replace(/_/g, ' ')
    return `Missing ${docName}`
  }

  return name.replace(/_/g, ' ').replace(/^sev /, '')
}

function getValidityBg(validity: string): string {
  switch (validity) {
    case 'reliable': return 'bg-grey-800'
    case 'moderate': return 'bg-grey-600'
    case 'low': return 'bg-grey-400'
    case 'insufficient': return 'bg-grey-300'
    default: return 'bg-grey-400'
  }
}

function getProbabilityBand(probability: number): { label: string; description: string } {
  const pct = probability * 100
  if (pct >= 85) return { label: 'High likelihood of approval', description: 'high' }
  if (pct >= 70) return { label: 'Above-average likelihood of approval', description: 'above-average' }
  if (pct >= 50) return { label: 'Moderate likelihood of approval', description: 'moderate' }
  if (pct >= 35) return { label: 'Below-average likelihood of approval', description: 'below-average' }
  return { label: 'Low likelihood of approval', description: 'low' }
}

function getValidityExplanation(validity: string, totalCases: number): string {
  switch (validity) {
    case 'reliable':
      return `Based on ${totalCases} similar cases (50+ needed for high reliability), providing a statistically robust sample.`
    case 'moderate':
      return `Based on ${totalCases} similar cases (30\u201349 range). Reasonable estimate but may shift with more data.`
    case 'low':
      return `Based on only ${totalCases} similar cases (20\u201329 range). Treat as a rough estimate.`
    case 'insufficient':
      return `Fewer than 20 similar cases found. Uses historical approval rates rather than a fitted model.`
    default:
      return `Based on ${totalCases} similar cases.`
  }
}

function humanizeTierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'matched by condition, payer, and documentation profile'
    case 2: return 'matched by condition and payer'
    case 3: return 'matched by condition across all payers'
    case 4: return 'all available resolved cases'
    default: return ''
  }
}

function humanizeBroadeningReason(
  tier: number,
  totalCases: number,
  condition: string | undefined,
  payer: string,
): string | null {
  const conditionLabel = condition?.replace(/_/g, ' ') || 'this condition'
  switch (tier) {
    case 2:
      return `Not enough cases matched the exact documentation profile, so the comparison was expanded to all ${payer} ${conditionLabel} cases (${totalCases} total).`
    case 3:
      return `Not enough ${payer}-specific cases were available, so the comparison includes ${conditionLabel} cases across all payers (${totalCases} total). Payer-specific patterns may differ.`
    case 4:
      return `Very few similar cases were found. This comparison uses all ${totalCases} available resolved cases regardless of condition or payer.`
    default:
      return null
  }
}

const FEATURE_IMPACT_THRESHOLD = 3

// ── Subcomponents ──────────────────────────────────────────────────────

function ProbabilityGauge({ probability, ciLower, ciUpper }: {
  probability: number
  ciLower: number
  ciUpper: number
}) {
  const pct = Math.round(probability * 100)
  const ciLPct = Math.round(ciLower * 100)
  const ciUPct = Math.round(ciUpper * 100)

  return (
    <div className="space-y-1.5">
      {/* Main bar */}
      <div className="relative h-6 bg-grey-100 rounded-full overflow-hidden">
        {/* CI range background */}
        <div
          className="absolute top-0 h-full bg-grey-200 rounded-full"
          style={{ left: `${ciLPct}%`, width: `${ciUPct - ciLPct}%` }}
        />
        {/* Probability fill */}
        <motion.div
          className="absolute top-0 left-0 h-full bg-grey-700 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        {/* Percentage label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            'text-xs font-bold',
            pct > 50 ? 'text-white' : 'text-grey-700'
          )}>
            {pct}%
          </span>
        </div>
      </div>
      {/* CI interpretation sentence */}
      <p className="text-[11px] text-grey-500 text-center">
        We are 95% confident the true approval rate for similar cases falls between {ciLPct}% and {ciUPct}%
      </p>
    </div>
  )
}

function FeatureColumn({ title, icon: Icon, features }: {
  title: string
  icon: typeof TrendingUp
  features: FeatureContribution[]
}) {
  if (features.length === 0) return null

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-grey-500" />
        <span className="text-xs font-medium text-grey-600">{title}</span>
      </div>
      <div className="space-y-1.5">
        {features.map((f, i) => (
          <div
            key={`${f.feature_name}-${i}`}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="text-grey-700 truncate">
              {f.direction === 'favorable' ? '+' : '\u2212'}{' '}
              {humanizeFeatureName(f.feature_name)}
            </span>
            <span className={cn(
              'shrink-0 font-mono tabular-nums',
              f.direction === 'favorable' ? 'text-grey-800' : 'text-grey-500'
            )}>
              {f.probability_impact_pct > 0 ? '+' : ''}{f.probability_impact_pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────

interface DiscriminantPredictionCardProps {
  caseId: string
  className?: string
}

// ── Component ──────────────────────────────────────────────────────────

export function DiscriminantPredictionCard({
  caseId,
  className,
}: DiscriminantPredictionCardProps) {
  const [showValidityExplainer, setShowValidityExplainer] = useState(false)
  const [showActionable, setShowActionable] = useState(false)
  const [showMethodology, setShowMethodology] = useState(false)
  const [showModelQuality, setShowModelQuality] = useState(false)
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.discriminantPrediction(caseId),
    queryFn: () => fetchDiscriminantPrediction(caseId),
    staleTime: CACHE_TIMES.STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!caseId,
  })

  // Loading
  if (isLoading) {
    return (
      <div className={cn('bg-white rounded-2xl border border-grey-200 p-5', className)}>
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-grey-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-grey-500">
            Running statistical discriminant analysis on historical cohort...
          </span>
        </div>
      </div>
    )
  }

  // Error
  if (error || !data || data.status !== 'success') {
    return (
      <div className={cn('bg-white rounded-2xl border border-grey-200 p-5', className)}>
        <div className="flex items-center gap-2 text-grey-500">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">
            {error ? 'Unable to generate statistical prediction' : (data?.status || 'No prediction data')}
          </span>
        </div>
      </div>
    )
  }

  const { prediction, cohort_metadata, narrative, actionable_items, context } = data
  const validity = prediction.diagnostics.statistical_validity
  const diag = prediction.diagnostics
  const band = getProbabilityBand(prediction.approval_probability)
  const approvedPer100 = Math.round(prediction.approval_probability * 100)

  // Filter features to >= threshold impact
  const significantFavorable = prediction.top_favorable.filter(
    f => Math.abs(f.probability_impact_pct) >= FEATURE_IMPACT_THRESHOLD
  )
  const significantUnfavorable = prediction.top_unfavorable.filter(
    f => Math.abs(f.probability_impact_pct) >= FEATURE_IMPACT_THRESHOLD
  )
  const hasSignificantFeatures = significantFavorable.length > 0 || significantUnfavorable.length > 0

  // Cohort approval rate for base-rate message
  const cohortApprovalRate = cohort_metadata.total_cases > 0
    ? Math.round((cohort_metadata.approved_count / cohort_metadata.total_cases) * 100)
    : 0

  // Broadening footnote
  const broadeningNote = cohort_metadata.broadened
    ? humanizeBroadeningReason(cohort_metadata.tier, cohort_metadata.total_cases, context.condition, context.payer)
    : null

  return (
    <div className={cn('bg-white rounded-2xl border border-grey-200', className)}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-grey-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-grey-600" />
          <span className="text-sm font-semibold text-grey-800">
            Statistical Approval Prediction
          </span>
          <button
            onClick={() => setShowValidityExplainer(!showValidityExplainer)}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-80',
              getValidityBg(validity),
              'text-white'
            )}
            title="Click for explanation"
          >
            {validity}
          </button>
        </div>
        <p className="text-xs text-grey-500 mt-0.5 pl-6">
          Based on {cohort_metadata.total_cases}{' '}
          similar {context.payer} {context.condition?.replace(/_/g, ' ')} cases
          ({humanizeTierLabel(cohort_metadata.tier)})
        </p>

        {/* Validity explainer (toggled by badge click) */}
        <AnimatePresence>
          {showValidityExplainer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-2 ml-6 px-3 py-2 bg-grey-50 rounded-lg text-xs text-grey-600 leading-relaxed">
                {getValidityExplanation(validity, cohort_metadata.total_cases)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Probability band label + contextual sentence */}
        <div className="text-center space-y-0.5">
          <p className="text-sm font-semibold text-grey-800">{band.label}</p>
          <p className="text-xs text-grey-500">
            Based on {cohort_metadata.total_cases} similar past cases, roughly {approvedPer100} out of 100 like this were approved
          </p>
        </div>

        {/* Probability gauge */}
        <ProbabilityGauge
          probability={prediction.approval_probability}
          ciLower={prediction.ci_lower}
          ciUpper={prediction.ci_upper}
        />

        {/* Narrative */}
        {narrative && (
          <p className="text-sm text-grey-700 leading-relaxed">
            {narrative}
          </p>
        )}

        {/* Feature contributions (filtered to >= threshold) */}
        {hasSignificantFeatures ? (
          <div className="flex gap-4">
            <FeatureColumn
              title="Favorable"
              icon={TrendingUp}
              features={significantFavorable}
            />
            {significantFavorable.length > 0 && significantUnfavorable.length > 0 && (
              <div className="w-px bg-grey-100 shrink-0" />
            )}
            <FeatureColumn
              title="Unfavorable"
              icon={TrendingDown}
              features={significantUnfavorable}
            />
          </div>
        ) : (
          prediction.model_type === 'logistic_regression' && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-grey-50 rounded-lg">
              <Info className="w-3.5 h-3.5 text-grey-400 mt-0.5 shrink-0" />
              <p className="text-xs text-grey-500 leading-relaxed">
                No individual feature strongly shifted the prediction. The result is primarily driven by the overall approval rate for similar cases ({cohortApprovalRate}% approved in this cohort).
              </p>
            </div>
          )
        )}

        {/* Actionable items (collapsible) */}
        {actionable_items && actionable_items.length > 0 && (
          <div>
            <button
              onClick={() => setShowActionable(!showActionable)}
              className="flex items-center gap-1.5 text-xs text-grey-500 hover:text-grey-700 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Actionable Items ({actionable_items.length})</span>
              <ChevronDown className={cn(
                'w-3 h-3 transition-transform',
                showActionable && 'rotate-180'
              )} />
            </button>
            <AnimatePresence>
              {showActionable && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ul className="mt-2 space-y-1.5 pl-5">
                    {actionable_items.map((item, i) => (
                      <li key={i} className="text-xs text-grey-600 list-disc">
                        {item}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* How this works (collapsible) */}
        <div>
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="flex items-center gap-1.5 text-xs text-grey-500 hover:text-grey-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>How this works</span>
            <ChevronDown className={cn(
              'w-3 h-3 transition-transform',
              showMethodology && 'rotate-180'
            )} />
          </button>
          <AnimatePresence>
            {showMethodology && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 bg-grey-50 rounded-xl p-3 text-xs text-grey-600 leading-relaxed space-y-2">
                  {prediction.model_type === 'logistic_regression' ? (
                    <>
                      <p>
                        This prediction uses a statistical model trained on {diag.n_train} historical prior authorization cases similar to this one. The model examines clinical severity, documentation completeness, treatment history, and plan type to estimate the probability of approval.
                      </p>
                      <p>
                        Each feature's influence is measured as the change in predicted probability when that feature is included versus excluded. The confidence interval is calculated by resampling the training data 200 times to assess how stable the prediction is.
                      </p>
                    </>
                  ) : (
                    <p>
                      There were not enough similar cases to train a predictive model. This prediction reflects the historical approval rate observed in {diag.n_train} resolved cases that matched the search criteria.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Model Quality (collapsible — replaces "Model Details") */}
        <div>
          <button
            onClick={() => setShowModelQuality(!showModelQuality)}
            className="flex items-center gap-1.5 text-xs text-grey-500 hover:text-grey-700 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Model Quality</span>
            <ChevronDown className={cn(
              'w-3 h-3 transition-transform',
              showModelQuality && 'rotate-180'
            )} />
          </button>
          <AnimatePresence>
            {showModelQuality && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 bg-grey-50 rounded-xl p-3 text-xs text-grey-600 space-y-3">
                  {/* Plain-language metric translations */}
                  <div className="space-y-2 leading-relaxed">
                    <p>
                      Trained on <span className="font-semibold text-grey-700">{diag.n_train}</span> cases ({diag.n_approved} approved, {diag.n_denied} denied)
                    </p>
                    <p>
                      <span className="font-semibold text-grey-700">{diag.n_features_used}</span> clinical and administrative features contributed to this prediction
                    </p>
                    {diag.loocv_accuracy > 0 && (
                      <>
                        <p>
                          Correctly predicted the outcome in <span className="font-semibold text-grey-700">{(diag.loocv_accuracy * 100).toFixed(0)}%</span> of historical cases when tested
                        </p>
                        <p>
                          Ability to distinguish approvals from denials: <span className="font-semibold text-grey-700">{(diag.loocv_auc * 100).toFixed(0)}/100</span> (50 = no better than random, 100 = perfect)
                        </p>
                        <p>
                          Calibration score: <span className="font-semibold text-grey-700">{diag.loocv_brier_score.toFixed(3)}</span> (lower is better; 0 = perfect, 0.25 = no skill)
                        </p>
                      </>
                    )}
                  </div>

                  {/* Validity warnings */}
                  {diag.validity_warnings.length > 0 && (
                    <div className="pt-2 border-t border-grey-200">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3 h-3 text-grey-400" />
                        <span className="text-grey-500 font-medium">Warnings</span>
                      </div>
                      <ul className="space-y-0.5 pl-4">
                        {diag.validity_warnings.map((w, i) => (
                          <li key={i} className="list-disc text-grey-500">{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Show advanced metrics toggle */}
                  <div className="pt-2 border-t border-grey-200">
                    <button
                      onClick={() => setShowAdvancedMetrics(!showAdvancedMetrics)}
                      className="flex items-center gap-1 text-[11px] text-grey-400 hover:text-grey-600 transition-colors"
                    >
                      <span>Show advanced metrics</span>
                      <ChevronDown className={cn(
                        'w-2.5 h-2.5 transition-transform',
                        showAdvancedMetrics && 'rotate-180'
                      )} />
                    </button>
                    <AnimatePresence>
                      {showAdvancedMetrics && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-2">
                            {/* Raw metrics grid */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                              <span className="text-grey-500">Model type</span>
                              <span className="text-grey-700">{prediction.model_type.replace(/_/g, ' ')}</span>
                              <span className="text-grey-500">Training cases</span>
                              <span className="text-grey-700">
                                {diag.n_train} ({diag.n_approved} appr / {diag.n_denied} den)
                              </span>
                              <span className="text-grey-500">Features</span>
                              <span className="text-grey-700">{diag.n_features_used} / {diag.n_features}</span>
                              {diag.loocv_accuracy > 0 && (
                                <>
                                  <span className="text-grey-500">CV accuracy ({diag.cv_method})</span>
                                  <span className="text-grey-700">{(diag.loocv_accuracy * 100).toFixed(1)}%</span>
                                  <span className="text-grey-500">AUC</span>
                                  <span className="text-grey-700">{diag.loocv_auc.toFixed(3)}</span>
                                  <span className="text-grey-500">Brier score</span>
                                  <span className="text-grey-700">{diag.loocv_brier_score.toFixed(4)}</span>
                                  <span className="text-grey-500">L2 penalty (&lambda;)</span>
                                  <span className="text-grey-700">{diag.regularization_lambda}</span>
                                </>
                              )}
                            </div>

                            {/* All feature coefficients */}
                            {prediction.contributions.length > 0 && (
                              <div className="pt-1.5 border-t border-grey-200">
                                <span className="text-grey-500 text-[11px]">All feature coefficients:</span>
                                <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 font-mono text-[11px]">
                                  {[...prediction.contributions]
                                    .sort((a, b) => Math.abs(b.log_odds_contribution) - Math.abs(a.log_odds_contribution))
                                    .map((c, i) => (
                                      <div key={i} className="flex justify-between gap-2">
                                        <span className="truncate text-grey-600">{humanizeFeatureName(c.feature_name)}</span>
                                        <span className={cn(
                                          'shrink-0',
                                          c.direction === 'favorable' ? 'text-grey-800' : 'text-grey-400'
                                        )}>
                                          {c.log_odds_contribution > 0 ? '+' : ''}{c.log_odds_contribution.toFixed(3)}
                                        </span>
                                      </div>
                                    ))
                                  }
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Broadening footnote (plain language) */}
        {broadeningNote && (
          <p className="text-[10px] text-grey-400 leading-relaxed">
            {broadeningNote}
          </p>
        )}
      </div>
    </div>
  )
}
