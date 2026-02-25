import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, ChevronRight, Search, RefreshCw, AlertCircle } from 'lucide-react'
import { ENDPOINTS, QUERY_KEYS } from '@/lib/constants'
import { requestWithRetry } from '@/services/api'

// ── Types matching backend DigitizedPolicy ──────────────────────────

interface ClinicalCode {
  system: string
  code: string
  display: string
}

interface AtomicCriterion {
  criterion_id: string
  criterion_type: string
  name: string
  description: string
  is_required: boolean
  category: string
  criterion_category?: string
  extraction_confidence?: number
  validation_status?: string
}

interface CriterionGroup {
  group_id: string
  name: string
  description: string
  operator: string
  criteria: string[]
  subgroups?: CriterionGroup[]
  negated?: boolean
}

interface IndicationCriteria {
  indication_id: string
  indication_name: string
  indication_codes: ClinicalCode[]
  initial_approval_duration_months?: number
  continuation_approval_duration_months?: number
  dosing_requirements?: string
  min_age_years?: number
  max_age_years?: number
}

interface ExclusionCriteria {
  criterion_id?: string
  name: string
  description: string
}

interface StepTherapyRequirement {
  indication_name?: string
  required_drug_classes: string[]
  minimum_trials?: number
  minimum_duration_days?: number
  failure_required?: boolean
}

interface DigitizedPolicy {
  policy_id: string
  policy_number: string
  policy_title: string
  payer_name: string
  medication_name: string
  effective_date: string
  atomic_criteria: Record<string, AtomicCriterion>
  criterion_groups: Record<string, CriterionGroup>
  indications: IndicationCriteria[]
  exclusions: ExclusionCriteria[]
  step_therapy_requirements: StepTherapyRequirement[]
  extraction_quality?: string
  extraction_timestamp?: string
}

// ── Tab definitions ─────────────────────────────────────────────────

const TABS = [
  { id: 'indications', label: 'Indications' },
  { id: 'criteria', label: 'Criteria' },
  { id: 'groups', label: 'Groups' },
  { id: 'step-therapy', label: 'Step Therapy' },
  { id: 'exclusions', label: 'Exclusions' },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Helpers ─────────────────────────────────────────────────────────

function QualityBadge({ quality }: { quality?: string }) {
  if (!quality) return null
  const map: Record<string, { bg: string; text: string; label: string }> = {
    good: { bg: '#E6F4EA', text: '#1E7E34', label: 'Good' },
    needs_review: { bg: '#FFF3CD', text: '#856404', label: 'Needs Review' },
    poor: { bg: '#F8D7DA', text: '#721C24', label: 'Poor' },
  }
  const style = map[quality]
  if (!style) return null
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  )
}

function OperatorBadge({ op }: { op: string }) {
  const upper = op.toUpperCase()
  const styles: Record<string, { bg: string; color: string }> = {
    AND: { bg: '#E8F0FE', color: '#1A56DB' },
    OR:  { bg: '#FEF3E2', color: '#B45309' },
    NOT: { bg: '#F8D7DA', color: '#721C24' },
  }
  const s = styles[upper] ?? styles.OR
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {upper}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence == null) return <span className="text-xs" style={{ color: '#706E6B' }}>—</span>
  const pct = Math.round(confidence * 100)
  const color = pct >= 90 ? '#1E7E34' : pct >= 70 ? '#856404' : '#721C24'
  const bg = pct >= 90 ? '#E6F4EA' : pct >= 70 ? '#FFF3CD' : '#F8D7DA'
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: bg, color }}
    >
      {pct}%
    </span>
  )
}

// ── Loading skeleton ────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-white">
      <div className="h-9 bg-salesforce-headerRow border-b" style={{ borderColor: '#E5E5E5' }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 border-b animate-pulse" style={{ borderColor: '#E5E5E5' }}>
          <div className="w-24 h-4 bg-gray-200 rounded" />
          <div className="w-20 h-4 bg-gray-200 rounded" />
          <div className="w-32 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
          <div className="w-20 h-4 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Tab content components ──────────────────────────────────────────

function IndicationsTab({ indications }: { indications: IndicationCriteria[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {['Indication', 'ICD-10 Code(s)', 'Initial (mo)', 'Continuation (mo)', 'Min Age', 'Dosing'].map((h) => (
              <th key={h} className="sf-table-header-cell">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {indications.map((ind) => (
            <tr key={ind.indication_id} className="sf-table-row">
              <td className="sf-table-cell font-medium">{ind.indication_name}</td>
              <td className="sf-table-cell">
                {ind.indication_codes?.length
                  ? ind.indication_codes.map((c, ci) => (
                      <span key={`${c.system}-${c.code}-${ci}`} className="inline-block mr-1 px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: '#F3F3F3' }}>
                        {c.code}
                      </span>
                    ))
                  : <span style={{ color: '#706E6B' }}>—</span>}
              </td>
              <td className="sf-table-cell">{ind.initial_approval_duration_months ?? '—'}</td>
              <td className="sf-table-cell">{ind.continuation_approval_duration_months ?? '—'}</td>
              <td className="sf-table-cell">{ind.min_age_years != null ? `${ind.min_age_years}+` : '—'}</td>
              <td className="sf-table-cell" style={{ maxWidth: 280, whiteSpace: 'normal', lineHeight: 1.4 }}>
                {ind.dosing_requirements || '—'}
              </td>
            </tr>
          ))}
          {indications.length === 0 && (
            <tr><td colSpan={6} className="sf-table-cell text-center" style={{ color: '#706E6B' }}>No indications found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CriteriaTab({ criteria }: { criteria: AtomicCriterion[] }) {
  const [search, setSearch] = useState('')
  const filtered = criteria.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.criterion_id.toLowerCase().includes(search.toLowerCase()) ||
      (c.category ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: '#E5E5E5', background: '#FAFAF9' }}>
        <Search className="w-3.5 h-3.5" style={{ color: '#706E6B' }} />
        <input
          type="text"
          placeholder="Search criteria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-6 px-2 rounded text-xs border focus:outline-none focus:border-salesforce-blue transition"
          style={{ borderColor: '#E5E5E5', width: 220 }}
        />
        <span className="text-[11px] ml-auto" style={{ color: '#706E6B' }}>{filtered.length} of {criteria.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['ID', 'Name', 'Type / Category', 'Required', 'Confidence'].map((h) => (
                <th key={h} className="sf-table-header-cell">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.criterion_id} className="sf-table-row">
                <td className="sf-table-cell font-mono text-[11px]">{c.criterion_id}</td>
                <td className="sf-table-cell font-medium">{c.name}</td>
                <td className="sf-table-cell">
                  <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F3F3F3', color: '#444' }}>
                    {c.criterion_category || c.category || c.criterion_type}
                  </span>
                </td>
                <td className="sf-table-cell text-center">
                  {c.is_required
                    ? <span style={{ color: '#1E7E34', fontWeight: 700 }}>&#10003;</span>
                    : <span style={{ color: '#706E6B' }}>—</span>}
                </td>
                <td className="sf-table-cell"><ConfidenceBadge confidence={c.extraction_confidence} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="sf-table-cell text-center" style={{ color: '#706E6B' }}>No matching criteria</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupsTab({ groups }: { groups: CriterionGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {['Group ID', 'Name', 'Operator', 'Member Criteria', 'Subgroups'].map((h) => (
              <th key={h} className="sf-table-header-cell">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.group_id} className="sf-table-row">
              <td className="sf-table-cell font-mono text-[11px]">{g.group_id}</td>
              <td className="sf-table-cell font-medium">{g.name}</td>
              <td className="sf-table-cell"><OperatorBadge op={g.operator} /></td>
              <td className="sf-table-cell" style={{ maxWidth: 320, whiteSpace: 'normal', lineHeight: 1.5 }}>
                {g.criteria.length > 0 ? (
                  <span className="text-[11px] font-mono" style={{ color: '#444' }}>{g.criteria.join(', ')}</span>
                ) : (
                  <span style={{ color: '#706E6B' }}>—</span>
                )}
              </td>
              <td className="sf-table-cell">
                {g.subgroups && g.subgroups.length > 0
                  ? <span className="text-[11px]" style={{ color: '#0176D3' }}>{g.subgroups.length} subgroup{g.subgroups.length !== 1 ? 's' : ''}</span>
                  : <span style={{ color: '#706E6B' }}>—</span>}
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr><td colSpan={5} className="sf-table-cell text-center" style={{ color: '#706E6B' }}>No groups found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function StepTherapyTab({ requirements }: { requirements: StepTherapyRequirement[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {['Indication', 'Required Drug Classes', 'Min Trials', 'Min Duration', 'Failure Required'].map((h) => (
              <th key={h} className="sf-table-header-cell">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requirements.map((r, i) => (
            <tr key={i} className="sf-table-row">
              <td className="sf-table-cell font-medium">{r.indication_name ?? '—'}</td>
              <td className="sf-table-cell">
                {(r.required_drug_classes ?? []).map((cls, ci) => (
                  <span key={ci} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded text-[11px]" style={{ background: '#F3F3F3' }}>
                    {cls}
                  </span>
                ))}
              </td>
              <td className="sf-table-cell">{r.minimum_trials ?? '—'}</td>
              <td className="sf-table-cell">{r.minimum_duration_days != null ? `${r.minimum_duration_days} days` : '—'}</td>
              <td className="sf-table-cell text-center">
                {r.failure_required
                  ? <span style={{ color: '#1E7E34', fontWeight: 700 }}>&#10003;</span>
                  : <span style={{ color: '#706E6B' }}>—</span>}
              </td>
            </tr>
          ))}
          {requirements.length === 0 && (
            <tr><td colSpan={5} className="sf-table-cell text-center" style={{ color: '#706E6B' }}>No step therapy requirements</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ExclusionsTab({ exclusions }: { exclusions: ExclusionCriteria[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {['Exclusion', 'Description'].map((h) => (
              <th key={h} className="sf-table-header-cell">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {exclusions.map((ex, i) => (
            <tr key={ex.criterion_id ?? i} className="sf-table-row">
              <td className="sf-table-cell font-medium">{ex.name}</td>
              <td className="sf-table-cell" style={{ whiteSpace: 'normal', lineHeight: 1.5, maxWidth: 600 }}>
                {ex.description || '—'}
              </td>
            </tr>
          ))}
          {exclusions.length === 0 && (
            <tr><td colSpan={2} className="sf-table-cell text-center" style={{ color: '#706E6B' }}>No exclusions listed</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────

export function PolicyVault() {
  const [activeTab, setActiveTab] = useState<TabId>('indications')

  const { data: policy, isLoading, isError, error, refetch } = useQuery<DigitizedPolicy>({
    queryKey: QUERY_KEYS.policyDigitized('cigna', 'infliximab'),
    queryFn: () => requestWithRetry<DigitizedPolicy>(ENDPOINTS.policyDigitized('cigna', 'infliximab')),
    staleTime: 5 * 60 * 1000,
  })

  const criteriaList = policy ? Object.values(policy.atomic_criteria) : []
  const groupsList = policy ? Object.values(policy.criterion_groups) : []

  const tabCounts: Record<TabId, number> = policy
    ? {
        indications: policy.indications.length,
        criteria: criteriaList.length,
        groups: groupsList.length,
        'step-therapy': policy.step_therapy_requirements.length,
        exclusions: policy.exclusions.length,
      }
    : { indications: 0, criteria: 0, groups: 0, 'step-therapy': 0, exclusions: 0 }

  const stats = policy
    ? [
        { label: 'Indications', value: policy.indications.length },
        { label: 'Atomic Criteria', value: criteriaList.length },
        { label: 'Criterion Groups', value: groupsList.length },
        { label: 'Step Therapy Reqs', value: policy.step_therapy_requirements.length },
      ]
    : []

  const effectiveYear = policy?.effective_date ? new Date(policy.effective_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F3F3F3' }}>
      {/* Page Header */}
      <div className="bg-white border-b" style={{ borderColor: '#E5E5E5' }}>
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs" style={{ color: '#706E6B' }}>Policies</span>
            <ChevronRight className="w-3 h-3" style={{ color: '#706E6B' }} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" style={{ color: '#0176D3' }} />
              <h1 className="text-lg font-bold" style={{ color: '#181818', letterSpacing: '-0.02em' }}>
                {policy ? `${policy.medication_name} Policy — ${policy.payer_name}` : 'Policy Vault'}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                className="h-7 px-3 rounded text-xs font-medium border transition-colors flex items-center gap-1.5"
                style={{ color: '#0176D3', borderColor: '#0176D3' }}
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>
          </div>

          {policy && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs" style={{ color: '#706E6B' }}>
                Policy {policy.policy_number} &middot; {policy.indications.length} indications &middot; {criteriaList.length} criteria &middot; Effective {effectiveYear}
              </p>
              <QualityBadge quality={policy.extraction_quality} />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-3">
        {/* Summary stat cards */}
        {policy && (
          <div className="grid grid-cols-4 gap-3 mb-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white rounded border px-4 py-3"
                style={{ borderColor: '#E5E5E5' }}
              >
                <p className="text-2xl font-bold" style={{ color: '#181818', letterSpacing: '-0.02em' }}>{s.value}</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: '#706E6B' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar + content */}
        <div className="rounded border overflow-hidden" style={{ borderColor: '#E5E5E5' }}>
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: '#E5E5E5', background: '#FAFAF9' }}>
            {TABS.map((tab) => {
              const count = policy ? tabCounts[tab.id] : undefined
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-2 text-xs font-semibold transition-colors relative"
                  style={{
                    color: activeTab === tab.id ? '#0176D3' : '#706E6B',
                    background: activeTab === tab.id ? '#FFFFFF' : 'transparent',
                  }}
                >
                  {tab.label}
                  {count != null && (
                    <span className="ml-1.5 text-[10px] font-medium" style={{ color: activeTab === tab.id ? '#0176D3' : '#AEAEB2' }}>
                      {count}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-[2px]"
                      style={{ background: '#0176D3' }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="bg-white">
            {isLoading ? (
              <LoadingSkeleton />
            ) : isError ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" style={{ color: '#EA001E' }} />
                <p className="text-sm" style={{ color: '#EA001E' }}>
                  Failed to load policy: {(error as Error)?.message || 'Unknown error'}
                </p>
                <button
                  onClick={() => refetch()}
                  className="mt-3 text-xs font-medium px-3 py-1.5 rounded border transition-colors"
                  style={{ color: '#0176D3', borderColor: '#0176D3' }}
                >
                  Retry
                </button>
              </div>
            ) : policy ? (
              <>
                {activeTab === 'indications' && <IndicationsTab indications={policy.indications} />}
                {activeTab === 'criteria' && <CriteriaTab criteria={criteriaList} />}
                {activeTab === 'groups' && <GroupsTab groups={groupsList} />}
                {activeTab === 'step-therapy' && <StepTherapyTab requirements={policy.step_therapy_requirements} />}
                {activeTab === 'exclusions' && <ExclusionsTab exclusions={policy.exclusions} />}
              </>
            ) : null}
          </div>
        </div>

        {/* Footer info */}
        {policy && !isLoading && !isError && (
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs" style={{ color: '#706E6B' }}>
              {activeTab === 'indications' && `${policy.indications.length} indication${policy.indications.length !== 1 ? 's' : ''}`}
              {activeTab === 'criteria' && `${criteriaList.length} atomic criteria`}
              {activeTab === 'groups' && `${groupsList.length} criterion group${groupsList.length !== 1 ? 's' : ''}`}
              {activeTab === 'step-therapy' && `${policy.step_therapy_requirements.length} requirement${policy.step_therapy_requirements.length !== 1 ? 's' : ''}`}
              {activeTab === 'exclusions' && `${policy.exclusions.length} exclusion${policy.exclusions.length !== 1 ? 's' : ''}`}
            </p>
            {policy.extraction_timestamp && (
              <p className="text-xs" style={{ color: '#706E6B' }}>
                Extracted: {new Date(policy.extraction_timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PolicyVault
