import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scale,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react'
import { useCases } from '@/hooks/useCases'
import { PAYER_STATUS_COLORS } from '@/lib/constants'
import type { CaseState, PayerState, PayerStatus } from '@/types/case'

const ease = [0.16, 1, 0.3, 1] as const

// --- Appeal eligibility filter ---

const APPEAL_STATUSES: PayerStatus[] = ['denied', 'appeal_submitted', 'appeal_denied']
const AT_RISK_THRESHOLD = 0.4

function isAppealEligible(c: CaseState): boolean {
  const payerStates = Object.values(c.payer_states ?? {})
  // Any payer in appeal-related status
  if (payerStates.some((s) => APPEAL_STATUSES.includes(s.status))) return true
  // Case is in recovery stage
  if (c.stage === 'recovery') return true
  // Any payer with low approval likelihood (from coverage assessments)
  const assessments = c.coverage_assessments ?? {}
  if (Object.values(assessments).some((a) => (a?.approval_likelihood ?? 1) < AT_RISK_THRESHOLD)) return true
  return false
}

// --- Appeal status helpers ---

type AppealCategory = 'action_needed' | 'in_progress' | 'resolved'

function getAppealCategory(payerStates: Record<string, PayerState>): AppealCategory {
  const statuses = Object.values(payerStates).map((s) => s.status)
  if (statuses.includes('appeal_submitted')) return 'in_progress'
  if (statuses.includes('denied') || statuses.includes('appeal_denied')) return 'action_needed'
  return 'resolved'
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getDenialReasons(payerStates: Record<string, PayerState>): string[] {
  return Object.values(payerStates)
    .filter((s) => s.denial_reason)
    .map((s) => s.denial_reason as string)
}

function getApprovalLikelihood(c: CaseState): number | null {
  const assessments = c.coverage_assessments ?? {}
  const primaryAssessment = assessments[c.patient.primary_payer]
  return primaryAssessment?.approval_likelihood ?? null
}

// --- Stat Card ---

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  delay = 0,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ElementType
  delay?: number
}) {
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
            background: 'rgba(0, 0, 0, 0.04)',
          }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: '#6e6e73' }} />
        </div>
      </div>
    </motion.div>
  )
}

// --- Payer Status Badge ---

function PayerBadge({ payer, status }: { payer: string; status: PayerStatus }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    success: { bg: 'rgba(34, 197, 94, 0.08)', text: '#16a34a' },
    error: { bg: 'rgba(239, 68, 68, 0.06)', text: '#dc2626' },
    warning: { bg: 'rgba(245, 158, 11, 0.08)', text: '#d97706' },
    neutral: { bg: 'rgba(0, 0, 0, 0.04)', text: '#6e6e73' },
  }
  const variant = PAYER_STATUS_COLORS[status] || 'neutral'
  const colors = colorMap[variant] || colorMap.neutral

  const displayStatus = status.replace(/_/g, ' ')

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '-0.008em',
        background: colors.bg,
        color: colors.text,
        textTransform: 'capitalize',
      }}
    >
      {payer}: {displayStatus}
    </span>
  )
}

// --- Appeal Case Card ---

function AppealCaseCard({
  caseData,
  delay,
  onClick,
}: {
  caseData: CaseState
  delay: number
  onClick: () => void
}) {
  const patientName = `${caseData.patient.first_name} ${caseData.patient.last_name}`
  const denialReasons = getDenialReasons(caseData.payer_states)
  const likelihood = getApprovalLikelihood(caseData)
  const appealDeadlines = Object.values(caseData.payer_states)
    .filter((s) => s.appeal_deadline)
    .map((s) => ({ payer: s.payer_name, deadline: s.appeal_deadline as string }))

  // Check deadline urgency
  const hasUrgentDeadline = appealDeadlines.some((d) => {
    const daysLeft = Math.floor((new Date(d.deadline).getTime() - Date.now()) / 86400000)
    return daysLeft <= 7
  })

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      onClick={onClick}
      className="w-full text-left"
      style={{
        background: '#ffffff',
        border: '0.5px solid rgba(0, 0, 0, 0.06)',
        borderRadius: '14px',
        padding: '20px 24px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      whileHover={{
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
        borderColor: 'rgba(0, 0, 0, 0.12)',
      }}
      whileTap={{ scale: 0.995 }}
    >
      {/* Top row: patient + medication + badges */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span style={{
              fontSize: '0.9375rem',
              fontWeight: 700,
              color: '#1d1d1f',
              letterSpacing: '-0.015em',
            }}>
              {patientName}
            </span>
            <span style={{
              fontSize: '0.8125rem',
              color: '#86868b',
              letterSpacing: '-0.008em',
            }}>
              {caseData.medication.medication_name}
            </span>
          </div>

          {/* Payer badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(caseData.payer_states).map(([payer, state]) => (
              <PayerBadge key={payer} payer={payer} status={state.status} />
            ))}
          </div>
        </div>

        {/* Likelihood */}
        {likelihood !== null && (
          <div className="text-right flex-shrink-0">
            <p style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: '#aeaeb2',
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
            }}>
              Likelihood
            </p>
            <p style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              color: likelihood >= 0.6 ? '#16a34a' : likelihood >= 0.4 ? '#d97706' : '#dc2626',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              marginTop: '2px',
            }}>
              {Math.round(likelihood * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* Denial reason */}
      {denialReasons.length > 0 && (
        <p style={{
          fontSize: '0.8125rem',
          color: '#6e6e73',
          marginTop: '10px',
          letterSpacing: '-0.008em',
          lineHeight: 1.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {denialReasons[0]}
        </p>
      )}

      {/* Bottom row: deadline + updated */}
      <div className="flex items-center gap-4 mt-3">
        {appealDeadlines.length > 0 && (
          <span
            className="flex items-center gap-1"
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: hasUrgentDeadline ? '#dc2626' : '#86868b',
              letterSpacing: '-0.008em',
            }}
          >
            <Clock className="w-3 h-3" />
            Deadline: {new Date(appealDeadlines[0].deadline).toLocaleDateString()}
          </span>
        )}
        <span style={{
          fontSize: '0.75rem',
          color: '#aeaeb2',
          fontVariantNumeric: 'tabular-nums',
        }}>
          Updated {formatRelativeTime(caseData.updated_at)}
        </span>
      </div>
    </motion.button>
  )
}

// --- Main Page ---

export default function Appeals() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const { data: casesData, isLoading } = useCases({ limit: 100 })

  // Filter to appeal-eligible cases
  const appealCases = useMemo(() => {
    const cases = casesData?.cases ?? []
    return cases.filter(isAppealEligible)
  }, [casesData])

  // Apply search filter
  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return appealCases
    const q = searchQuery.toLowerCase()
    return appealCases.filter((c) => {
      const name = `${c.patient.first_name} ${c.patient.last_name}`.toLowerCase()
      const med = c.medication.medication_name.toLowerCase()
      const payers = Object.keys(c.payer_states).join(' ').toLowerCase()
      return name.includes(q) || med.includes(q) || payers.includes(q)
    })
  }, [appealCases, searchQuery])

  // Compute summary stats
  const stats = useMemo(() => {
    const total = appealCases.length
    let actionNeeded = 0
    let inProgress = 0
    let appealApproved = 0
    let appealResolved = 0

    appealCases.forEach((c) => {
      const cat = getAppealCategory(c.payer_states)
      if (cat === 'action_needed') actionNeeded++
      if (cat === 'in_progress') inProgress++

      // Count resolved appeals for success rate
      const statuses = Object.values(c.payer_states).map((s) => s.status)
      if (statuses.includes('appeal_approved')) {
        appealApproved++
        appealResolved++
      }
      if (statuses.includes('appeal_denied')) {
        appealResolved++
      }
    })

    const successRate = appealResolved > 0
      ? `${Math.round((appealApproved / appealResolved) * 100)}%`
      : 'N/A'

    return { total, actionNeeded, inProgress, successRate }
  }, [appealCases])

  if (isLoading) return <LoadingSkeleton />

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
            <div className="flex items-center justify-center gap-3 mb-3">
              <Scale className="w-8 h-8" style={{ color: '#1d1d1f' }} />
            </div>
            <h1 style={{
              fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
              fontWeight: 700,
              color: '#1d1d1f',
              letterSpacing: '-0.04em',
              lineHeight: 1.07,
            }}>
              Appeals.
            </h1>
            <p style={{
              fontSize: 'clamp(1rem, 2vw, 1.3125rem)',
              color: '#86868b',
              marginTop: '12px',
              letterSpacing: '-0.016em',
              lineHeight: 1.4,
              fontWeight: 400,
            }}>
              Monitor and manage appeal workflows
            </p>
          </motion.div>
        </div>
      </motion.section>

      {/* Content */}
      <section style={{ background: '#fff' }}>
        <div className="max-w-[980px] mx-auto px-6" style={{ paddingTop: '8px', paddingBottom: '80px' }}>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginTop: '32px' }}>
            <StatCard
              title="Total Appeals"
              value={String(stats.total)}
              subtitle="Appeal-eligible cases"
              icon={Scale}
              delay={0.2}
            />
            <StatCard
              title="Action Needed"
              value={String(stats.actionNeeded)}
              subtitle="Denied, no appeal yet"
              icon={AlertTriangle}
              delay={0.25}
            />
            <StatCard
              title="In Progress"
              value={String(stats.inProgress)}
              subtitle="Appeal submitted"
              icon={Clock}
              delay={0.3}
            />
            <StatCard
              title="Success Rate"
              value={stats.successRate}
              subtitle="Appeal approvals"
              icon={TrendingUp}
              delay={0.35}
            />
          </div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease }}
            style={{ marginTop: '32px' }}
          >
            <div
              className="flex items-center gap-2.5"
              style={{
                background: '#f5f5f7',
                borderRadius: '12px',
                padding: '10px 16px',
              }}
            >
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#aeaeb2' }} />
              <input
                type="text"
                placeholder="Search by patient, medication, or payer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.875rem',
                  color: '#1d1d1f',
                  width: '100%',
                  letterSpacing: '-0.008em',
                }}
              />
            </div>
          </motion.div>

          {/* Case Cards */}
          <div style={{ marginTop: '24px' }}>
            <AnimatePresence mode="wait">
              {filteredCases.length === 0 ? (
                <EmptyState hasSearch={searchQuery.trim().length > 0} />
              ) : (
                <motion.div
                  key="list"
                  className="space-y-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {filteredCases.map((c, i) => (
                    <AppealCaseCard
                      key={c.case_id}
                      caseData={c}
                      delay={0.45 + i * 0.05}
                      onClick={() => navigate(`/cases/${c.case_id}?step=6`)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>
    </div>
  )
}

// --- Empty State ---

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease }}
      className="text-center"
      style={{ padding: '64px 24px' }}
    >
      <div
        className="mx-auto flex items-center justify-center"
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'rgba(0, 0, 0, 0.04)',
          marginBottom: '20px',
        }}
      >
        {hasSearch ? (
          <Search className="w-6 h-6" style={{ color: '#aeaeb2' }} />
        ) : (
          <CheckCircle2 className="w-6 h-6" style={{ color: '#aeaeb2' }} />
        )}
      </div>
      <p style={{
        fontSize: '1.0625rem',
        fontWeight: 700,
        color: '#1d1d1f',
        letterSpacing: '-0.02em',
      }}>
        {hasSearch ? 'No matching cases' : 'No Appeals Needed'}
      </p>
      <p style={{
        fontSize: '0.875rem',
        color: '#86868b',
        marginTop: '8px',
        letterSpacing: '-0.008em',
        lineHeight: 1.5,
        maxWidth: '360px',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}>
        {hasSearch
          ? 'Try adjusting your search terms.'
          : 'When cases receive denials or need recovery action, they will appear here.'}
      </p>
    </motion.div>
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
        <div className="space-y-3 mt-10">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: '120px', borderRadius: '14px', background: '#f5f5f7' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
