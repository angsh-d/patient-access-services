/**
 * AppealPrediction - Predicts appeal success likelihood
 *
 * Displays:
 * - Gauge visualization for predicted success rate
 * - Key factors for and against success
 * - Recommended actions to improve chances
 * - Risk assessment summary
 *
 * Uses the same greyscale Apple-inspired design language as AppealPanel.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronDown,
  Zap,
  Shield,
  Target,
  RotateCcw,
  ArrowRight,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENDPOINTS } from '@/lib/constants'

// ── Types ──

interface AppealPredictionProps {
  caseId: string
  className?: string
}

interface RecommendedAction {
  action: string
  impact: 'high' | 'medium' | 'low'
  reasoning: string
}

interface RiskAssessment {
  overall_risk_level: 'low' | 'moderate' | 'high' | 'very_high'
  primary_risk: string
  mitigation_strategy: string
  timeline_risk: string
  documentation_risk: string
}

interface DenialContext {
  payer_name: string
  status: string
  denial_reason?: string
  coverage_status?: string
  approval_likelihood?: number
}

interface AppealPredictionData {
  case_id: string
  predicted_success_rate: number
  confidence: number
  key_factors_for: string[]
  key_factors_against: string[]
  recommended_actions: RecommendedAction[]
  risk_assessment: RiskAssessment
  reasoning_chain: string
  denial_context: DenialContext[]
  provider: string
}

// ── API helper ──

async function fetchAppealPrediction(caseId: string): Promise<AppealPredictionData> {
  const { request } = await import('@/services/api')
  return request<AppealPredictionData>(
    ENDPOINTS.predictAppeal(caseId),
    { method: 'POST' },
    120000 // 2 minute timeout for LLM calls
  )
}

// ── Gauge Component ──

function SuccessGauge({ rate, confidence }: { rate: number; confidence: number }) {
  const percentage = Math.round(rate * 100)
  const confidencePct = Math.round(confidence * 100)

  // Arc calculations for the gauge (semi-circle)
  const radius = 80
  const strokeWidth = 12
  const center = 100
  const circumference = Math.PI * radius
  const filledLength = (rate * circumference)

  // Color based on rate
  const getGaugeColor = (r: number) => {
    if (r >= 0.65) return 'text-grey-900'
    if (r >= 0.40) return 'text-grey-500'
    return 'text-grey-300'
  }

  const getGaugeLabel = (r: number) => {
    if (r >= 0.70) return 'Favorable'
    if (r >= 0.50) return 'Moderate'
    if (r >= 0.30) return 'Challenging'
    return 'Difficult'
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[200px] h-[120px]">
        <svg viewBox="0 0 200 120" className="w-full h-full">
          {/* Background arc */}
          <path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="text-grey-100"
          />
          {/* Filled arc */}
          <motion.path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={getGaugeColor(rate)}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - filledLength }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <motion.span
            className="text-3xl font-bold text-grey-900 tabular-nums"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            {percentage}%
          </motion.span>
        </div>
      </div>
      <motion.div
        className="text-center mt-1"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <span className={cn(
          'text-sm font-semibold',
          percentage >= 65 ? 'text-grey-900' : percentage >= 40 ? 'text-grey-600' : 'text-grey-400'
        )}>
          {getGaugeLabel(rate)}
        </span>
        <div className="flex items-center justify-center gap-1.5 mt-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-grey-300" />
          <span className="text-[10px] text-grey-400">{confidencePct}% confidence</span>
        </div>
      </motion.div>
    </div>
  )
}

// ── Main Component ──

export function AppealPrediction({ caseId, className }: AppealPredictionProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('factors')

  const predictionMutation = useMutation({
    mutationFn: () => fetchAppealPrediction(caseId),
  })

  const prediction = predictionMutation.data

  const impactBadgeClass = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-grey-900 text-white'
      case 'medium': return 'bg-grey-200 text-grey-700'
      default: return 'bg-grey-100 text-grey-500'
    }
  }

  const riskLevelClass = (level: string) => {
    switch (level) {
      case 'low': return 'bg-grey-100 text-grey-600'
      case 'moderate': return 'bg-grey-200 text-grey-700'
      case 'high': return 'bg-grey-700 text-white'
      case 'very_high': return 'bg-grey-900 text-white'
      default: return 'bg-grey-100 text-grey-500'
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-grey-50 rounded-xl border border-grey-200">
        <div className="p-2 rounded-lg bg-grey-900">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-grey-900">Appeal Success Prediction</h3>
          <p className="text-xs text-grey-400 truncate">
            AI-powered analysis of appeal likelihood
          </p>
        </div>
      </div>

      {/* Prediction trigger / results */}
      <div className="bg-white rounded-2xl border border-grey-200 overflow-hidden">
        {!prediction && !predictionMutation.isPending && !predictionMutation.isError ? (
          <div className="text-center py-8 px-4">
            <Activity className="w-10 h-10 text-grey-200 mx-auto mb-3" />
            <p className="text-sm text-grey-500 mb-1">Predict Appeal Success</p>
            <p className="text-xs text-grey-400 mb-5 max-w-xs mx-auto">
              Claude will analyze the denial, clinical profile, and historical patterns to predict appeal outcomes
            </p>
            <button
              type="button"
              onClick={() => predictionMutation.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-grey-900 text-white text-sm font-medium rounded-lg hover:bg-grey-800 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Run Prediction
            </button>
          </div>
        ) : predictionMutation.isPending ? (
          <div className="flex items-center gap-3 px-6 py-10 justify-center">
            <svg className="w-5 h-5 text-grey-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-sm font-medium text-grey-700">Analyzing appeal probability...</p>
              <p className="text-xs text-grey-400">Evaluating denial context, clinical strength, and payer patterns</p>
            </div>
          </div>
        ) : predictionMutation.isError ? (
          <div className="text-center py-8 px-4">
            <AlertCircle className="w-6 h-6 text-grey-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-grey-700 mb-1">
              Prediction failed
            </p>
            <p className="text-xs text-grey-400 mb-4 max-w-xs mx-auto">
              {predictionMutation.error instanceof Error ? predictionMutation.error.message : 'An error occurred'}
            </p>
            <button
              type="button"
              onClick={() => predictionMutation.mutate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-grey-900 hover:bg-grey-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        ) : prediction ? (
          <div className="space-y-0">
            {/* Gauge section */}
            <div className="px-6 pt-6 pb-4 border-b border-grey-100">
              <SuccessGauge
                rate={prediction.predicted_success_rate}
                confidence={prediction.confidence}
              />

              {/* Denial context badges */}
              {prediction.denial_context && prediction.denial_context.length > 0 && (
                <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                  {prediction.denial_context.map((dc, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium px-2 py-0.5 rounded bg-grey-100 text-grey-500"
                    >
                      {dc.payer_name} - {dc.status.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Key Factors (collapsible) */}
            <CollapsibleBlock
              title="Key Factors"
              icon={<Target className="w-4 h-4" />}
              expanded={expandedSection === 'factors'}
              onToggle={() => setExpandedSection(expandedSection === 'factors' ? null : 'factors')}
              badge={`${prediction.key_factors_for.length + prediction.key_factors_against.length}`}
            >
              <div className="space-y-4">
                {/* Factors FOR */}
                {prediction.key_factors_for.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-grey-600" />
                      <span className="text-xs font-medium text-grey-500 uppercase tracking-wider">
                        Supporting Factors
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {prediction.key_factors_for.map((factor, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 + 0.1 }}
                          className="flex items-start gap-2.5 px-3 py-2 bg-grey-50 rounded-lg border border-grey-100"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-grey-900 mt-1.5 shrink-0" />
                          <span className="text-xs text-grey-700 leading-relaxed">{factor}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Factors AGAINST */}
                {prediction.key_factors_against.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-3.5 h-3.5 text-grey-400" />
                      <span className="text-xs font-medium text-grey-500 uppercase tracking-wider">
                        Opposing Factors
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {prediction.key_factors_against.map((factor, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 + 0.1 }}
                          className="flex items-start gap-2.5 px-3 py-2 bg-grey-50 rounded-lg border border-grey-100"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-grey-300 mt-1.5 shrink-0" />
                          <span className="text-xs text-grey-600 leading-relaxed">{factor}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleBlock>

            {/* Recommended Actions (collapsible) */}
            {prediction.recommended_actions.length > 0 && (
              <CollapsibleBlock
                title="Recommended Actions"
                icon={<Zap className="w-4 h-4" />}
                expanded={expandedSection === 'actions'}
                onToggle={() => setExpandedSection(expandedSection === 'actions' ? null : 'actions')}
                badge={`${prediction.recommended_actions.length}`}
              >
                <div className="space-y-2">
                  {prediction.recommended_actions.map((action, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 + 0.1 }}
                      className="p-3 bg-grey-50 rounded-xl border border-grey-100"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-grey-200 flex items-center justify-center text-[10px] font-semibold text-grey-600 shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs font-medium text-grey-800">{action.action}</p>
                            <span className={cn(
                              'text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded',
                              impactBadgeClass(action.impact)
                            )}>
                              {action.impact}
                            </span>
                          </div>
                          <p className="text-[11px] text-grey-500 leading-relaxed">{action.reasoning}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CollapsibleBlock>
            )}

            {/* Risk Assessment (collapsible) */}
            {prediction.risk_assessment && prediction.risk_assessment.overall_risk_level && (
              <CollapsibleBlock
                title="Risk Assessment"
                icon={<Shield className="w-4 h-4" />}
                expanded={expandedSection === 'risk'}
                onToggle={() => setExpandedSection(expandedSection === 'risk' ? null : 'risk')}
                badge={
                  <span className={cn(
                    'text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded',
                    riskLevelClass(prediction.risk_assessment.overall_risk_level)
                  )}>
                    {prediction.risk_assessment.overall_risk_level.replace(/_/g, ' ')}
                  </span>
                }
              >
                <div className="space-y-3">
                  {prediction.risk_assessment.primary_risk && (
                    <div className="px-3 py-2.5 bg-grey-50 rounded-xl border border-grey-100">
                      <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                        Primary Risk
                      </span>
                      <p className="text-xs text-grey-700 mt-1 leading-relaxed">
                        {prediction.risk_assessment.primary_risk}
                      </p>
                    </div>
                  )}

                  {prediction.risk_assessment.mitigation_strategy && (
                    <div className="px-3 py-2.5 bg-grey-50 rounded-xl border border-grey-100">
                      <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                        Mitigation Strategy
                      </span>
                      <p className="text-xs text-grey-700 mt-1 leading-relaxed">
                        {prediction.risk_assessment.mitigation_strategy}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {prediction.risk_assessment.timeline_risk && (
                      <div className="px-3 py-2 bg-grey-50 rounded-lg border border-grey-100">
                        <span className="text-[9px] font-medium text-grey-400 uppercase tracking-wider">
                          Timeline Risk
                        </span>
                        <p className="text-[11px] text-grey-600 mt-0.5 leading-relaxed">
                          {prediction.risk_assessment.timeline_risk}
                        </p>
                      </div>
                    )}
                    {prediction.risk_assessment.documentation_risk && (
                      <div className="px-3 py-2 bg-grey-50 rounded-lg border border-grey-100">
                        <span className="text-[9px] font-medium text-grey-400 uppercase tracking-wider">
                          Documentation Risk
                        </span>
                        <p className="text-[11px] text-grey-600 mt-0.5 leading-relaxed">
                          {prediction.risk_assessment.documentation_risk}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleBlock>
            )}

            {/* Reasoning Chain (collapsible) */}
            {prediction.reasoning_chain && (
              <CollapsibleBlock
                title="AI Reasoning"
                icon={<ArrowRight className="w-4 h-4" />}
                expanded={expandedSection === 'reasoning'}
                onToggle={() => setExpandedSection(expandedSection === 'reasoning' ? null : 'reasoning')}
              >
                <div className="px-3 py-2.5 bg-grey-50 rounded-xl border border-grey-100">
                  <p className="text-xs text-grey-600 leading-relaxed whitespace-pre-wrap">
                    {prediction.reasoning_chain}
                  </p>
                </div>
              </CollapsibleBlock>
            )}

            {/* Re-run button */}
            <div className="px-4 pb-4 pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => predictionMutation.mutate()}
                disabled={predictionMutation.isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-grey-200 bg-white text-grey-500 hover:bg-grey-50 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                Re-run Prediction
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Collapsible Block (internal) ──

interface CollapsibleBlockProps {
  title: string
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}

function CollapsibleBlock({ title, icon, expanded, onToggle, badge, children }: CollapsibleBlockProps) {
  return (
    <div className="border-b border-grey-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-grey-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-grey-500">{icon}</span>
          <span className="text-sm font-medium text-grey-900">{title}</span>
          {badge && (
            typeof badge === 'string' ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-grey-100 text-grey-500 rounded">
                {badge}
              </span>
            ) : badge
          )}
        </div>
        <ChevronDown className={cn(
          'w-4 h-4 text-grey-400 transition-transform duration-200',
          expanded && 'rotate-180'
        )} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AppealPrediction
