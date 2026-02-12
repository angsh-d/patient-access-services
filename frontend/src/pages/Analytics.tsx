import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  Target,
  BarChart3,
  Activity,
  TrendingUp,
  Clock,
  Cpu,
  AlertCircle,
} from 'lucide-react'
import { ENDPOINTS, QUERY_KEYS, CACHE_TIMES, STAGE_DISPLAY_NAMES } from '@/lib/constants'
import { request } from '@/services/api'
import type { CaseState } from '@/types/case'

const ease = [0.16, 1, 0.3, 1] as const

// --- Types ---

interface LLMCostBreakdownItem {
  provider?: string
  model?: string
  task_category?: string
  case_id?: string
  call_count: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  avg_latency_ms: number
}

interface LLMCostResponse {
  period_days: number
  group_by: string
  totals: {
    call_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost_usd: number
    avg_latency_ms: number
  }
  breakdown: LLMCostBreakdownItem[]
}

interface PredictionAccuracyResponse {
  total_predictions: number
  correct_predictions: number
  accuracy_rate: number
  average_likelihood_error: number
  message?: string
}

interface CaseListResponse {
  cases: CaseState[]
  total: number
}

// --- Helpers ---

function formatCost(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value >= 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(6)}`
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

// --- Stat Card ---

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'grey',
  delay = 0,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ElementType
  color?: string
  delay?: number
}) {
  const bgColors: Record<string, string> = {
    green: 'rgba(34, 197, 94, 0.08)',
    blue: 'rgba(59, 130, 246, 0.08)',
    purple: 'rgba(147, 51, 234, 0.08)',
    amber: 'rgba(245, 158, 11, 0.08)',
    grey: 'rgba(0, 0, 0, 0.04)',
  }
  const iconColors: Record<string, string> = {
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#9333ea',
    amber: '#f59e0b',
    grey: '#6e6e73',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease }}
      style={{
        background: '#ffffff',
        border: '0.5px solid rgba(0, 0, 0, 0.06)',
        borderRadius: '16px',
        padding: '24px',
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: '#aeaeb2',
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
          }}>
            {title}
          </p>
          <p style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            fontWeight: 700,
            color: '#1d1d1f',
            letterSpacing: '-0.035em',
            marginTop: '6px',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}>
            {value}
          </p>
          {subtitle && (
            <p style={{
              fontSize: '0.8125rem',
              color: '#86868b',
              marginTop: '6px',
              letterSpacing: '-0.008em',
            }}>
              {subtitle}
            </p>
          )}
        </div>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: bgColors[color] || bgColors.grey,
          }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColors[color] || iconColors.grey }} />
        </div>
      </div>
    </motion.div>
  )
}

// --- Provider Breakdown Row ---

function ProviderRow({
  item,
  groupBy,
  maxCost,
  delay,
}: {
  item: LLMCostBreakdownItem
  groupBy: string
  maxCost: number
  delay: number
}) {
  const groupKey = (item as unknown as Record<string, unknown>)[groupBy] as string || 'unknown'
  const barWidth = maxCost > 0 ? (item.total_cost_usd / maxCost) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      style={{ padding: '14px 0', borderBottom: '0.5px solid rgba(0, 0, 0, 0.04)' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <div className="flex items-center gap-2.5">
          <Cpu className="w-3.5 h-3.5" style={{ color: '#aeaeb2' }} />
          <span style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#1d1d1f',
            letterSpacing: '-0.01em',
            textTransform: 'capitalize' as const,
          }}>
            {groupKey}
          </span>
        </div>
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 700,
          color: '#1d1d1f',
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatCost(item.total_cost_usd)}
        </span>
      </div>

      {/* Bar */}
      <div style={{
        width: '100%',
        height: '4px',
        borderRadius: '2px',
        background: 'rgba(0, 0, 0, 0.04)',
        marginBottom: '8px',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: 0.8, delay: delay + 0.2, ease }}
          style={{
            height: '100%',
            borderRadius: '2px',
            background: '#1d1d1f',
          }}
        />
      </div>

      <div className="flex items-center gap-4">
        <span style={{ fontSize: '0.75rem', color: '#aeaeb2', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(item.call_count)} calls
        </span>
        <span style={{ fontSize: '0.75rem', color: '#aeaeb2', fontVariantNumeric: 'tabular-nums' }}>
          {formatTokens(item.total_input_tokens + item.total_output_tokens)} tokens
        </span>
        <span style={{ fontSize: '0.75rem', color: '#aeaeb2', fontVariantNumeric: 'tabular-nums' }}>
          {formatLatency(item.avg_latency_ms)} avg
        </span>
      </div>
    </motion.div>
  )
}

// --- Stage Distribution Bar ---

function StageBar({
  stage,
  count,
  maxCount,
  delay,
}: {
  stage: string
  count: number
  maxCount: number
  delay: number
}) {
  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0
  const displayName = STAGE_DISPLAY_NAMES[stage] || stage

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      style={{ padding: '10px 0' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
        <span style={{
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: '#6e6e73',
          letterSpacing: '-0.008em',
        }}>
          {displayName}
        </span>
        <span style={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: '#1d1d1f',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count}
        </span>
      </div>
      <div style={{
        width: '100%',
        height: '4px',
        borderRadius: '2px',
        background: 'rgba(0, 0, 0, 0.04)',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: 0.8, delay: delay + 0.1, ease }}
          style={{
            height: '100%',
            borderRadius: '2px',
            background: stage === 'completed' ? '#22c55e' : stage === 'failed' ? '#ef4444' : '#1d1d1f',
          }}
        />
      </div>
    </motion.div>
  )
}

// --- Main Page ---

export default function Analytics() {
  // Fetch LLM costs
  const {
    data: costData,
    isLoading: costLoading,
    error: costError,
  } = useQuery<LLMCostResponse>({
    queryKey: QUERY_KEYS.analyticsLLMCosts,
    queryFn: () => request<LLMCostResponse>(`${ENDPOINTS.analyticsLLMCosts}?days=30&group_by=provider`),
    staleTime: CACHE_TIMES.SEMI_STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch prediction accuracy
  const {
    data: accuracyData,
    isLoading: accuracyLoading,
    error: accuracyError,
  } = useQuery<PredictionAccuracyResponse>({
    queryKey: QUERY_KEYS.analyticsPredictionAccuracy,
    queryFn: () => request<PredictionAccuracyResponse>(ENDPOINTS.analyticsPredictionAccuracy),
    staleTime: CACHE_TIMES.SEMI_STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch cases for stage distribution
  const {
    data: casesData,
    isLoading: casesLoading,
    error: casesError,
  } = useQuery<CaseListResponse>({
    queryKey: ['analytics', 'cases'],
    queryFn: () => request<CaseListResponse>(`${ENDPOINTS.cases}?limit=1000`),
    staleTime: CACHE_TIMES.SEMI_STATIC,
    gcTime: CACHE_TIMES.GC_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Compute stage distribution from cases
  const stageDistribution = useMemo(() => {
    const cases = casesData?.cases ?? []
    const counts: Record<string, number> = {}
    cases.forEach((c) => {
      const stage = c.stage || 'unknown'
      counts[stage] = (counts[stage] || 0) + 1
    })
    // Sort: active stages first, then completed/failed
    const order = [
      'intake',
      'policy_analysis',
      'awaiting_human_decision',
      'strategy_generation',
      'strategy_selection',
      'action_coordination',
      'monitoring',
      'recovery',
      'completed',
      'failed',
    ]
    return order
      .filter((s) => counts[s] > 0)
      .map((s) => ({ stage: s, count: counts[s] }))
  }, [casesData])

  // Compute approval rate from cases
  const approvalStats = useMemo(() => {
    const cases = casesData?.cases ?? []
    if (cases.length === 0) return { approvalRate: 0, total: 0, approved: 0 }
    let approved = 0
    cases.forEach((c) => {
      const primaryPayerName = c.patient.primary_payer
      const status = c.payer_states[primaryPayerName]?.status
      if (status === 'approved' || status === 'appeal_approved') approved++
    })
    return {
      approvalRate: approved / cases.length,
      total: cases.length,
      approved,
    }
  }, [casesData])

  const isLoading = costLoading || accuracyLoading || casesLoading
  const hasError = costError || accuracyError || casesError

  if (isLoading) return <LoadingSkeleton />

  const totalCost = costData?.totals?.total_cost_usd ?? 0
  const totalCalls = costData?.totals?.call_count ?? 0
  const avgLatency = costData?.totals?.avg_latency_ms ?? 0
  const totalCases = casesData?.total ?? 0
  const accuracyRate = accuracyData?.accuracy_rate ?? 0
  const totalPredictions = accuracyData?.total_predictions ?? 0
  const avgError = accuracyData?.average_likelihood_error ?? 0
  const breakdown = costData?.breakdown ?? []
  const maxCost = breakdown.length > 0 ? Math.max(...breakdown.map((b) => b.total_cost_usd)) : 0
  const maxStageCount = stageDistribution.length > 0 ? Math.max(...stageDistribution.map((s) => s.count)) : 0

  return (
    <div className="min-h-screen" style={{ background: '#fff' }}>
      {/* Header */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease }}
        style={{ background: 'linear-gradient(180deg, #fbfbfd 0%, #f5f5f7 100%)' }}
      >
        <div className="max-w-[980px] mx-auto px-6" style={{ paddingTop: '56px', paddingBottom: '48px' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="text-center"
          >
            <h1 style={{
              fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
              fontWeight: 700,
              color: '#1d1d1f',
              letterSpacing: '-0.04em',
              lineHeight: 1.07,
            }}>
              Analytics.
            </h1>
            <p style={{
              fontSize: 'clamp(1rem, 2vw, 1.3125rem)',
              color: '#86868b',
              marginTop: '12px',
              letterSpacing: '-0.016em',
              lineHeight: 1.4,
              fontWeight: 400,
            }}>
              Platform performance, cost insights, and prediction accuracy
            </p>
          </motion.div>
        </div>
      </motion.section>

      {/* Error banner */}
      {hasError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="max-w-[980px] mx-auto px-6"
          style={{ paddingTop: '16px' }}
        >
          <div
            className="flex items-center gap-3"
            style={{
              padding: '14px 20px',
              background: 'rgba(239, 68, 68, 0.06)',
              borderRadius: '12px',
              border: '0.5px solid rgba(239, 68, 68, 0.12)',
            }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#ef4444' }} />
            <span style={{ fontSize: '0.8125rem', color: '#6e6e73', letterSpacing: '-0.008em' }}>
              Some analytics data could not be loaded. Displaying available information.
            </span>
          </div>
        </motion.div>
      )}

      {/* Content */}
      <section style={{ background: '#fff' }}>
        <div className="max-w-[980px] mx-auto px-6" style={{ paddingTop: '8px', paddingBottom: '80px' }}>
          {/* Top Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginTop: '32px' }}>
            <StatCard
              title="Total LLM Cost"
              value={formatCost(totalCost)}
              subtitle={`Last ${costData?.period_days ?? 30} days`}
              icon={DollarSign}
              color="green"
              delay={0.2}
            />
            <StatCard
              title="API Calls"
              value={formatNumber(totalCalls)}
              subtitle={`${formatLatency(avgLatency)} avg latency`}
              icon={Activity}
              color="blue"
              delay={0.25}
            />
            <StatCard
              title="Prediction Accuracy"
              value={totalPredictions > 0 ? formatPercent(accuracyRate) : '--'}
              subtitle={totalPredictions > 0 ? `${formatNumber(totalPredictions)} predictions` : 'No predictions recorded'}
              icon={Target}
              color="purple"
              delay={0.3}
            />
            <StatCard
              title="Total Cases"
              value={formatNumber(totalCases)}
              subtitle={approvalStats.approved > 0 ? `${formatPercent(approvalStats.approvalRate)} approval rate` : 'No approvals yet'}
              icon={BarChart3}
              color="amber"
              delay={0.35}
            />
          </div>

          {/* Two-column detail section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ marginTop: '40px' }}>
            {/* LLM Cost Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease }}
              style={{
                background: '#ffffff',
                border: '0.5px solid rgba(0, 0, 0, 0.06)',
                borderRadius: '16px',
                padding: '28px',
              }}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <TrendingUp className="w-4 h-4" style={{ color: '#1d1d1f' }} strokeWidth={2} />
                <span style={{
                  fontSize: '1.3125rem',
                  fontWeight: 700,
                  color: '#1d1d1f',
                  letterSpacing: '-0.025em',
                }}>
                  Cost by Provider
                </span>
              </div>
              <p style={{
                fontSize: '0.8125rem',
                color: '#aeaeb2',
                marginBottom: '20px',
                letterSpacing: '-0.008em',
              }}>
                LLM spending breakdown for the last {costData?.period_days ?? 30} days
              </p>

              {breakdown.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9375rem', color: '#aeaeb2', letterSpacing: '-0.008em' }}>
                    No LLM usage recorded yet.
                  </p>
                </div>
              ) : (
                <div>
                  {breakdown.map((item, i) => (
                    <ProviderRow
                      key={(item as unknown as Record<string, unknown>)[costData?.group_by ?? 'provider'] as string || i}
                      item={item}
                      groupBy={costData?.group_by ?? 'provider'}
                      maxCost={maxCost}
                      delay={0.45 + i * 0.08}
                    />
                  ))}

                  {/* Totals footer */}
                  <div
                    className="flex items-center justify-between"
                    style={{
                      marginTop: '16px',
                      paddingTop: '16px',
                      borderTop: '0.5px solid rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#6e6e73' }}>
                      Total Tokens
                    </span>
                    <span style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: '#1d1d1f',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {formatTokens((costData?.totals?.total_input_tokens ?? 0) + (costData?.totals?.total_output_tokens ?? 0))}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Case Stage Distribution */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45, ease }}
              style={{
                background: '#ffffff',
                border: '0.5px solid rgba(0, 0, 0, 0.06)',
                borderRadius: '16px',
                padding: '28px',
              }}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <Clock className="w-4 h-4" style={{ color: '#1d1d1f' }} strokeWidth={2} />
                <span style={{
                  fontSize: '1.3125rem',
                  fontWeight: 700,
                  color: '#1d1d1f',
                  letterSpacing: '-0.025em',
                }}>
                  Cases by Stage
                </span>
              </div>
              <p style={{
                fontSize: '0.8125rem',
                color: '#aeaeb2',
                marginBottom: '20px',
                letterSpacing: '-0.008em',
              }}>
                Current distribution of cases across workflow stages
              </p>

              {stageDistribution.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9375rem', color: '#aeaeb2', letterSpacing: '-0.008em' }}>
                    No cases created yet.
                  </p>
                </div>
              ) : (
                <div>
                  {stageDistribution.map((item, i) => (
                    <StageBar
                      key={item.stage}
                      stage={item.stage}
                      count={item.count}
                      maxCount={maxStageCount}
                      delay={0.5 + i * 0.06}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Prediction Accuracy Details */}
          {totalPredictions > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.55, ease }}
              style={{
                marginTop: '24px',
                background: '#ffffff',
                border: '0.5px solid rgba(0, 0, 0, 0.06)',
                borderRadius: '16px',
                padding: '28px',
              }}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <Target className="w-4 h-4" style={{ color: '#1d1d1f' }} strokeWidth={2} />
                <span style={{
                  fontSize: '1.3125rem',
                  fontWeight: 700,
                  color: '#1d1d1f',
                  letterSpacing: '-0.025em',
                }}>
                  Prediction Performance
                </span>
              </div>
              <p style={{
                fontSize: '0.8125rem',
                color: '#aeaeb2',
                marginBottom: '24px',
                letterSpacing: '-0.008em',
              }}>
                How well the AI predicted payer decisions compared to actual outcomes
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: '#aeaeb2',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase' as const,
                    marginBottom: '6px',
                  }}>
                    Correct Predictions
                  </p>
                  <p style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#1d1d1f',
                    letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatNumber(accuracyData?.correct_predictions ?? 0)}
                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#aeaeb2', marginLeft: '4px' }}>
                      / {formatNumber(totalPredictions)}
                    </span>
                  </p>
                </div>
                <div>
                  <p style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: '#aeaeb2',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase' as const,
                    marginBottom: '6px',
                  }}>
                    Accuracy Rate
                  </p>
                  <p style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: accuracyRate >= 0.8 ? '#22c55e' : accuracyRate >= 0.6 ? '#f59e0b' : '#ef4444',
                    letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatPercent(accuracyRate)}
                  </p>
                </div>
                <div>
                  <p style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: '#aeaeb2',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase' as const,
                    marginBottom: '6px',
                  }}>
                    Avg Likelihood Error
                  </p>
                  <p style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#1d1d1f',
                    letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatPercent(avgError)}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>
    </div>
  )
}

// --- Loading Skeleton ---

function LoadingSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: '#fff' }}>
      <div className="max-w-[980px] mx-auto px-6" style={{ paddingTop: '80px' }}>
        <div className="text-center">
          <div className="animate-pulse mx-auto" style={{ width: '220px', height: '48px', borderRadius: '12px', background: '#f5f5f7' }} />
          <div className="animate-pulse mx-auto mt-4" style={{ width: '320px', height: '24px', borderRadius: '8px', background: '#f5f5f7' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: '120px', borderRadius: '16px', background: '#f5f5f7' }} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-10">
          <div className="animate-pulse" style={{ height: '300px', borderRadius: '16px', background: '#f5f5f7' }} />
          <div className="animate-pulse" style={{ height: '300px', borderRadius: '16px', background: '#f5f5f7' }} />
        </div>
      </div>
    </div>
  )
}
